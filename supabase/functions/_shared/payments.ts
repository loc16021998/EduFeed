/**
 * Tuition payments — pure helpers shared by the Edge Function (Deno) and the app (types, VietQR demo).
 * No imports and only Web-standard APIs (TextEncoder, crypto.subtle), so it runs in Deno, Node and Hermes-free tests.
 *
 *   VietQR (NAPAS 247)  buildVietQrPayload()        EMVCo QR string the parent scans in any banking app
 *   VNPay 2.1.0         buildVnpayPaymentUrl()      signed checkout URL (HMAC-SHA512 over the sorted query)
 *                       verifyVnpaySignature()      IPN / return-URL signature check (constant time)
 *                       vnpayIpnReply()             RspCode / Message VNPay expects back
 *   Bank webhook        parseBankWebhook()          SePay "biến động số dư" payload → transfer + invoice ref
 *   Receipt message     buildReceiptMessage()       ZNS template data + OA text
 */

// ─── Shared DTOs (Edge Function ⇄ app) ──────────────────────────────────────

export type InvoiceStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'VIETQR' | 'VNPAY' | 'MANUAL';

export interface PaymentInvoiceDTO {
  id: string;
  /** Transfer content / order reference, e.g. THEDU1A2B3C4D. */
  ref: string;
  status: InvoiceStatus;
  studentName: string;
  courseCode: string;
  courseName: string;
  campus: string;
  branchName: string;
  baseAmountVnd: number;
  discountVnd: number;
  discountLabel: string | null;
  amountVnd: number;
  note: string | null;
  createdAt: string;
  method: PaymentMethod | null;
  paidAt: string | null;
  paidAmountVnd: number | null;
  receiptNo: string | null;
}

export interface VietQrOption {
  bankName: string;
  accountNo: string;
  accountName: string;
  /** Exact transfer content (the invoice ref). */
  content: string;
  amountVnd: number;
  /** EMVCo payload to render as a QR code. */
  qrPayload: string;
  /** true = a bank webhook confirms transfers automatically; false = the centre confirms by hand. */
  autoConfirm: boolean;
}

export interface PaymentOptionsDTO {
  vietqr: VietQrOption | null;
  vnpay: boolean;
}

export interface PaymentInvoiceResponse {
  invoice: PaymentInvoiceDTO;
  options: PaymentOptionsDTO;
}

/** Row shape returned by payment_invoice_public(). */
export interface PublicInvoiceRow {
  id: string;
  ref: string;
  status: InvoiceStatus;
  student_name: string;
  course_code: string;
  course_name: string;
  campus_location: string;
  branch_name: string;
  base_amount_vnd: number;
  discount_vnd: number;
  discount_label: string | null;
  amount_vnd: number;
  note: string | null;
  created_at: string;
  method: PaymentMethod | null;
  paid_at: string | null;
  paid_amount_vnd: number | string | null;
  receipt_no: string | null;
}

export const toInvoiceDTO = (r: PublicInvoiceRow): PaymentInvoiceDTO => ({
  id: r.id,
  ref: r.ref,
  status: r.status,
  studentName: r.student_name,
  courseCode: r.course_code,
  courseName: r.course_name,
  campus: r.campus_location,
  branchName: r.branch_name,
  baseAmountVnd: Number(r.base_amount_vnd),
  discountVnd: Number(r.discount_vnd),
  discountLabel: r.discount_label,
  amountVnd: Number(r.amount_vnd),
  note: r.note,
  createdAt: r.created_at,
  method: r.method,
  paidAt: r.paid_at,
  paidAmountVnd: r.paid_amount_vnd === null ? null : Number(r.paid_amount_vnd),
  receiptNo: r.receipt_no,
});

// ─── Invoice reference ──────────────────────────────────────────────────────

export const INVOICE_REF_RE = /^THEDU[0-9A-F]{8}$/;

/**
 * Find the invoice ref in a bank transfer description. Banks upper/lower-case it, add their own prefixes
 * ("MBVCB.123.THEDU1A2B3C4D.CT tu…") or split it with spaces/dots, so compare on letters + digits only.
 */
