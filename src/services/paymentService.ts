/**
 * Tuition payments (app side).
 *
 * Parents (anyone with the invoice link /thanh-toan/<id>):
 *   fetchInvoice()        invoice + available methods       GET  /api/payment/invoices/:id
 *   startVnpayCheckout()  signed VNPay checkout URL         POST /api/payment/invoices/:id/vnpay
 *   watchInvoice()        status polling until PAID / CANCELLED (pauses in the background)
 * Admin:
 *   getInvoiceDraft / createInvoice / cancelInvoice / confirmInvoiceManually   (database functions, is_admin())
 *
 * Every secret (VNPay hash key, bank webhook key) lives in the Edge Function. The app never decides that
 * an invoice is paid: it only shows what the server says (updated by the verified gateway / bank webhook).
 * Without Supabase (dev / demo) everything runs on in-memory sample data, clearly labelled.
 */
import { AppState, Platform } from 'react-native';

import { ENV } from '@/config/env';
import { supabase } from '@/lib/supabase';
import { sleep, uuidv4 } from '@/utils/helpers';

import {
  buildVietQrPayload,
  toInvoiceDTO,
  type InvoiceStatus,
  type PaymentInvoiceDTO,
  type PaymentInvoiceResponse,
  type PaymentMethod,
  type PublicInvoiceRow,
} from '../../supabase/functions/_shared/payments';
import { ApiError, callApi } from './apiClient';

export type { InvoiceStatus, PaymentInvoiceDTO, PaymentInvoiceResponse, PaymentMethod };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (hint === 'RATE_LIMITED') return new ApiError(error.message, 'RATE_LIMITED', 429);
  if (/payment_|tuition_invoices/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có chức năng học phí. Chạy supabase/sql/upgrades/20261123090000_tuition_payments.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

/** Public link to send the parent (web app address if configured, else this site). */
export function paymentLink(invoiceId: string): string {
  const base = ENV.webUrl || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'thedu:/');
  return `${base}/thanh-toan/${invoiceId}`;
}

// ─── Parents ────────────────────────────────────────────────────────────────

