/**
 * Parent sign-in without a password: phone → 4-digit OTP over Zalo ZNS → session.
 *
 *   POST /api/parent/otp/request  { phone }                                   → { expiresAt, resendAfterSec }
 *   POST /api/parent/otp/verify   { phone, code }                             → SIGNED_IN { session } | NEEDS_PROFILE { signupToken }
 *   POST /api/parent/signup       { phone, signupToken, parentName, childName, birthYear?, campus, relationship? } → SIGNED_IN
 *
 * The code is generated here with crypto.getRandomValues, sent once, and stored only as an HMAC (secret pepper);
 * the database enforces expiry (5 min), attempts (5), and send rates (60 s / 5 per hour per phone, 20 per hour per IP).
 * A new phone gets a one-time signup token (15 min) so the profile step needs no second code.
 * Sessions are real Supabase Auth sessions (app_metadata.role = 'parent'); access rules live in the database.
 *
 * No imports: shared with the app (types + validation) and unit-tested in Node.
 */

export type Relationship = 'MOM' | 'DAD' | 'OTHER';

export interface ParentSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
}

export type OtpVerifyResponse =
  | { status: 'SIGNED_IN'; session: ParentSession }
  | { status: 'NEEDS_PROFILE'; signupToken: string };

export interface OtpRequestResponse {
  expiresAt: string;
  resendAfterSec: number;
}

export interface ParentSignupRequest {
  phone: string;
  signupToken: string;
  parentName: string;
  childName: string;
  birthYear?: number | null;
  campus: string;
  relationship?: Relationship;
}

// ─── Validation (app + server) ──────────────────────────────────────────────

/** "+84 912 345 678", "84912345678", "0912.345.678" → "0912345678"; null if not a Vietnamese mobile number. */
export function normalizeVnMobile(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+84')) d = `0${d.slice(3)}`;
  else if (d.startsWith('84') && d.length === 11) d = `0${d.slice(2)}`;
  return /^0[35789]\d{8}$/.test(d) ? d : null;
}

export const OTP_LENGTH = 4;
export const isOtpCode = (s: string) => new RegExp(`^\\d{${OTP_LENGTH}}$`).test(s);

const CAMPUSES = ['XA_LA', 'NGO_THI_NHAM'];

export function validateSignup(body: unknown): { ok: true; value: ParentSignupRequest } | { ok: false; field: string; message: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const phone = normalizeVnMobile(b.phone as string);
  if (!phone) return { ok: false, field: 'phone', message: 'Số điện thoại không hợp lệ' };
  const signupToken = typeof b.signupToken === 'string' ? b.signupToken : '';
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(signupToken)) return { ok: false, field: 'signupToken', message: 'Phiên xác thực không hợp lệ, vui lòng nhận mã OTP mới' };
  const parentName = String(b.parentName ?? '').trim().replace(/\s+/g, ' ');
  if (parentName.length < 2 || parentName.length > 60) return { ok: false, field: 'parentName', message: 'Tên phụ huynh cần 2–60 ký tự' };
  const childName = String(b.childName ?? '').trim().replace(/\s+/g, ' ');
  if (childName.length < 2 || childName.length > 60) return { ok: false, field: 'childName', message: 'Tên của bé cần 2–60 ký tự' };
  const birthYear = b.birthYear === undefined || b.birthYear === null || b.birthYear === '' ? null : Number(b.birthYear);
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 2008 || birthYear > 2035)) return { ok: false, field: 'birthYear', message: 'Năm sinh của bé không hợp lệ' };
  const campus = String(b.campus ?? '');
  if (!CAMPUSES.includes(campus)) return { ok: false, field: 'campus', message: 'Chọn cơ sở học gần nhà' };
  const relationship: Relationship = b.relationship === 'MOM' || b.relationship === 'DAD' ? b.relationship : 'OTHER';
  return { ok: true, value: { phone, signupToken, parentName, childName, birthYear, campus, relationship } };
}