export function extractInvoiceRef(text: string | null | undefined): string | null {
  if (!text) return null;
  const compact = text.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const m = /THEDU[0-9A-F]{8}/.exec(compact);
  return m ? m[0] : null;
}

// ─── VietQR (EMVCo, NAPAS 247 "QRIBFTTA" — transfer to an account) ──────────

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 upper-case hex digits — the EMVCo checksum. */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (id: string, value: string) => {
  if (value.length > 99) throw new Error(`VietQR field ${id} too long`);
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
};

export interface VietQrInput {
  /** 6-digit NAPAS bank BIN, e.g. 970436 (Vietcombank), 970422 (MB). */
  bankBin: string;
  accountNo: string;
  amountVnd: number;
  /** Transfer content: ASCII letters/digits/spaces, ≤ 25 characters to survive every bank. */
  content: string;
}

export function vietQrProblem(i: Partial<VietQrInput>): string | null {
  if (!/^\d{6}$/.test(i.bankBin ?? '')) return 'VIETQR_BANK_BIN phải là mã BIN 6 số của ngân hàng';
  if (!/^[0-9A-Za-z]{4,19}$/.test(i.accountNo ?? '')) return 'VIETQR_ACCOUNT_NO không hợp lệ';
  if (!Number.isInteger(i.amountVnd) || (i.amountVnd ?? 0) <= 0 || (i.amountVnd ?? 0) > 999_999_999_999) return 'Số tiền không hợp lệ';
  if (!/^[0-9A-Za-z ]{1,25}$/.test(i.content ?? '')) return 'Nội dung chuyển khoản không hợp lệ';
  return null;
}

/** Dynamic VietQR payload with a fixed amount and transfer content. Throws on invalid input. */
export function buildVietQrPayload(i: VietQrInput): string {
  const problem = vietQrProblem(i);
  if (problem) throw new Error(problem);
  const beneficiary = tlv('00', i.bankBin) + tlv('01', i.accountNo);
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const body =
    tlv('00', '01') + // payload format indicator
    tlv('01', '12') + // dynamic QR (one payment)
    tlv('38', merchant) +
    tlv('53', '704') + // VND
    tlv('54', String(i.amountVnd)) +
    tlv('58', 'VN') +
    tlv('62', tlv('08', i.content)) +
    '6304';
  return body + crc16Ccitt(body);
}

// ─── VNPay 2.1.0 ────────────────────────────────────────────────────────────

export const VNPAY_SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** yyyyMMddHHmmss in Vietnam time (GMT+7), as VNPay requires. */
export function vnpDate(d: Date): string {
  const v = new Date(d.getTime() + 7 * 3600_000);
  return `${v.getUTCFullYear()}${pad2(v.getUTCMonth() + 1)}${pad2(v.getUTCDate())}${pad2(v.getUTCHours())}${pad2(v.getUTCMinutes())}${pad2(v.getUTCSeconds())}`;
}

