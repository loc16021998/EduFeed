/**
 * Instant Payment Notification listener — GET|POST /api/payment/ipn.
 *
 * One URL for both sources, told apart by their content:
 *   • VNPay IPN      query (GET) or form/JSON body carrying vnp_SecureHash → HMAC-SHA512 signature check
 *   • Bank webhook   SePay "biến động số dư" JSON, header "Authorization: Apikey <BANK_WEBHOOK_API_KEY>"
 *
 * Nothing is trusted before verification. A verified event goes to payment_apply() (SQL), which is the
 * single place an invoice becomes PAID: idempotent per provider transaction, amount-checked, receipt
 * number issued, enrollment → PAID. The confirmation message to the parent runs after the reply.
 *
 * Pure orchestration with injected I/O, so it is unit-tested without Deno or a database.
 */
import {
  bankWebhookKey,
  invoiceRefFromTxnRef,
  parseBankWebhook,
  verifyVnpaySignature,
  vnpayIpnReply,
  type ApplyResult,
} from './payments.ts';
import { timingSafeEqual } from './security.ts';

export interface PaymentIpnConfig {
  vnpayTmnCode: string;
  vnpayHashSecret: string;
  /** Shared key the bank-notification service sends (SePay: "Authorization: Apikey …"). */
  bankWebhookKey: string;
  /** Receiving account; transfers into any other account are ignored. Empty = don't check. */
  bankAccountNo: string;
}

export interface ApplyArgs {
  provider: 'VNPAY' | 'BANK';
  txnId: string;
  ref: string | null;
  amountVnd: number;
  success: boolean;
  payload: Record<string, unknown>;
  paidAt: string | null;
  /** VNPay: the amount is part of the signed order and must match exactly. */
  exact: boolean;
}

export interface PaymentIpnDeps {
  apply(a: ApplyArgs): Promise<{ result: ApplyResult; invoice_id?: string | null }>;
  /** Called once per invoice that just became PAID (send the receipt message, …). Must not throw. */
  onPaid(invoiceId: string): void;
  log?(event: string, data: Record<string, unknown>): void;
}

export interface IpnRequest {
  method: string;
  query: URLSearchParams;
  headers: Headers;
  rawBody: string;
}

export interface IpnResponse {
  status: number;
  body: unknown;
}

/** VNPay PayDate yyyyMMddHHmmss (GMT+7) → ISO. */
function vnpPayDateIso(s: string | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function vnpParams(req: IpnRequest): Record<string, string> | null {
  const fromQuery = Object.fromEntries(req.query.entries());
  if (fromQuery.vnp_SecureHash) return fromQuery;
  if (req.method !== 'POST' || !req.rawBody) return null;
  const type = req.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const b = JSON.parse(req.rawBody) as Record<string, unknown>;
      if (b && typeof b === 'object' && typeof b.vnp_SecureHash === 'string') {
        return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)]));
      }
    } else if (type.includes('application/x-www-form-urlencoded')) {
      const f = Object.fromEntries(new URLSearchParams(req.rawBody).entries());
      if (f.vnp_SecureHash) return f;
    }
  } catch {
    // not VNPay
  }
  return null;
}

export async function handlePaymentIpn(req: IpnRequest, cfg: PaymentIpnConfig, deps: PaymentIpnDeps): Promise<IpnResponse> {
  const log = deps.log ?? (() => {});
  const vnp = vnpParams(req);
  if (vnp) return handleVnpay(vnp, cfg, deps, log);
  if (req.method !== 'POST') return { status: 405, body: { success: false, message: 'POST only' } };
  return handleBank(req, cfg, deps, log);
}

