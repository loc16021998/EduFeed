/**
 * Teacher / staff self-registration + admin approval.
 *
 *  - registerStaff(): supabase.auth.signUp() on a throw-away client (never touches the session of whoever is
 *    signed in on this device) with user_metadata.signup_kind = 'staff'. A database trigger files a PENDING
 *    request; the account has no role — and therefore no access — until an admin approves it.
 *  - Admins: listStaffRequests() / decideStaffRequest() (database functions, admin only).
 *  - Applicants who sign in before approval: myStaffRequest() tells them where their request stands.
 *
 * Needs Supabase → Authentication → "Allow new users to sign up" = ON (see supabase/README.md).
 * Without Supabase (dev), an in-memory list is used.
 */
import { createClient } from '@supabase/supabase-js';

import { ENV } from '@/config/env';
import { supabase } from '@/lib/supabase';
import { isValidVNPhone, normalizePhone, sleep, uuidv4 } from '@/utils/helpers';

import { staffPasswordProblem } from '../../supabase/functions/_shared/contracts';
import { ApiError } from './apiClient';

export type StaffRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface StaffRequest {
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  note: string | null;
  status: StaffRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  emailConfirmed: boolean;
}

export interface RegisterStaffInput {
  displayName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  note?: string;
}

export type RegisterErrors = Partial<Record<keyof RegisterStaffInput | 'form', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Field errors for the registration form (empty object = valid). */
export function validateRegistration(i: RegisterStaffInput): RegisterErrors {
  const e: RegisterErrors = {};
  const name = i.displayName.trim();
  if (name.length < 2 || name.length > 60 || /\d/.test(name)) e.displayName = 'Nhập họ tên (2–60 ký tự, không có số)';
  if (!EMAIL_RE.test(i.email.trim())) e.email = 'Email không hợp lệ';
  if (!isValidVNPhone(i.phone)) e.phone = 'Số điện thoại không hợp lệ (VD: 0912 345 678)';
  const pw = staffPasswordProblem(i.password);
  if (pw) e.password = pw;
  else if (i.password !== i.confirmPassword) e.confirmPassword = 'Mật khẩu nhập lại không khớp';
  if ((i.note ?? '').length > 300) e.note = 'Tối đa 300 ký tự';
  return e;
}

export interface RegisterResult {
  /** Supabase sent a confirmation e-mail that must be clicked before signing in. */
  needsEmailConfirmation: boolean;
}

export async function registerStaff(input: RegisterStaffInput): Promise<RegisterResult> {
  const errors = validateRegistration(input);
  const first = Object.entries(errors)[0];
  if (first) throw new ApiError(first[1]!, 'VALIDATION', 422, first[0]);

  const email = input.email.trim().toLowerCase();
  const meta = {
    signup_kind: 'staff',
    display_name: input.displayName.trim(),
    phone: normalizePhone(input.phone),
    note: (input.note ?? '').trim(),
  };

  if (!supabase) return mockRegister(email, meta);

  // Separate client without storage: signing up must not replace the session of whoever uses this device.
  const signupClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'thedu-signup' },
  });
  const { data, error } = await signupClient.auth.signUp({
    email,
    password: input.password,
    options: {
      data: meta,
      ...(ENV.webUrl ? { emailRedirectTo: `${ENV.webUrl}/quan-ly/dang-nhap` } : {}),
    },
  });
  if (error) {
    const m = error.message;
    if (/not allowed|disabled/i.test(m)) {
      throw new ApiError('Trung tâm chưa mở đăng ký tài khoản. Liên hệ quản trị viên để được tạo tài khoản.', 'FORBIDDEN', 403);
    }
    if (/already|registered|exists/i.test(m)) throw new ApiError('Email này đã có tài khoản. Hãy đăng nhập.', 'CONFLICT', 409, 'email');
    if (/password/i.test(m)) throw new ApiError('Mật khẩu chưa đủ mạnh', 'VALIDATION', 422, 'password');
    if (/rate|too many|security purposes/i.test(m)) throw new ApiError('Thử lại quá nhiều lần. Vui lòng đợi vài phút.', 'RATE_LIMITED', 429);
    if (/fetch|network/i.test(m)) throw new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
    throw new ApiError('Không gửi được đăng ký, vui lòng thử lại.', 'INTERNAL');
  }
  await signupClient.auth.signOut().catch(() => {});
  return { needsEmailConfirmation: !data.session };
}