// ─── Crypto (Web Crypto) ────────────────────────────────────────────────────

/** Uniform 4-digit code (rejection sampling, no modulo bias). */
export function generateOtp(rand: (buf: Uint32Array) => Uint32Array = (b) => crypto.getRandomValues(b)): string {
  const max = 10 ** OTP_LENGTH;
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    const [n] = rand(new Uint32Array(1));
    if (n < limit) return String(n % max).padStart(OTP_LENGTH, '0');
  }
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Stored instead of the code: an attacker reading the table cannot recover codes without the pepper. */
export const hashOtp = (pepper: string, phone: string, code: string) => hmacSha256Hex(pepper, `otp:${phone}:${code}`);
export const hashSignupToken = (pepper: string, token: string) => hmacSha256Hex(pepper, `signup:${token}`);

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Handlers (I/O injected) ────────────────────────────────────────────────

export interface ParentAuthConfig {
  /** Secret pepper for OTP / token hashes (≥ 24 chars). */
  pepper: string;
  /** Approved Zalo ZNS OTP template id; empty = OTP sign-in disabled. */
  otpTemplateId: string;
  /** Name of the template's code parameter (Zalo OTP templates usually use "otp"). */
  otpParam: string;
  znsMode: 'development' | 'production';
}

export interface DbError {
  message: string;
  hint?: string | null;
}

export interface ParentAuthDeps {
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: DbError | null }>;
  /** Send a ZNS template message; resolves ok / error text. */
  sendZns(payload: { phone: string; template_id: string; template_data: Record<string, string>; tracking_id: string; mode?: 'development' }): Promise<{ ok: boolean; error?: string }>;
  /** Create / refresh the parent's Auth user and return a session. */
  issueSession(userId: string): Promise<ParentSession>;
  now(): Date;
}

export type HandlerResult = { status: number; body: unknown };

const err = (status: number, code: string, message: string, field?: string): HandlerResult => ({
  status,
  body: { error: { code, message, ...(field ? { field } : {}) } },
});

const dbFail = (e: DbError): HandlerResult => {
  const hint = e.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return err(422, 'VALIDATION', e.message, hint.slice(11));
  if (hint === 'RATE_LIMITED') return err(429, 'RATE_LIMITED', e.message);
  if (hint === 'UNAUTHORIZED') return err(401, 'UNAUTHORIZED', e.message);
  if (hint === 'CONFLICT') return err(409, 'CONFLICT', e.message);
  throw new Error(e.message);
};

const configured = (cfg: ParentAuthConfig) => cfg.pepper.length >= 24 && !!cfg.otpTemplateId;

export async function requestOtp(body: unknown, ip: string | null, cfg: ParentAuthConfig, deps: ParentAuthDeps): Promise<HandlerResult> {
  if (!configured(cfg)) return err(503, 'SERVICE_UNAVAILABLE', 'Đăng nhập bằng mã OTP qua Zalo chưa được trung tâm kích hoạt');
  const phone = normalizeVnMobile((body as { phone?: string } | null)?.phone);
  if (!phone) return err(422, 'VALIDATION', 'Số điện thoại không hợp lệ (VD: 0912 345 678)', 'phone');

  const code = generateOtp();
  const issued = await deps.rpc<{ id: string; expires_at: string }>('otp_issue', {
    p_phone: phone,
    p_code_hash: await hashOtp(cfg.pepper, phone, code),
    p_ip: ip,
  });
  if (issued.error) return dbFail(issued.error);

  const sent = await deps.sendZns({
    phone: `84${phone.slice(1)}`,
    template_id: cfg.otpTemplateId,
    template_data: { [cfg.otpParam || 'otp']: code },
    tracking_id: `otp:${issued.data!.id}`,
    ...(cfg.znsMode === 'development' ? { mode: 'development' as const } : {}),
  });
  if (!sent.ok) {
    console.error('[parent-otp] ZNS', sent.error);
    // Zalo refuses numbers without a Zalo account (and a few other cases): tell the parent what to do.
    return err(502, 'SERVICE_UNAVAILABLE', 'Không gửi được mã qua Zalo. Ba mẹ kiểm tra số điện thoại đã đăng ký Zalo, hoặc liên hệ trung tâm.');
  }
  const res: OtpRequestResponse = { expiresAt: issued.data!.expires_at, resendAfterSec: 60 };
  return { status: 200, body: res };
}