async function handleVnpay(p: Record<string, string>, cfg: PaymentIpnConfig, deps: PaymentIpnDeps, log: NonNullable<PaymentIpnDeps['log']>): Promise<IpnResponse> {
  if (!cfg.vnpayHashSecret || !cfg.vnpayTmnCode) {
    log('vnpay.not_configured', {});
    return { status: 200, body: vnpayIpnReply('ERROR') };
  }
  if (!(await verifyVnpaySignature(p, cfg.vnpayHashSecret)) || p.vnp_TmnCode !== cfg.vnpayTmnCode) {
    log('vnpay.bad_signature', { txnRef: p.vnp_TxnRef ?? null });
    return { status: 200, body: vnpayIpnReply('INVALID_SIGNATURE') };
  }
  const ref = invoiceRefFromTxnRef(p.vnp_TxnRef);
  const raw = Number(p.vnp_Amount);
  if (!ref) return { status: 200, body: vnpayIpnReply('NOT_FOUND') };
  if (!Number.isInteger(raw) || raw <= 0 || raw % 100 !== 0) return { status: 200, body: vnpayIpnReply('AMOUNT_MISMATCH') };

  const success = p.vnp_ResponseCode === '00' && p.vnp_TransactionStatus === '00';
  const { vnp_SecureHash: _h, vnp_SecureHashType: _t, ...payload } = p;
  try {
    const r = await deps.apply({
      provider: 'VNPAY',
      // A failed attempt and the later successful one share vnp_TxnRef but not the response code.
      txnId: `${p.vnp_TxnRef}:${p.vnp_TransactionNo ?? '0'}:${p.vnp_ResponseCode ?? ''}`,
      ref,
      amountVnd: raw / 100,
      success,
      payload,
      paidAt: vnpPayDateIso(p.vnp_PayDate),
      exact: true,
    });
    log('vnpay.applied', { ref, result: r.result });
    if (r.result === 'PAID' && r.invoice_id) deps.onPaid(r.invoice_id);
    return { status: 200, body: vnpayIpnReply(r.result) };
  } catch (e) {
    log('vnpay.error', { ref, error: e instanceof Error ? e.message : String(e) });
    return { status: 200, body: vnpayIpnReply('ERROR') }; // 99 → VNPay retries
  }
}

async function handleBank(req: IpnRequest, cfg: PaymentIpnConfig, deps: PaymentIpnDeps, log: NonNullable<PaymentIpnDeps['log']>): Promise<IpnResponse> {
  if (!cfg.bankWebhookKey || cfg.bankWebhookKey.length < 16) {
    return { status: 503, body: { success: false, message: 'Bank webhook not configured' } };
  }
  if (!(await timingSafeEqual(bankWebhookKey(req.headers.get('authorization')), cfg.bankWebhookKey))) {
    log('bank.unauthorized', {});
    return { status: 401, body: { success: false, message: 'Unauthorized' } };
  }
  let body: unknown;
  try {
    body = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, body: { success: false, message: 'Invalid JSON' } };
  }
  const parsed = parseBankWebhook(body);
  if ('invalid' in parsed) return { status: 400, body: { success: false, message: `Invalid field: ${parsed.invalid}` } };
  if ('ignore' in parsed) return { status: 200, body: { success: true, ignored: parsed.ignore } };
  const t = parsed.transfer;
  if (cfg.bankAccountNo && t.accountNo && t.accountNo !== cfg.bankAccountNo) {
    return { status: 200, body: { success: true, ignored: 'Tài khoản khác' } };
  }
  try {
    // Transfers without a recognisable ref are still recorded (result NOT_FOUND) for the admin to match.
    const r = await deps.apply({
      provider: 'BANK',
      txnId: t.txnId,
      ref: t.ref,
      amountVnd: t.amountVnd,
      success: true,
      payload: { content: t.content, account: t.accountNo, at: t.at },
      paidAt: t.at,
      exact: false,
    });
    log('bank.applied', { ref: t.ref, result: r.result });
    if (r.result === 'PAID' && r.invoice_id) deps.onPaid(r.invoice_id);
    return { status: 200, body: { success: true, result: r.result } };
  } catch (e) {
    log('bank.error', { ref: t.ref, error: e instanceof Error ? e.message : String(e) });
    return { status: 500, body: { success: false, message: 'Temporary error' } }; // the service retries
  }
}