// ─── Applicant: own request ─────────────────────────────────────────────────

export interface MyRequest {
  status: StaffRequestStatus;
  decisionNote: string | null;
}

/** The signed-in user's own request (RLS: own row only), or null if they never registered via the form. */
export async function myStaffRequest(): Promise<MyRequest | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('staff_requests').select('status, decision_note').maybeSingle();
  return data ? { status: data.status as StaffRequestStatus, decisionNote: data.decision_note } : null;
}

// ─── Admin ──────────────────────────────────────────────────────────────────

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/admin_list_staff_requests|admin_decide_staff_request|staff_requests/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa được nâng cấp. Chạy supabase/sql/upgrades/20261119090000_staff_signup_requests.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

/** status null = all (history). */
export async function listStaffRequests(status: StaffRequestStatus | null = 'PENDING'): Promise<StaffRequest[]> {
  if (!supabase) {
    await sleep(200);
    return demoRequests.filter((r) => status === null || r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { data, error } = await supabase.rpc('admin_list_staff_requests', { p_status: status });
  if (error) throw mapDbError(error);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    phone: r.phone,
    note: r.note,
    status: r.status as StaffRequestStatus,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    emailConfirmed: !!r.email_confirmed_at,
  }));
}

export async function decideStaffRequest(userId: string, approve: boolean, note?: string): Promise<void> {
  if (!supabase) return mockDecide(userId, approve);
  const { error } = await supabase.rpc('admin_decide_staff_request', { p_user_id: userId, p_approve: approve, p_note: note ?? null });
  if (error) throw mapDbError(error);
}

// ─── Demo mode (no Supabase, dev only) ──────────────────────────────────────

let demoRequests: StaffRequest[] = [
  {
    userId: uuidv4(),
    email: 'co.mai@gmail.com',
    displayName: 'Cô Mai (mẫu)',
    phone: '0987111222',
    note: 'Giáo viên Toán tư duy, muốn dạy tại cơ sở Ngô Thì Nhậm',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    decidedAt: null,
    emailConfirmed: true,
  },
];

/** Demo sign-in: where a registered (not yet approved) e-mail stands. */
export function demoRequestStatus(email: string): StaffRequestStatus | null {
  return demoRequests.find((r) => r.email === email)?.status ?? null;
}

async function mockRegister(email: string, meta: { display_name: string; phone: string; note: string }): Promise<RegisterResult> {
  await sleep(500);
  if (demoRequests.some((r) => r.email === email)) throw new ApiError('Email này đã có tài khoản. Hãy đăng nhập.', 'CONFLICT', 409, 'email');
  demoRequests = [
    ...demoRequests,
    {
      userId: uuidv4(),
      email,
      displayName: meta.display_name,
      phone: meta.phone,
      note: meta.note || null,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      decidedAt: null,
      emailConfirmed: true,
    },
  ];
  return { needsEmailConfirmation: false };
}

async function mockDecide(userId: string, approve: boolean) {
  await sleep(250);
  const r = demoRequests.find((x) => x.userId === userId);
  if (!r) throw new ApiError('Không tìm thấy yêu cầu', 'NOT_FOUND', 404);
  if (r.status !== 'PENDING') throw new ApiError('Yêu cầu này đã được xử lý', 'CONFLICT', 409);
  demoRequests = demoRequests.map((x) =>
    x.userId === userId ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', decidedAt: new Date().toISOString() } : x,
  );
}