/** VNPay's canonical form: keys sorted, keys and values URL-encoded with spaces as '+'. Signs and builds the URL. */
export function vnpCanonicalQuery(params: Record<string, string>): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${enc(k)}=${enc(String(params[k]))}`)
    .join('&');
}

export async function hmacSha512Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings (case-insensitive). */
function sameHex(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

/** Remove Vietnamese diacritics / symbols — VNPay order info must be plain ASCII. */
export const asciiOrderInfo = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[–—]/g, '-')
    .replace(/[^0-9A-Za-z ,.:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);

export interface VnpayOrder {
  txnRef: string;
  amountVnd: number;
  orderInfo: string;
  returnUrl: string;
  ipAddr: string;
  now?: Date;
  expireMinutes?: number;
  locale?: 'vn' | 'en';
}

export async function buildVnpayPaymentUrl(cfg: VnpayConfig, o: VnpayOrder): Promise<string> {
  if (!cfg.tmnCode || !cfg.hashSecret) throw new Error('VNPay chưa được cấu hình');
  if (!Number.isInteger(o.amountVnd) || o.amountVnd < 5000 || o.amountVnd >= 1_000_000_000) throw new Error('Số tiền VNPay không hợp lệ');
  if (!/^[0-9A-Za-z]{1,100}$/.test(o.txnRef)) throw new Error('Mã giao dịch không hợp lệ');
  if (!/^https?:\/\//.test(o.returnUrl)) throw new Error('Return URL không hợp lệ');
  const now = o.now ?? new Date();
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: cfg.tmnCode,
    vnp_Amount: String(o.amountVnd * 100), // VNPay amounts are in 1/100 VND
    vnp_CurrCode: 'VND',
    vnp_TxnRef: o.txnRef,
    vnp_OrderInfo: asciiOrderInfo(o.orderInfo),
    vnp_OrderType: 'other',
    vnp_Locale: o.locale ?? 'vn',
    vnp_ReturnUrl: o.returnUrl,
    vnp_IpAddr: o.ipAddr || '127.0.0.1',
    vnp_CreateDate: vnpDate(now),
    vnp_ExpireDate: vnpDate(new Date(now.getTime() + (o.expireMinutes ?? 15) * 60_000)),
  };
  const query = vnpCanonicalQuery(params);
  const hash = await hmacSha512Hex(cfg.hashSecret, query);
  return `${cfg.payUrl}?${query}&vnp_SecureHash=${hash}`;
}

/** Verify the vnp_SecureHash of IPN / return-URL parameters (already URL-decoded). */
export async function verifyVnpaySignature(params: Record<string, string>, hashSecret: string): Promise<boolean> {
  const given = params.vnp_SecureHash ?? '';
  if (!hashSecret || !/^[0-9a-fA-F]{128}$/.test(given)) return false;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType') rest[k] = v;
  }
  return sameHex(await hmacSha512Hex(hashSecret, vnpCanonicalQuery(rest)), given);
}

/** Outcome of payment_apply() (see the SQL migration). */
export type ApplyResult = 'PAID' | 'ALREADY_PAID' | 'DUPLICATE' | 'NOT_FOUND' | 'AMOUNT_MISMATCH' | 'UNDERPAID' | 'INVOICE_CANCELLED' | 'FAILED';

/** What VNPay expects back from the IPN URL. Anything but 00/02 makes VNPay retry. */
export function vnpayIpnReply(r: ApplyResult | 'INVALID_SIGNATURE' | 'ERROR'): { RspCode: string; Message: string } {
  switch (r) {
    case 'PAID':
    case 'FAILED': // a failed payment is still "received and recorded"
      return { RspCode: '00', Message: 'Confirm Success' };
    case 'ALREADY_PAID':
    case 'DUPLICATE':
    case 'INVOICE_CANCELLED':
      return { RspCode: '02', Message: 'Order already confirmed' };
    case 'NOT_FOUND':
      return { RspCode: '01', Message: 'Order not found' };
    case 'AMOUNT_MISMATCH':
    case 'UNDERPAID':
      return { RspCode: '04', Message: 'Invalid amount' };
    case 'INVALID_SIGNATURE':
      return { RspCode: '97', Message: 'Invalid signature' };
    default:
      return { RspCode: '99', Message: 'Unknown error' };
  }
}

/** VNPay ref "<invoice ref>V<attempt>" → invoice ref. */
export const invoiceRefFromTxnRef = (txnRef: string) => {
  const m = /^(THEDU[0-9A-F]{8})V\d{1,3}$/.exec(txnRef ?? '');
  return m ? m[1] : null;
};

// ─── Bank webhook (SePay) ───────────────────────────────────────────────────

export interface BankTransfer {
  txnId: string;
  amountVnd: number;
  ref: string | null;
  accountNo: string;
  content: string;
  /** ISO time of the transfer. */
  at: string | null;
}

/**
 * SePay "biến động số dư" webhook body → incoming transfer.
 * https://docs.sepay.vn — fields: id, gateway, transactionDate ("2026-11-16 14:02:37", Vietnam time),
 * accountNumber, code, content, transferType ("in" | "out"), transferAmount, referenceCode, description.
 */
export function parseBankWebhook(body: unknown): { transfer: BankTransfer } | { ignore: string } | { invalid: string } {
  if (!body || typeof body !== 'object') return { invalid: 'body' };
  const b = body as Record<string, unknown>;
  const id = b.id;
  if ((typeof id !== 'number' && typeof id !== 'string') || String(id).trim() === '') return { invalid: 'id' };
  if (b.transferType !== 'in') return { ignore: 'Không phải tiền vào' };
  const amount = Number(b.transferAmount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return { invalid: 'transferAmount' };
  const content = [b.content, b.description].filter((x) => typeof x === 'string').join(' ');
  const ref = (typeof b.code === 'string' && extractInvoiceRef(b.code)) || extractInvoiceRef(content);
  const date = typeof b.transactionDate === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(b.transactionDate)
    ? new Date(`${b.transactionDate.replace(' ', 'T')}+07:00`).toISOString()
    : null;
  return {
    transfer: {
      txnId: String(id),
      amountVnd: amount,
      ref,
      accountNo: typeof b.accountNumber === 'string' ? b.accountNumber : String(b.accountNumber ?? ''),
      content: content.slice(0, 300),
      at: date,
    },
  };
}

/** SePay sends "Authorization: Apikey <key>". */
export function bankWebhookKey(authorization: string | null): string {
  const m = /^Apikey\s+(.+)$/i.exec(authorization ?? '');
  return m ? m[1].trim() : '';
}

// ─── Receipt message ────────────────────────────────────────────────────────

export interface ReceiptContext {
  invoice: {
    id: string;
    ref: string;
    status: InvoiceStatus;
    amount_vnd: number;
    paid_amount_vnd: number | string | null;
    paid_at: string | null;
    receipt_no: string | null;
    method: PaymentMethod | null;
    student_name: string;
    notified_at: string | null;
  };
  course_name: string;
  branch_name: string;
  family: { parent_name: string; phone_number: string; zalo_user_id: string | null } | null;
}

export const formatVnd = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;

/** dd/mm/yyyy HH:mm in Vietnam time. */
export function vnDateTime(iso: string): string {
  const v = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return `${pad2(v.getUTCDate())}/${pad2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())}`;
}

const METHOD_LABEL: Record<PaymentMethod, string> = { VIETQR: 'Chuyển khoản VietQR', VNPAY: 'VNPay', MANUAL: 'Tại trung tâm' };

/** ZNS template params (C_NAME, STUDENT_NAME, COURSE, AMOUNT, RECEIPT_NO, PAID_AT, RECEIPT_URL) + an OA text fallback. */
export function buildReceiptMessage(ctx: ReceiptContext, webUrl: string): { data: Record<string, string>; text: string } | { missing: string } {
  const inv = ctx.invoice;
  if (inv.status !== 'PAID' || !inv.receipt_no || !inv.paid_at) return { missing: 'hóa đơn chưa thanh toán' };
  if (!ctx.family) return { missing: 'thông tin phụ huynh' };
  const amount = formatVnd(Number(inv.paid_amount_vnd ?? inv.amount_vnd));
  const when = vnDateTime(inv.paid_at);
  const url = webUrl ? `${webUrl.replace(/\/+$/, '')}/thanh-toan/${inv.id}` : '';
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return {
    data: {
      C_NAME: cut(ctx.family.parent_name, 30),
      STUDENT_NAME: cut(inv.student_name, 30),
      COURSE: cut(ctx.course_name, 100),
      AMOUNT: amount,
      RECEIPT_NO: inv.receipt_no,
      PAID_AT: when,
      RECEIPT_URL: url || inv.receipt_no,
    },
    text:
      `✅ TH EDU đã nhận học phí ${amount} cho bé ${inv.student_name} — khóa ${ctx.course_name} (${ctx.branch_name}).\n` +
      `Biên lai: ${inv.receipt_no} · ${when}${inv.method ? ` · ${METHOD_LABEL[inv.method]}` : ''}\n` +
      (url ? `🧾 Xem biên lai điện tử: ${url}` : ''),
  };
}
