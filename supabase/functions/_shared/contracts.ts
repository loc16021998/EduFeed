/**
 * API contract shared by the mobile app (Metro) and the `api` Edge Function (Deno).
 * Dependency-free on purpose — do not add imports.
 */

// ─── Domain constants ───────────────────────────────────────────────────────

export const COURSE_CODES = ['TIEN_TIEU_HOC', 'LUYEN_CHU_DEP', 'TOAN_TU_DUY', 'BOI_DUONG_TOAN_TV'] as const;
export type CourseCode = (typeof COURSE_CODES)[number];

export const BRANCH_CODES = ['XA_LA', 'NGO_THI_NHAM'] as const;
export type BranchCode = (typeof BRANCH_CODES)[number];

export const LEAD_SOURCES = ['FEED', 'QUIZ', 'PORTFOLIO', 'DIRECT', 'SHARE_LINK'] as const;
export type LeadSourceCode = (typeof LEAD_SOURCES)[number];

export interface TimeSlotDef {
  id: string;
  label: string;
  kind: 'WEEKDAY' | 'WEEKEND';
}

/** 90-minute trial slots: weekday evenings, weekend daytime. */
export const TIME_SLOTS: TimeSlotDef[] = [
  { id: 'wd-1730', label: '17:30 – 19:00', kind: 'WEEKDAY' },
  { id: 'wd-1900', label: '19:00 – 20:30', kind: 'WEEKDAY' },
  { id: 'we-0800', label: '08:00 – 09:30', kind: 'WEEKEND' },
  { id: 'we-0945', label: '09:45 – 11:15', kind: 'WEEKEND' },
  { id: 'we-1500', label: '15:00 – 16:30', kind: 'WEEKEND' },
];

/** Incentives a parent can claim in-app. The centre must actually deliver these. */
export const PROMO_CODES = {
  EBOOK_VAO_LOP_1: 'Bộ tài liệu "5 Bí quyết giúp con vững bước vào lớp 1"',
  /** CLB Phụ huynh reward (all badges collected) — staff apply it at enrolment. */
  CLB_PHU_HUYNH_100K: 'Giảm 100.000đ học phí (CLB Phụ huynh TH EDU)',
} as const;
export type PromoCode = keyof typeof PROMO_CODES;

/** Welcome gift per course (~200k VND). */
export const GIFT_BY_COURSE: Record<CourseCode, string> = {
  TIEN_TIEU_HOC: 'Bộ Vở Luyện Chữ',
  LUYEN_CHU_DEP: 'Bộ Vở Luyện Chữ',
  TOAN_TU_DUY: 'Bộ Thẻ Tư Duy',
  BOI_DUONG_TOAN_TV: 'Bộ Thẻ Tư Duy',
};

// ─── Phone helpers ──────────────────────────────────────────────────────────

const stripPhone = (raw: string) => raw.replace(/[\s.()-]/g, '');

/** `0` or `+84`, then a 3/5/7/8/9 carrier prefix and 8 digits. */
export const isValidVNPhone = (raw: string): boolean => /^(0|\+84)[35789]\d{8}$/.test(stripPhone(raw));

/** Canonical local form: 0912345678 */
export const normalizePhone = (raw: string): string => {
  const digits = stripPhone(raw);
  return digits.startsWith('+84') ? `0${digits.slice(3)}` : digits;
};

// ─── Date helpers (local calendar dates, YYYY-MM-DD) ────────────────────────

