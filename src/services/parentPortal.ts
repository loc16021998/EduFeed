/**
 * Parent portal + parent accounts.
 *
 * Parents   sign in with phone + Zalo ZNS OTP (Edge Function, _shared/parentAuth.ts) → a Supabase session with
 *           app_metadata.role = 'parent'. Everything they read goes through database functions that check the
 *           parent ↔ student link (RLS: parents only ever see their own children).
 * Teachers  write the contact book (daily_report_create) with photos in the PRIVATE bucket class-reports.
 * Admins    manage parent accounts, students, sessions and leave / make-up requests.
 *
 * Without Supabase (dev / demo) everything runs on in-memory sample data, labelled on screen; the OTP is
 * shown on screen there (never in production).
 */
import { supabase } from '@/lib/supabase';
import type { CampusLocation, CourseCategory, PickedMedia } from '@/types';
import { sleep, uuidv4 } from '@/utils/helpers';

import {
  normalizeVnMobile,
  type OtpRequestResponse,
  type OtpVerifyResponse,
  type ParentSignupRequest,
  type Relationship,
} from '../../supabase/functions/_shared/parentAuth';
import { ApiError, callApi } from './apiClient';
import { uploadMedia } from './media/storageUpload';

export type { Relationship };
export type Attendance = 'PRESENT' | 'ABSENT' | 'EXCUSED';
export type RequestType = 'LEAVE' | 'MAKEUP';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ParentStatusFilter = 'ALL' | 'ACTIVE' | 'EXPIRING' | 'GUEST' | 'LOCKED';

/** Weekly slot: d = 2 (Thứ 2) … 7 (Thứ 7), 8 = Chủ nhật. */
export interface ScheduleSlot {
  d: number;
  start: string;
  end: string;
}

export interface PortalEnrollment {
  id: string;
  courseCode: CourseCategory;
  courseName: string;
  level: number;
  status: 'ACTIVE' | 'COMPLETED' | 'DROPPED';
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  schedule: ScheduleSlot[];
  startDate: string;
  endDate: string | null;
  certificateCode: string | null;
  paymentStatus: 'PENDING_PAYMENT' | 'PAID' | null;
  openInvoiceId: string | null;
}

export interface PortalStudent {
  id: string;
  fullName: string;
  birthYear: number | null;
  campus: CampusLocation;
  branchName: string;
  avatarUrl: string | null;
  relationship: Relationship;
  enrollments: PortalEnrollment[];
  attendance: { present: number; absent: number; excused: number };
}

export interface AttendanceRequest {
  id: string;
  studentId: string;
  type: RequestType;
  requestedDate: string;
  reason: string;
  status: RequestStatus;
  decisionNote: string | null;
  createdAt: string;
}

export interface PortalData {
  parent: { id: string; fullName: string; phone: string; referralCode: string };
  students: PortalStudent[];
  requests: AttendanceRequest[];
}