export async function verifyOtp(body: unknown, cfg: ParentAuthConfig, deps: ParentAuthDeps): Promise<HandlerResult> {
  if (!configured(cfg)) return err(503, 'SERVICE_UNAVAILABLE', 'Đăng nhập bằng mã OTP qua Zalo chưa được trung tâm kích hoạt');
  const b = (body ?? {}) as { phone?: string; code?: string };
  const phone = normalizeVnMobile(b.phone);
  if (!phone) return err(422, 'VALIDATION', 'Số điện thoại không hợp lệ', 'phone');
  const code = String(b.code ?? '').trim();
  if (!isOtpCode(code)) return err(422, 'VALIDATION', `Mã OTP gồm ${OTP_LENGTH} chữ số`, 'code');

  const signupToken = randomToken(32);
  const checked = await deps.rpc<{ result: string; user_id?: string; attempts_left?: number }>('otp_check', {
    p_phone: phone,
    p_code_hash: await hashOtp(cfg.pepper, phone, code),
    p_signup_token_hash: await hashSignupToken(cfg.pepper, signupToken),
  });
  if (checked.error) return dbFail(checked.error);
  const r = checked.data!;
  switch (r.result) {
    case 'OK': {
      const res: OtpVerifyResponse = { status: 'SIGNED_IN', session: await deps.issueSession(r.user_id!) };
      return { status: 200, body: res };
    }
    case 'NEEDS_PROFILE': {
      const res: OtpVerifyResponse = { status: 'NEEDS_PROFILE', signupToken };
      return { status: 200, body: res };
    }
    case 'INVALID':
      return err(422, 'VALIDATION', `Mã OTP không đúng. Còn ${r.attempts_left ?? 0} lần thử.`, 'code');
    case 'LOCKED':
      return err(429, 'RATE_LIMITED', 'Nhập sai quá nhiều lần. Vui lòng nhận mã mới.');
    case 'DISABLED':
      return err(403, 'FORBIDDEN', 'Tài khoản đang tạm khóa. Vui lòng liên hệ trung tâm.');
    default:
      return err(410, 'VALIDATION', 'Mã OTP đã hết hạn. Vui lòng nhận mã mới.', 'code');
  }
}

export async function signupParent(body: unknown, cfg: ParentAuthConfig, deps: ParentAuthDeps): Promise<HandlerResult> {
  if (!configured(cfg)) return err(503, 'SERVICE_UNAVAILABLE', 'Đăng nhập bằng mã OTP qua Zalo chưa được trung tâm kích hoạt');
  const v = validateSignup(body);
  if (!v.ok) return err(422, 'VALIDATION', v.message, v.field);
  const s = v.value;
  const res = await deps.rpc<{ user_id: string; created: boolean }>('parent_signup', {
    p_phone: s.phone,
    p_signup_token_hash: await hashSignupToken(cfg.pepper, s.signupToken),
    p_parent_name: s.parentName,
    p_child_name: s.childName,
    p_birth_year: s.birthYear ?? null,
    p_campus: s.campus,
    p_relationship: s.relationship ?? 'OTHER',
  });
  if (res.error) return dbFail(res.error);
  const out: OtpVerifyResponse = { status: 'SIGNED_IN', session: await deps.issueSession(res.data!.user_id) };
  return { status: 200, body: out };
}