const WEEKDAY_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const pad = (n: number) => String(n).padStart(2, '0');

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Thứ Năm, 12/11/2026" */
export function formatDateLongVN(iso: string): string {
  const d = parseISODate(iso);
  return `${WEEKDAY_LONG[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function isSlotValidForDate(slotId: string, iso: string): boolean {
  const day = parseISODate(iso).getDay();
  const kind = day === 0 || day === 6 ? 'WEEKEND' : 'WEEKDAY';
  return TIME_SLOTS.some((s) => s.id === slotId && s.kind === kind);
}

// ─── POST /api/leads/submit ─────────────────────────────────────────────────

export interface LeadSubmitRequest {
  /** Client-generated UUID — doubles as an idempotency key (safe to retry). */
  id: string;
  parentName: string;
  phone: string;
  studentName: string;
  studentAge: number;
  courseCode: CourseCode;
  branchLocation: BranchCode;
  preferredDate: string;
  preferredSlotId: string;
  source: LeadSourceCode;
  /** Id of the video that led to this booking (feed card or share link). */
  sourceRef?: string;
  zaloUserId?: string;
  promoCode?: PromoCode;
  quizAnswers?: Record<string, string[]>;
  quizSummary?: { ageGroup: string; painPoints: string[]; goal: string; recommendation: string };
  /** UTM of the ad / link the parent arrived through (dashboard: traffic sources). */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface LeadSubmitResponse {
  id: string;
  code: string;
  createdAt: string;
  /** True when the same lead was already submitted (retry / double tap). */
  duplicate: boolean;
  /**
   * How the parent will be confirmed: 'ZNS' = a Zalo ZNS message is being sent to their phone
   * (sent in the background right after this response); 'NONE' = no automatic message — staff call.
   */
  confirmation: ConfirmationChannel;
}

export type ConfirmationChannel = 'ZNS' | 'NONE';

// ─── GET /api/feed ──────────────────────────────────────────────────────────

export interface VideoDTO {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  category: CourseCode;
  teacherName: string;
  teacherAvatar: string;
  tags: string[];
  ctaText: string;
  ctaLink: string;
  publishedAt: string;
  /** Short id for the public share link /v/<shareSlug>. */
  shareSlug: string | null;
}

export interface FeedPageResponse {
  items: VideoDTO[];
  /** Opaque — pass back as `?cursor=` for the next page; null when exhausted. */
  nextCursor: string | null;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

// ─── CRM (staff) ────────────────────────────────────────────────────────────

/** Lead lifecycle. Reminder states are set by the system; staff set the others. */
export const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H', 'COMPLETED_TRIAL', 'ENROLLED', 'CANCELLED',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const STAFF_SETTABLE_STATUSES = ['NEW', 'CONTACTED', 'CONFIRMED', 'ENROLLED', 'CANCELLED'] as const;

/** POST /api/leads/:id/complete-trial */
export interface CompleteTrialRequest {
  /** Qualitative feedback shown to the parent in the post-trial message (10–1000 chars). */
  teacherNote: string;
}
export interface CompleteTrialResponse {
  id: string;
  status: 'COMPLETED_TRIAL';
  /** When the T+2h message is due (appointment + 2h). */
  postTrialDueAt: string;
  /** SENT/FAILED/SKIPPED if attempted now; SCHEDULED if the cron will send it at postTrialDueAt. */
  postTrialMessage: 'SENT' | 'FAILED' | 'SKIPPED' | 'SCHEDULED';
  detail?: string;
}

/** POST /api/leads/:id/status */
export interface SetLeadStatusRequest {
  status: (typeof STAFF_SETTABLE_STATUSES)[number];
  note?: string;
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; field?: string };
}

// ─── Request validation (server is the source of truth; app mirrors it for UX) ──

type Result = { ok: true; value: LeadSubmitRequest } | { ok: false; field: string; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isName = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 60 && !/\d/.test(v);

const includes = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export function validateLeadRequest(body: unknown): Result {
  if (!body || typeof body !== 'object') return { ok: false, field: 'body', message: 'Dữ liệu không hợp lệ' };
  const b = body as Record<string, unknown>;
  const fail = (field: string, message: string): Result => ({ ok: false, field, message });

  if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return fail('id', 'Mã yêu cầu không hợp lệ');
  if (!isName(b.parentName)) return fail('parentName', 'Họ tên phụ huynh không hợp lệ');
  if (typeof b.phone !== 'string' || !isValidVNPhone(b.phone)) return fail('phone', 'Số điện thoại không hợp lệ');
  if (!isName(b.studentName)) return fail('studentName', 'Họ tên của bé không hợp lệ');
  if (typeof b.studentAge !== 'number' || !Number.isInteger(b.studentAge) || b.studentAge < 3 || b.studentAge > 12) {
    return fail('studentAge', 'Tuổi của bé không hợp lệ');
  }
  if (!includes(COURSE_CODES, b.courseCode)) return fail('courseCode', 'Khóa học không hợp lệ');
  if (!includes(BRANCH_CODES, b.branchLocation)) return fail('branchLocation', 'Cơ sở không hợp lệ');
  if (typeof b.preferredDate !== 'string' || !ISO_DATE_RE.test(b.preferredDate)) {
    return fail('preferredDate', 'Ngày học thử không hợp lệ');
  }
  if (typeof b.preferredSlotId !== 'string' || !isSlotValidForDate(b.preferredSlotId, b.preferredDate)) {
    return fail('preferredSlotId', 'Khung giờ không hợp lệ');
  }
  if (!includes(LEAD_SOURCES, b.source)) return fail('source', 'Nguồn không hợp lệ');
  if (b.sourceRef !== undefined && !(typeof b.sourceRef === 'string' && b.sourceRef.length <= 64)) return fail('sourceRef', 'Nguồn không hợp lệ');
  if (b.zaloUserId !== undefined && typeof b.zaloUserId !== 'string') return fail('zaloUserId', 'Zalo ID không hợp lệ');
  if (b.promoCode !== undefined && !(typeof b.promoCode === 'string' && b.promoCode in PROMO_CODES)) {
    return fail('promoCode', 'Mã ưu đãi không hợp lệ');
  }
  if (b.quizSummary !== undefined && (typeof b.quizSummary !== 'object' || b.quizSummary === null)) {
    return fail('quizSummary', 'Tóm tắt quiz không hợp lệ');
  }
  if (b.quizAnswers !== undefined && (typeof b.quizAnswers !== 'object' || b.quizAnswers === null)) {
    return fail('quizAnswers', 'Câu trả lời quiz không hợp lệ');
  }

  for (const k of ['utmSource', 'utmMedium', 'utmCampaign'] as const) {
    if (b[k] !== undefined && !(typeof b[k] === 'string' && (b[k] as string).length <= 150)) return fail(k, 'Nguồn quảng cáo không hợp lệ');
  }

  return { ok: true, value: b as unknown as LeadSubmitRequest };
}

// ─── Staff accounts (admin) ─────────────────────────────────────────────────

/** admin = owner / manager (also manages accounts); staff = teacher / employee. */
export const STAFF_ROLES = ['admin', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const MIN_STAFF_PASSWORD = 8;

export interface CreateStaffRequest {
  email: string;
  password: string;
  role: StaffRole;
  /** Shown in the account list, e.g. "Cô Hường". */
  displayName?: string;
}

export interface StaffAccountDTO {
  id: string;
  email: string;
  role: StaffRole;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns a Vietnamese message for an unacceptable password, or null. */
export function staffPasswordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_STAFF_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_STAFF_PASSWORD} ký tự`;
  if (password.length > 72) return 'Mật khẩu tối đa 72 ký tự';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Mật khẩu cần có cả chữ và số';
  return null;
}