export interface DailyReport {
  id: string;
  courseCode: CourseCategory;
  courseName: string;
  sessionDate: string;
  attendance: Attendance;
  teacherName: string;
  feedbackText: string | null;
  /** Storage paths (class-reports) — or full URLs in demo mode. */
  media: string[];
  /** Teacher's quick feedback chips. */
  tags: string[];
  parentLiked: boolean;
  /** 👏 reaction. */
  parentClapped: boolean;
  parentReply: string | null;
  /** Teacher's 15–30 s voice note (storage path in class-reports, or a URL; '' in demo = no audio). */
  voicePath: string | null;
  voiceDuration: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'UNAUTHORIZED') return new ApiError(error.message, 'UNAUTHORIZED', 401);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/parent_report_clap/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có lời nhắn thoại. Chạy supabase/sql/upgrades/20261128090000_voice_games_community.sql.', 'INTERNAL');
  }
  if (/parent_|admin_parent|daily_report|attendance_request|students/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có Cổng phụ huynh. Chạy supabase/sql/upgrades/20261124090000_parent_portal.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

const slots = (v: unknown): ScheduleSlot[] =>
  Array.isArray(v) ? v.filter((s): s is ScheduleSlot => !!s && typeof s.d === 'number' && typeof s.start === 'string' && typeof s.end === 'string') : [];

/* eslint-disable @typescript-eslint/no-explicit-any */
const toEnrollment = (e: any): PortalEnrollment => ({
  id: e.id,
  courseCode: e.course_code,
  courseName: e.course_name ?? e.course_code,
  level: e.level ?? 1,
  status: e.status,
  sessionsTotal: e.sessions_total ?? null,
  sessionsRemaining: e.sessions_remaining ?? null,
  schedule: slots(e.schedule),
  startDate: e.start_date ?? '',
  endDate: e.end_date ?? null,
  certificateCode: e.certificate_code ?? null,
  paymentStatus: e.payment_status ?? null,
  openInvoiceId: e.open_invoice_id ?? null,
});
const toRequest = (a: any): AttendanceRequest => ({
  id: a.id,
  studentId: a.student_id,
  type: a.type,
  requestedDate: a.requested_date,
  reason: a.reason,
  status: a.status,
  decisionNote: a.decision_note ?? null,
  createdAt: a.created_at,
});
const toReport = (r: any): DailyReport => ({
  id: r.id,
  courseCode: r.course_code,
  courseName: r.course_name ?? r.course_code,
  sessionDate: r.session_date,
  attendance: r.attendance,
  teacherName: r.teacher_name,
  feedbackText: r.feedback_text ?? null,
  media: Array.isArray(r.media_urls) ? r.media_urls : [],
  tags: Array.isArray(r.tags) ? r.tags : [],
  parentLiked: !!r.parent_liked,
  parentClapped: !!r.parent_clapped,
  voicePath: r.voice_path ?? null,
  voiceDuration: r.voice_duration == null ? null : Number(r.voice_duration),
  parentReply: r.parent_reply ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export const attendanceRate = (a: PortalStudent['attendance']): number | null =>
  a.present + a.absent > 0 ? Math.round((a.present / (a.present + a.absent)) * 100) : null;

// ─── Sign-in ────────────────────────────────────────────────────────────────

export const DEMO_OTP = '1234';
let demoSignedIn = false;
let demoPendingPhone: string | null = null;
export const isDemoParentSignedIn = () => demoSignedIn;

export async function requestParentOtp(phoneRaw: string): Promise<OtpRequestResponse> {
  const phone = normalizeVnMobile(phoneRaw);
  if (!phone) throw new ApiError('Số điện thoại không hợp lệ (VD: 0912 345 678)', 'VALIDATION', 422, 'phone');
  if (!supabase) {
    await sleep(400);
    demoPendingPhone = phone;
    return { expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), resendAfterSec: 60 };
  }
  return callApi<OtpRequestResponse>('parent/otp/request', { method: 'POST', body: { phone } });
}

async function applySession(res: OtpVerifyResponse): Promise<OtpVerifyResponse> {
  if (res.status === 'SIGNED_IN' && supabase) {
    const { error } = await supabase.auth.setSession({ access_token: res.session.access_token, refresh_token: res.session.refresh_token });
    if (error) throw new ApiError('Không lưu được phiên đăng nhập, vui lòng thử lại.', 'INTERNAL');
  }
  return res;
}

/** Demo phones: 0912 000 111 = account created by the centre (2 children); any other number = new account. */
export const DEMO_EXISTING_PHONE = '0912000111';

export async function verifyParentOtp(phoneRaw: string, code: string): Promise<OtpVerifyResponse> {
  const phone = normalizeVnMobile(phoneRaw);
  if (!phone) throw new ApiError('Số điện thoại không hợp lệ', 'VALIDATION', 422, 'phone');
  if (!/^\d{4}$/.test(code)) throw new ApiError('Mã OTP gồm 4 chữ số', 'VALIDATION', 422, 'code');
  if (!supabase) {
    await sleep(400);
    if (phone !== demoPendingPhone) throw new ApiError('Mã OTP đã hết hạn. Vui lòng nhận mã mới.', 'VALIDATION', 410, 'code');
    if (code !== DEMO_OTP) throw new ApiError('Mã OTP không đúng. Còn 4 lần thử.', 'VALIDATION', 422, 'code');
    if (phone === DEMO_EXISTING_PHONE) {
      demoSignedIn = true;
      return { status: 'SIGNED_IN', session: { access_token: 'demo', refresh_token: 'demo', expires_at: null } };
    }
    return { status: 'NEEDS_PROFILE', signupToken: 'demo-signup-token-0000000000000000000000' };
  }
  return applySession(await callApi<OtpVerifyResponse>('parent/otp/verify', { method: 'POST', body: { phone, code } }));
}

export async function signupParent(input: ParentSignupRequest): Promise<OtpVerifyResponse> {
  if (!supabase) {
    await sleep(400);
    demoSignedIn = true;
    demoData = {
      parent: { id: uuidv4(), fullName: input.parentName, phone: normalizeVnMobile(input.phone) ?? input.phone, referralCode: 'TH7Q2KX9' },
      students: [{ id: uuidv4(), fullName: input.childName, birthYear: input.birthYear ?? null, campus: input.campus as CampusLocation, branchName: input.campus === 'XA_LA' ? 'Cơ sở Xa La' : 'Cơ sở Ngô Thì Nhậm', avatarUrl: null, relationship: input.relationship ?? 'OTHER', enrollments: [], attendance: { present: 0, absent: 0, excused: 0 } }],
      requests: [],
    };
    return { status: 'SIGNED_IN', session: { access_token: 'demo', refresh_token: 'demo', expires_at: null } };
  }
  return applySession(await callApi<OtpVerifyResponse>('parent/signup', { method: 'POST', body: input }));
}

export async function signOutParent(): Promise<void> {
  demoSignedIn = false;
  if (supabase) await supabase.auth.signOut().catch(() => {});
}

// ─── Parent portal ──────────────────────────────────────────────────────────

export async function fetchPortal(): Promise<PortalData> {
  if (!supabase) {
    await sleep(250);
    return structuredCloneSafe(demo());
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const p = await rpc<any>('parent_portal');
  return {
    parent: { id: p.parent.id, fullName: p.parent.full_name, phone: p.parent.phone, referralCode: p.parent.referral_code },
    students: (p.students ?? []).map((s: any) => ({
      id: s.id,
      fullName: s.full_name,
      birthYear: s.birth_year,
      campus: s.campus_location,
      branchName: s.branch_name,
      avatarUrl: s.avatar_url,
      relationship: s.relationship,
      enrollments: (s.enrollments ?? []).map(toEnrollment),
      attendance: { present: Number(s.attendance?.present ?? 0), absent: Number(s.attendance?.absent ?? 0), excused: Number(s.attendance?.excused ?? 0) },
    })),
    requests: (p.requests ?? []).map(toRequest),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function fetchReports(studentId: string, before?: string): Promise<DailyReport[]> {
  if (!supabase) {
    await sleep(250);
    return demoReports().filter((r) => r.studentId === studentId && (!before || r.sessionDate < before)).slice(0, 10).map(({ studentId: _s, ...r }) => ({ ...r }));
  }
  return (await rpc<unknown[]>('parent_reports', { p_student_id: studentId, p_before: before ?? null, p_limit: 10 })).map(toReport);
}

/** Signed URLs (1 hour) for photos in the private bucket; full URLs pass through. */
export async function photoUrls(paths: string[]): Promise<string[]> {
  const stored = paths.filter((p) => !/^https?:\/\//.test(p));
  if (!supabase || stored.length === 0) return paths;
  const { data } = await supabase.storage.from('class-reports').createSignedUrls(stored, 3600);
  const map = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return paths.map((p) => (/^https?:\/\//.test(p) ? p : map.get(p) ?? '')).filter(Boolean);
}

export async function reactToReport(reportId: string, liked: boolean | null, reply?: string): Promise<void> {
  if (reply !== undefined && reply.trim().length > 500) throw new ApiError('Lời nhắn tối đa 500 ký tự', 'VALIDATION', 422, 'reply');
  if (!supabase) {
    await sleep(200);
    const r = demoReports().find((x) => x.id === reportId);
    if (r) {
      if (liked !== null) r.parentLiked = liked;
      if (reply?.trim()) r.parentReply = reply.trim();
    }
    return;
  }
  await rpc('parent_report_react', { p_report_id: reportId, p_liked: liked, p_reply: reply?.trim() || null });
}

/** 👏 "Vỗ tay" for the teacher (❤️ stays reactToReport's liked). */
export async function clapReport(reportId: string, on: boolean): Promise<void> {
  if (!supabase) {
    await sleep(150);
    const r = demoReports().find((x) => x.id === reportId);
    if (r) r.parentClapped = on;
    return;
  }
  await rpc('parent_report_clap', { p_report_id: reportId, p_on: on });
}

export async function sendAttendanceRequest(studentId: string, type: RequestType, date: string, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw new ApiError('Ba mẹ ghi lý do (ít nhất 3 ký tự)', 'VALIDATION', 422, 'reason');
  if (!supabase) {
    await sleep(250);
    const d = demo();
    if (d.requests.some((r) => r.studentId === studentId && r.type === type && r.requestedDate === date && r.status !== 'REJECTED')) {
      throw new ApiError('Đã có yêu cầu cho ngày này', 'CONFLICT', 409);
    }
    d.requests.unshift({ id: uuidv4(), studentId, type, requestedDate: date, reason: reason.trim(), status: 'PENDING', decisionNote: null, createdAt: new Date().toISOString() });
    return;
  }
  await rpc('parent_attendance_request', { p_student_id: studentId, p_type: type, p_date: date, p_reason: reason.trim() });
}

// ─── Teachers: contact book ─────────────────────────────────────────────────

export async function createDailyReport(input: {
  enrollmentId: string;
  studentId: string;
  sessionDate: string;
  attendance: Attendance;
  feedback: string;
  photos: PickedMedia[];
  onProgress?: (fraction: number) => void;
}): Promise<{ sessionsRemaining: number | null }> {
  if (input.feedback.length > 2000) throw new ApiError('Nhận xét tối đa 2000 ký tự', 'VALIDATION', 422, 'feedback');
  if (input.photos.length > 6) throw new ApiError('Tối đa 6 ảnh', 'VALIDATION', 422, 'media');
  if (!supabase) {
    await sleep(300);
    return { sessionsRemaining: null };
  }
  const paths: string[] = [];
  for (let i = 0; i < input.photos.length; i++) {
    const p = input.photos[i];
    const ext = /png/.test(p.type) ? 'png' : /webp/.test(p.type) ? 'webp' : 'jpg';
    const path = `${input.studentId}/${input.sessionDate}-${uuidv4().slice(0, 8)}.${ext}`;
    await uploadMedia(path, p, (f) => input.onProgress?.((i + f) / input.photos.length), 'class-reports');
    paths.push(path);
  }
  const r = await rpc<{ sessions_remaining: number | null }>('daily_report_create', {
    p_enrollment_id: input.enrollmentId,
    p_session_date: input.sessionDate,
    p_attendance: input.attendance,
    p_feedback: input.feedback.trim() || null,
    p_media: paths,
  });
  return { sessionsRemaining: r.sessions_remaining };
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export interface AdminParentRow {
  id: string;
  phone: string;
  fullName: string;
  isActive: boolean;
  status: Exclude<ParentStatusFilter, 'ALL'>;
  selfRegistered: boolean;
  lastLoginAt: string | null;
  pendingRequests: number;
  students: {
    id: string;
    fullName: string;
    birthYear: number | null;
    campus: CampusLocation;
    enrollments: { id: string; courseCode: CourseCategory; level: number; sessionsTotal: number | null; sessionsRemaining: number | null; schedule: ScheduleSlot[] }[];
  }[];
}

export interface AdminRequestRow extends AttendanceRequest {
  studentName: string;
  campus: CampusLocation;
  parentName: string | null;
  parentPhone: string | null;
}

export interface NewChildInput {
  fullName: string;
  birthYear: number | null;
  campus: CampusLocation;
  courses: { courseCode: CourseCategory; level: number; sessionsTotal: number | null; schedule: ScheduleSlot[] }[];
}

export interface NewParentInput {
  phone: string;
  fullName: string;
  relationship: Relationship;
  children: NewChildInput[];
}

export async function adminListParents(search: string, campus: CampusLocation | null, status: ParentStatusFilter): Promise<AdminParentRow[]> {
  if (!supabase) {
    await sleep(250);
    const q = search.trim().toLowerCase();
    return demoAdmin().filter(
      (p) =>
        (status === 'ALL' || p.status === status) &&
        (!campus || p.students.some((s) => s.campus === campus)) &&
        (!q || p.fullName.toLowerCase().includes(q) || p.phone.includes(q.replace(/\D/g, '') || '§') || p.students.some((s) => s.fullName.toLowerCase().includes(q))),
    );
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = await rpc<any[]>('admin_parents', { p_search: search.trim() || null, p_campus: campus, p_status: status, p_limit: 150 });
  return rows.map((u) => ({
    id: u.id,
    phone: u.phone,
    fullName: u.full_name,
    isActive: u.is_active,
    status: u.status,
    selfRegistered: !!u.self_registered,
    lastLoginAt: u.last_login_at,
    pendingRequests: Number(u.pending_requests ?? 0),
    students: (u.students ?? []).map((s: any) => ({
      id: s.id,
      fullName: s.full_name,
      birthYear: s.birth_year,
      campus: s.campus_location,
      enrollments: (s.enrollments ?? []).map((e: any) => ({ id: e.id, courseCode: e.course_code, level: e.level, sessionsTotal: e.sessions_total, sessionsRemaining: e.sessions_remaining, schedule: slots(e.schedule) })),
    })),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export function newParentProblem(p: NewParentInput): { field: string; message: string } | null {
  if (!normalizeVnMobile(p.phone)) return { field: 'phone', message: 'Số điện thoại không hợp lệ (VD: 0912 345 678)' };
  if (p.fullName.trim().length < 2) return { field: 'fullName', message: 'Nhập tên phụ huynh' };
  for (const c of p.children) {
    if (c.fullName.trim().length < 2) return { field: 'children', message: 'Nhập tên cho từng học viên' };
    if (c.birthYear !== null && (c.birthYear < 2008 || c.birthYear > 2035)) return { field: 'children', message: `Năm sinh của ${c.fullName} không hợp lệ` };
    for (const k of c.courses) {
      if (k.sessionsTotal !== null && (k.sessionsTotal < 1 || k.sessionsTotal > 500)) return { field: 'children', message: 'Số buổi học 1–500' };
    }
  }
  return null;
}

export async function adminCreateParent(p: NewParentInput): Promise<{ parentId: string; created: boolean }> {
  const problem = newParentProblem(p);
  if (problem) throw new ApiError(problem.message, 'VALIDATION', 422, problem.field);
  const phone = normalizeVnMobile(p.phone)!;
  if (!supabase) {
    await sleep(300);
    const list = demoAdmin();
    let row = list.find((x) => x.phone === phone);
    const created = !row;
    if (!row) {
      row = { id: uuidv4(), phone, fullName: p.fullName.trim(), isActive: true, status: 'GUEST', selfRegistered: false, lastLoginAt: null, pendingRequests: 0, students: [] };
      list.unshift(row);
    }
    for (const c of p.children) {
      row.students.push({ id: uuidv4(), fullName: c.fullName.trim(), birthYear: c.birthYear, campus: c.campus, enrollments: c.courses.map((k) => ({ id: uuidv4(), courseCode: k.courseCode, level: k.level, sessionsTotal: k.sessionsTotal, sessionsRemaining: k.sessionsTotal, schedule: k.schedule })) });
    }
    row.status = demoStatus(row);
    return { parentId: row.id, created };
  }
  const r = await rpc<{ parent_id: string; created: boolean }>('admin_parent_create', {
    p: {
      phone,
      full_name: p.fullName.trim(),
      relationship: p.relationship,
      children: p.children.map((c) => ({
        full_name: c.fullName.trim(),
        birth_year: c.birthYear,
        campus_location: c.campus,
        courses: c.courses.map((k) => ({ course_code: k.courseCode, level: k.level, sessions_total: k.sessionsTotal, schedule: k.schedule })),
      })),
    },
  });
  return { parentId: r.parent_id, created: r.created };
}

export async function adminSetParentActive(parentId: string, active: boolean): Promise<void> {
  if (!supabase) {
    await sleep(150);
    const row = demoAdmin().find((x) => x.id === parentId);
    if (row) {
      row.isActive = active;
      row.status = demoStatus(row);
    }
    return;
  }
  await rpc('admin_parent_set_active', { p_parent_id: parentId, p_active: active });
}

export async function adminAdjustSessions(enrollmentId: string, delta: number, note?: string): Promise<{ sessionsRemaining: number; sessionsTotal: number }> {
  if (!supabase) {
    await sleep(150);
    for (const p of demoAdmin()) {
      for (const s of p.students) {
        const e = s.enrollments.find((x) => x.id === enrollmentId);
        if (e) {
          e.sessionsRemaining = Math.max(0, (e.sessionsRemaining ?? 0) + delta);
          e.sessionsTotal = Math.max(e.sessionsTotal ?? 0, (e.sessionsTotal ?? 0) + Math.max(delta, 0), e.sessionsRemaining);
          p.status = demoStatus(p);
          return { sessionsRemaining: e.sessionsRemaining, sessionsTotal: e.sessionsTotal };
        }
      }
    }
    throw new ApiError('Không tìm thấy khóa học', 'NOT_FOUND', 404);
  }
  const r = await rpc<{ sessions_remaining: number; sessions_total: number }>('admin_enrollment_adjust_sessions', { p_enrollment_id: enrollmentId, p_delta: delta, p_note: note ?? null });
  return { sessionsRemaining: r.sessions_remaining, sessionsTotal: r.sessions_total };
}

export async function adminListRequests(status: RequestStatus | 'ALL' = 'PENDING'): Promise<AdminRequestRow[]> {
  if (!supabase) {
    await sleep(200);
    const kids = demo().students;
    return demo()
      .requests.filter((r) => status === 'ALL' || r.status === status)
      .map((r) => {
        const s = kids.find((k) => k.id === r.studentId);
        return { ...r, studentName: s?.fullName ?? 'Học viên', campus: s?.campus ?? 'XA_LA', parentName: demo().parent.fullName, parentPhone: demo().parent.phone };
      });
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = await rpc<any[]>('admin_attendance_requests', { p_status: status });
  return rows.map((a) => ({ ...toRequest(a), studentName: a.student_name, campus: a.campus_location, parentName: a.parent_name, parentPhone: a.parent_phone }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function adminDecideRequest(id: string, approve: boolean, note?: string): Promise<void> {
  if (!supabase) {
    await sleep(150);
    const r = demo().requests.find((x) => x.id === id);
    if (!r || r.status !== 'PENDING') throw new ApiError('Yêu cầu không còn chờ duyệt', 'CONFLICT', 409);
    r.status = approve ? 'APPROVED' : 'REJECTED';
    r.decisionNote = note?.trim() || null;
    return;
  }
  await rpc('admin_attendance_decide', { p_request_id: id, p_approve: approve, p_note: note?.trim() || null });
}

// ─── Demo data (no Supabase) ────────────────────────────────────────────────

let demoData: PortalData | null = null;
let demoReportList: (DailyReport & { studentId: string })[] | null = null;
let demoAdminList: AdminParentRow[] | null = null;
const KHOI = 'demo-student-khoi';
const ANH = 'demo-student-anh';
const isoDay = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const structuredCloneSafe = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function demo(): PortalData {
  if (demoData) return demoData;
  demoData = {
    parent: { id: 'demo-parent', fullName: 'Mẹ An (mẫu)', phone: DEMO_EXISTING_PHONE, referralCode: 'TH4F9A2C' },
    students: [
      {
        id: KHOI, fullName: 'Minh Khôi (mẫu)', birthYear: 2019, campus: 'XA_LA', branchName: 'Cơ sở Xa La', avatarUrl: null, relationship: 'MOM',
        enrollments: [{ id: 'demo-enr-khoi', courseCode: 'TOAN_TU_DUY', courseName: 'Toán tư duy', level: 1, status: 'ACTIVE', sessionsTotal: 24, sessionsRemaining: 2, schedule: [{ d: 3, start: '17:30', end: '19:00' }, { d: 7, start: '09:00', end: '10:30' }], startDate: isoDay(-80), endDate: null, certificateCode: null, paymentStatus: 'PENDING_PAYMENT', openInvoiceId: '00000000-0000-4000-8000-00000000d001' }],
        attendance: { present: 20, absent: 1, excused: 1 },
      },
      {
        id: ANH, fullName: 'Minh Anh (mẫu)', birthYear: 2021, campus: 'XA_LA', branchName: 'Cơ sở Xa La', avatarUrl: null, relationship: 'MOM',
        enrollments: [{ id: 'demo-enr-anh', courseCode: 'LUYEN_CHU_DEP', courseName: 'Luyện chữ đẹp', level: 1, status: 'ACTIVE', sessionsTotal: 16, sessionsRemaining: 9, schedule: [{ d: 4, start: '17:30', end: '18:30' }], startDate: isoDay(-40), endDate: null, certificateCode: null, paymentStatus: 'PAID', openInvoiceId: null }],
        attendance: { present: 7, absent: 0, excused: 0 },
      },
    ],
    requests: [{ id: 'demo-req-1', studentId: KHOI, type: 'LEAVE', requestedDate: isoDay(-6), reason: 'Bé bị sốt (mẫu)', status: 'APPROVED', decisionNote: 'Trung tâm đã xếp buổi bù', createdAt: new Date(Date.now() - 8 * 86400_000).toISOString() }],
  };
  return demoData;
}

function demoReports() {
  if (demoReportList) return demoReportList;
  const pic = (seed: string) => `https://picsum.photos/seed/${seed}/900/1200`;
  demoReportList = [
    { id: 'demo-r1', studentId: KHOI, courseCode: 'TOAN_TU_DUY', courseName: 'Toán tư duy', sessionDate: isoDay(-1), attendance: 'PRESENT', teacherName: 'Thầy Tú (mẫu)', feedbackText: 'Khôi tính nhẩm phép cộng có nhớ rất nhanh, chủ động giơ tay trả lời. Ba mẹ cho con luyện thêm 2 bài toán có lời văn mỗi tối nhé.', media: [pic('thedu-math-1'), pic('thedu-math-2')], parentLiked: false, parentClapped: false, voicePath: '', voiceDuration: 24, parentReply: null, tags: ['Tính nhẩm nhanh', 'Tích cực phát biểu'] },
    { id: 'demo-r2', studentId: KHOI, courseCode: 'TOAN_TU_DUY', courseName: 'Toán tư duy', sessionDate: isoDay(-5), attendance: 'PRESENT', teacherName: 'Thầy Tú (mẫu)', feedbackText: 'Con hoàn thành bài tập hình khối, cần cẩn thận hơn khi đếm cạnh.', media: [pic('thedu-math-3')], parentLiked: true, parentClapped: false, voicePath: null, voiceDuration: null, parentReply: 'Cảm ơn thầy, tối nay con sẽ luyện thêm ạ.', tags: [] },
    { id: 'demo-r3', studentId: KHOI, courseCode: 'TOAN_TU_DUY', courseName: 'Toán tư duy', sessionDate: isoDay(-6), attendance: 'EXCUSED', teacherName: 'Thầy Tú (mẫu)', feedbackText: null, media: [], parentLiked: false, parentClapped: false, voicePath: null, voiceDuration: null, parentReply: null, tags: [] },
    { id: 'demo-r4', studentId: ANH, courseCode: 'LUYEN_CHU_DEP', courseName: 'Luyện chữ đẹp', sessionDate: isoDay(-2), attendance: 'PRESENT', teacherName: 'Cô Hường (mẫu)', feedbackText: 'Minh Anh viết nét khuyết đều hơn tuần trước, ngồi đúng tư thế. Cô gửi ba mẹ ảnh bài viết của con.', media: [pic('thedu-chu-1')], parentLiked: false, parentClapped: false, voicePath: null, voiceDuration: null, parentReply: null, tags: ['Chữ đẹp hơn'] },
  ];
  return demoReportList;
}

function demoStatus(p: AdminParentRow): AdminParentRow['status'] {
  if (!p.isActive) return 'LOCKED';
  const enr = p.students.flatMap((s) => s.enrollments);
  if (enr.length === 0) return 'GUEST';
  return enr.some((e) => e.sessionsRemaining !== null && e.sessionsRemaining < 3) ? 'EXPIRING' : 'ACTIVE';
}

function demoAdmin(): AdminParentRow[] {
  if (demoAdminList) return demoAdminList;
  const d = demo();
  demoAdminList = [
    {
      id: d.parent.id, phone: d.parent.phone, fullName: d.parent.fullName, isActive: true, status: 'EXPIRING', selfRegistered: false, lastLoginAt: new Date().toISOString(), pendingRequests: 0,
      students: d.students.map((s) => ({ id: s.id, fullName: s.fullName, birthYear: s.birthYear, campus: s.campus, enrollments: s.enrollments.map((e) => ({ id: e.id, courseCode: e.courseCode, level: e.level, sessionsTotal: e.sessionsTotal, sessionsRemaining: e.sessionsRemaining, schedule: e.schedule })) })),
    },
    { id: 'demo-parent-2', phone: '0987654321', fullName: 'Bố Bình (mẫu)', isActive: true, status: 'ACTIVE', selfRegistered: false, lastLoginAt: null, pendingRequests: 0, students: [{ id: 'demo-st-3', fullName: 'Gia Huy (mẫu)', birthYear: 2018, campus: 'NGO_THI_NHAM', enrollments: [{ id: 'demo-enr-3', courseCode: 'BOI_DUONG_TOAN_TV', level: 2, sessionsTotal: 32, sessionsRemaining: 18, schedule: [{ d: 2, start: '18:00', end: '19:30' }] }] }] },
    { id: 'demo-parent-3', phone: '0903111222', fullName: 'Chị Lan (mẫu)', isActive: true, status: 'GUEST', selfRegistered: true, lastLoginAt: new Date().toISOString(), pendingRequests: 0, students: [{ id: 'demo-st-4', fullName: 'Bảo Ngọc (mẫu)', birthYear: 2020, campus: 'NGO_THI_NHAM', enrollments: [] }] },
  ];
  return demoAdminList;
}