export async function fetchInvoice(id: string): Promise<PaymentInvoiceResponse | null> {
  if (!UUID_RE.test(id)) return null;
  if (!supabase) return demoFetch(id);
  try {
    return await callApi<PaymentInvoiceResponse>(`payment/invoices/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NOT_FOUND' && e.status === 404) return null;
    // Edge Function not deployed: show the invoice; online methods need the function.
    if (!(e instanceof ApiError && (e.code === 'FUNCTION_UNAVAILABLE' || e.code === 'NETWORK'))) throw e;
  }
  const invoice = await fetchInvoiceStatus(id);
  return invoice ? { invoice, options: { vietqr: null, vnpay: false } } : null;
}

/** Lightweight status read (database function, no Edge Function round trip). */
export async function fetchInvoiceStatus(id: string): Promise<PaymentInvoiceDTO | null> {
  if (!supabase) return (await demoFetch(id))?.invoice ?? null;
  const { data, error } = await supabase.rpc('payment_invoice_public' as never, { p_id: id } as never);
  if (error) throw mapDbError(error);
  return data ? toInvoiceDTO(data as unknown as PublicInvoiceRow) : null;
}

export async function startVnpayCheckout(id: string): Promise<string> {
  if (!supabase) throw new ApiError('Dữ liệu mẫu: chưa kết nối cổng VNPay.', 'NOT_CONFIGURED');
  const { url } = await callApi<{ url: string }>(`payment/invoices/${id}/vnpay`, { method: 'POST', body: {} });
  // Only ever send the parent to VNPay itself.
  if (!/^https:\/\/([a-z0-9-]+\.)*vnpayment\.vn\//i.test(url)) throw new ApiError('Liên kết thanh toán không hợp lệ', 'INTERNAL');
  return url;
}

/**
 * Poll the invoice until it is PAID or CANCELLED. Fast at first (the bank / VNPay usually confirm within
 * seconds), then slower; pauses while the app is in the background or the tab is hidden and checks again
 * as soon as it is back. Returns a stop function.
 */
export function watchInvoice(
  id: string,
  onUpdate: (inv: PaymentInvoiceDTO) => void,
  opts: { onTimeout?: () => void; maxMinutes?: number } = {},
): () => void {
  const started = Date.now();
  const maxMs = (opts.maxMinutes ?? 30) * 60_000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let failures = 0;

  const visible = () =>
    AppState.currentState === 'active' && (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const delay = () => {
    const age = Date.now() - started;
    const base = age < 2 * 60_000 ? 3000 : age < 10 * 60_000 ? 6000 : 15_000;
    return Math.min(base * 2 ** Math.min(failures, 3), 60_000); // back off on network errors
  };
  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delay());
  };
  const tick = async () => {
    if (stopped) return;
    if (Date.now() - started > maxMs) {
      stopped = true;
      opts.onTimeout?.();
      return;
    }
    if (!visible() || inFlight) return schedule();
    inFlight = true;
    try {
      const inv = await fetchInvoiceStatus(id);
      failures = 0;
      if (inv && !stopped) {
        onUpdate(inv);
        if (inv.status !== 'PENDING_PAYMENT') {
          stopped = true;
          return;
        }
      }
    } catch {
      failures++;
    } finally {
      inFlight = false;
    }
    schedule();
  };

  const onVisible = () => {
    if (!stopped && visible()) {
      if (timer) clearTimeout(timer);
      tick();
    }
  };
  const sub = AppState.addEventListener('change', onVisible);
  const web = Platform.OS === 'web' && typeof document !== 'undefined';
  if (web) document.addEventListener('visibilitychange', onVisible);
  schedule();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    sub.remove();
    if (web) document.removeEventListener('visibilitychange', onVisible);
  };
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export interface InvoiceDraft {
  /** The course's monthly fee from "Học phí" settings; null = not set. */
  baseAmountVnd: number | null;
  /** The family already completed a course at TH EDU. */
  isAlumni: boolean;
  openInvoiceId: string | null;
}

export interface CreateInvoiceInput {
  enrollmentId: string;
  baseAmountVnd: number;
  discountVnd?: number;
  discountLabel?: string;
  note?: string;
}

export async function getInvoiceDraft(enrollmentId: string): Promise<InvoiceDraft> {
  if (!supabase) {
    await sleep(150);
    return { baseAmountVnd: 1_500_000, isAlumni: true, openInvoiceId: [...demoInvoices().values()].find((i) => i.enrollmentId === enrollmentId && i.dto.status === 'PENDING_PAYMENT')?.dto.id ?? null };
  }
  const { data, error } = await supabase.rpc('payment_invoice_draft' as never, { p_enrollment_id: enrollmentId } as never);
  if (error) throw mapDbError(error);
  const d = data as unknown as { base_amount_vnd: number | null; is_alumni: boolean; open_invoice_id: string | null };
  return { baseAmountVnd: d.base_amount_vnd, isAlumni: d.is_alumni, openInvoiceId: d.open_invoice_id };
}

/** Same rules as payment_create_invoice() — checked here first for instant feedback. */
export function invoiceInputProblem(i: CreateInvoiceInput): { field: string; message: string } | null {
  if (!Number.isInteger(i.baseAmountVnd) || i.baseAmountVnd < 10_000 || i.baseAmountVnd > 100_000_000) {
    return { field: 'baseAmountVnd', message: 'Học phí phải từ 10.000đ đến 100.000.000đ' };
  }
  const d = i.discountVnd ?? 0;
  if (!Number.isInteger(d) || d < 0 || d >= i.baseAmountVnd) return { field: 'discountVnd', message: 'Ưu đãi phải nhỏ hơn học phí' };
  const label = (i.discountLabel ?? '').trim();
  if (d > 0 && (label.length < 2 || label.length > 80)) return { field: 'discountLabel', message: 'Ghi rõ tên ưu đãi (2–80 ký tự)' };
  if ((i.note ?? '').trim().length > 200) return { field: 'note', message: 'Ghi chú tối đa 200 ký tự' };
  return null;
}

export async function createInvoice(i: CreateInvoiceInput): Promise<{ id: string; ref: string; amountVnd: number }> {
  const p = invoiceInputProblem(i);
  if (p) throw new ApiError(p.message, 'VALIDATION', 422, p.field);
  if (!supabase) return demoCreate(i);
  const { data, error } = await supabase.rpc('payment_create_invoice' as never, {
    p_enrollment_id: i.enrollmentId,
    p_base_amount_vnd: i.baseAmountVnd,
    p_discount_vnd: i.discountVnd ?? 0,
    p_discount_label: i.discountLabel?.trim() || null,
    p_note: i.note?.trim() || null,
  } as never);
  if (error) throw mapDbError(error);
  const r = data as unknown as { id: string; ref: string; amount_vnd: number };
  return { id: r.id, ref: r.ref, amountVnd: r.amount_vnd };
}

export async function cancelInvoice(id: string): Promise<void> {
  if (!supabase) return demoPatch(id, (d) => (d.status === 'PENDING_PAYMENT' ? { ...d, status: 'CANCELLED' } : d));
  const { error } = await supabase.rpc('payment_cancel_invoice' as never, { p_invoice_id: id } as never);
  if (error) throw mapDbError(error);
}

export async function confirmInvoiceManually(id: string, note: string): Promise<void> {
  if (note.trim().length < 5 || note.trim().length > 200) {
    throw new ApiError('Ghi rõ cách nhận tiền (5–200 ký tự), ví dụ "Tiền mặt tại quầy"', 'VALIDATION', 422, 'note');
  }
  if (!supabase) return demoMarkPaid(id, 'MANUAL');
  const { data, error } = await supabase.rpc('payment_confirm_manual' as never, { p_invoice_id: id, p_note: note.trim() } as never);
  if (error) throw mapDbError(error);
  if ((data as unknown as { result: string }).result !== 'PAID') throw new ApiError('Không xác nhận được hóa đơn này', 'CONFLICT', 409);
}

// ─── Demo mode (no Supabase): in-memory, labelled "Dữ liệu mẫu" on screen ───

export const DEMO_INVOICE_ID = '00000000-0000-4000-8000-00000000d001';
const DEMO_BANK = { bankName: 'Ngân hàng mẫu', bankBin: '970436', accountNo: '0000000000', accountName: 'TH EDU (TÀI KHOẢN MẪU)' };

interface DemoInvoice {
  enrollmentId: string;
  dto: PaymentInvoiceDTO;
}
let demoStore: Map<string, DemoInvoice> | null = null;

function demoInvoices(): Map<string, DemoInvoice> {
  if (demoStore) return demoStore;
  demoStore = new Map();
  demoStore.set(DEMO_INVOICE_ID, {
    enrollmentId: 'demo',
    dto: {
      id: DEMO_INVOICE_ID,
      ref: 'THEDU00D0D001',
      status: 'PENDING_PAYMENT',
      studentName: 'Gia Bảo (mẫu)',
      courseCode: 'TIEN_TIEU_HOC',
      courseName: 'Tiền tiểu học',
      campus: 'XA_LA',
      branchName: 'Cơ sở Xa La',
      baseAmountVnd: 1_500_000,
      discountVnd: 200_000,
      discountLabel: 'Ưu đãi học viên cũ (mẫu)',
      amountVnd: 1_300_000,
      note: null,
      createdAt: new Date().toISOString(),
      method: null,
      paidAt: null,
      paidAmountVnd: null,
      receiptNo: null,
    },
  });
  return demoStore;
}

async function demoFetch(id: string): Promise<PaymentInvoiceResponse | null> {
  await sleep(200);
  const inv = demoInvoices().get(id);
  if (!inv) return null;
  const d = inv.dto;
  return {
    invoice: { ...d },
    options:
      d.status === 'PENDING_PAYMENT'
        ? {
            vietqr: {
              bankName: DEMO_BANK.bankName,
              accountNo: DEMO_BANK.accountNo,
              accountName: DEMO_BANK.accountName,
              content: d.ref,
              amountVnd: d.amountVnd,
              qrPayload: buildVietQrPayload({ bankBin: DEMO_BANK.bankBin, accountNo: DEMO_BANK.accountNo, amountVnd: d.amountVnd, content: d.ref }),
              autoConfirm: true,
            },
            vnpay: true,
          }
        : { vietqr: null, vnpay: false },
  };
}

async function demoCreate(i: CreateInvoiceInput) {
  await sleep(200);
  for (const v of demoInvoices().values()) {
    if (v.enrollmentId === i.enrollmentId && v.dto.status === 'PENDING_PAYMENT') {
      throw new ApiError('Học viên đang có hóa đơn chờ thanh toán — hủy hóa đơn đó trước khi lập hóa đơn mới', 'CONFLICT', 409);
    }
  }
  const id = uuidv4();
  const ref = `THEDU${Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0')}`;
  const discount = i.discountVnd ?? 0;
  demoInvoices().set(id, {
    enrollmentId: i.enrollmentId,
    dto: {
      id, ref, status: 'PENDING_PAYMENT', studentName: 'Học viên (mẫu)', courseCode: 'TIEN_TIEU_HOC', courseName: 'Khóa học (mẫu)', campus: 'XA_LA', branchName: 'Cơ sở Xa La',
      baseAmountVnd: i.baseAmountVnd, discountVnd: discount, discountLabel: discount ? i.discountLabel?.trim() ?? null : null, amountVnd: i.baseAmountVnd - discount,
      note: i.note?.trim() || null, createdAt: new Date().toISOString(), method: null, paidAt: null, paidAmountVnd: null, receiptNo: null,
    },
  });
  return { id, ref, amountVnd: i.baseAmountVnd - discount };
}

async function demoPatch(id: string, fn: (d: PaymentInvoiceDTO) => PaymentInvoiceDTO) {
  await sleep(150);
  const v = demoInvoices().get(id);
  if (!v) throw new ApiError('Không tìm thấy hóa đơn', 'NOT_FOUND', 404);
  v.dto = fn(v.dto);
}

let demoReceiptSeq = 0;
/** Demo only: what the bank webhook / VNPay IPN would do on the server. */
export async function demoMarkPaid(id: string, method: PaymentMethod): Promise<void> {
  if (supabase) throw new ApiError('Chỉ dùng trong chế độ dữ liệu mẫu', 'FORBIDDEN', 403);
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  await demoPatch(id, (d) =>
    d.status !== 'PENDING_PAYMENT'
      ? d
      : { ...d, status: 'PAID', method, paidAt: now.toISOString(), paidAmountVnd: d.amountVnd, receiptNo: `BL${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}-${String(++demoReceiptSeq).padStart(5, '0')}` },
  );
}

/** Demo enrollments: latest invoice per enrollment (for the staff list). */
export function demoInvoiceFor(enrollmentId: string): PaymentInvoiceDTO | null {
  if (supabase) return null;
  const list = [...demoInvoices().values()].filter((v) => v.enrollmentId === enrollmentId).map((v) => v.dto);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