export function validateCreateStaff(body: unknown):
  | { ok: true; value: CreateStaffRequest }
  | { ok: false; field: string; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, field: 'body', message: 'Dữ liệu không hợp lệ' };
  const b = body as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, field: 'email', message: 'Email không hợp lệ' };
  const pw = staffPasswordProblem(b.password);
  if (pw) return { ok: false, field: 'password', message: pw };
  if (!includes(STAFF_ROLES, b.role)) return { ok: false, field: 'role', message: 'Quyền không hợp lệ' };
  const displayName = typeof b.displayName === 'string' ? b.displayName.trim().slice(0, 60) : '';
  return { ok: true, value: { email, password: b.password as string, role: b.role, ...(displayName ? { displayName } : {}) } };
}

// ─── POST /api/enrollments/:id/complete (staff) ─────────────────────────────

export interface CompleteEnrollmentRequest {
  /** Final teacher review, 20–1000 chars — sent to the parent at T+3. */
  teacherNote: string;
  /** YYYY-MM-DD, default today (Vietnam). Follow-ups are scheduled from this date. */
  endDate?: string;
  /** Level just completed (1–5). */
  level?: number;
}

export interface CompleteEnrollmentResponse {
  id: string;
  status: 'COMPLETED';
  certificateCode: string;
  endDate: string;
  level: number;
}

export function validateCompleteEnrollment(body: unknown):
  | { ok: true; value: CompleteEnrollmentRequest }
  | { ok: false; field: string; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, field: 'body', message: 'Dữ liệu không hợp lệ' };
  const b = body as Record<string, unknown>;
  const note = typeof b.teacherNote === 'string' ? b.teacherNote.trim() : '';
  if (note.length < 20 || note.length > 1000) return { ok: false, field: 'teacherNote', message: 'Nhận xét cuối khóa cần 20–1000 ký tự' };
  if (b.endDate !== undefined && !(typeof b.endDate === 'string' && ISO_DATE_RE.test(b.endDate))) {
    return { ok: false, field: 'endDate', message: 'Ngày kết thúc không hợp lệ' };
  }
  if (b.level !== undefined && !(typeof b.level === 'number' && Number.isInteger(b.level) && b.level >= 1 && b.level <= 5)) {
    return { ok: false, field: 'level', message: 'Cấp độ không hợp lệ' };
  }
  return {
    ok: true,
    value: { teacherNote: note, ...(b.endDate ? { endDate: b.endDate as string } : {}), ...(b.level ? { level: b.level as number } : {}) },
  };
}
