/**
 * Student lifecycle (staff): courses in progress / completed, completing a course, advisor call list,
 * and the public digital certificate.
 *
 * Completing a course uses POST /api/enrollments/:id/complete so the certificate message goes out at once;
 * if the Edge Function is not deployed, it falls back to the enrollment_complete() database function
 * (the messages are then sent by the daily 09:00 job).
 * Without Supabase (dev), an in-memory sample list is used.
 */
import { supabase } from '@/lib/supabase';
import type { CampusLocation, CourseCategory } from '@/types';
import { sleep, uuidv4 } from '@/utils/helpers';

import { validateCompleteEnrollment, type CompleteEnrollmentResponse } from '../../supabase/functions/_shared/contracts';
import { ApiError, callApi } from './apiClient';

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'DROPPED';
export type LifecycleStage = 'COMPLETION_CERT' | 'TEACHER_REVIEW' | 'ALUMNI_DISCOUNT' | 'FINAL_CALL';
export type AutomationStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
export type EnrollmentFilter = 'ACTIVE' | 'COMPLETED' | 'PRIORITY';

export interface Automation {
  stage: LifecycleStage;
  scheduledAt: string;
  status: AutomationStatus;
  error: string | null;
}

export interface Enrollment {
  id: string;
  leadId: string | null;
  studentName: string;
  parentName: string | null;
  phone: string | null;
  course: CourseCategory;
  level: number;
  campus: CampusLocation;
  startDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  teacherNote: string | null;
  certificateCode: string | null;
  advisorPriority: boolean;
  advisorFlaggedAt: string | null;
  advisorContactedAt: string | null;
  automations: Automation[];
}

export interface Certificate {
  code: string;
  studentName: string;
  course: CourseCategory;
  courseName: string;
  level: number;
  startDate: string;
  endDate: string;
  branchName: string;
}

export const STAGE_ORDER: LifecycleStage[] = ['COMPLETION_CERT', 'TEACHER_REVIEW', 'ALUMNI_DISCOUNT', 'FINAL_CALL'];

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/enrollments|enrollment_complete|lifecycle|get_certificate/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa được nâng cấp. Chạy supabase/sql/upgrades/20261122090000_lifecycle_upsell.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

interface Row {
  id: string;
  lead_id: string | null;
  student_name: string;
  course_code: string;
  level: number;
  campus_location: string;
  start_date: string;
  end_date: string | null;
  status: EnrollmentStatus;
  teacher_note: string | null;
  certificate_code: string | null;
  advisor_priority: boolean;
  advisor_flagged_at: string | null;
  advisor_contacted_at: string | null;
  leads: { parent_name: string; phone_number: string } | null;
  lifecycle_automations: { stage: LifecycleStage; scheduled_at: string; status: AutomationStatus; error: string | null }[];
}

const toEnrollment = (r: Row): Enrollment => ({
  id: r.id,
  leadId: r.lead_id,
  studentName: r.student_name,
  parentName: r.leads?.parent_name ?? null,
  phone: r.leads?.phone_number ?? null,
  course: r.course_code as CourseCategory,
  level: r.level,
  campus: r.campus_location as CampusLocation,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status,
  teacherNote: r.teacher_note,
  certificateCode: r.certificate_code,
  advisorPriority: r.advisor_priority,
  advisorFlaggedAt: r.advisor_flagged_at,
  advisorContactedAt: r.advisor_contacted_at,
  automations: [...(r.lifecycle_automations ?? [])]
    .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    .map((a) => ({ stage: a.stage, scheduledAt: a.scheduled_at, status: a.status, error: a.error })),
});

export async function listEnrollments(filter: EnrollmentFilter): Promise<Enrollment[]> {
  if (!supabase) return mockList(filter);
  let q = supabase
    .from('enrollments')
    .select('id, lead_id, student_name, course_code, level, campus_location, start_date, end_date, status, teacher_note, certificate_code, advisor_priority, advisor_flagged_at, advisor_contacted_at, leads(parent_name, phone_number), lifecycle_automations(stage, scheduled_at, status, error)')
    .limit(200);
  if (filter === 'ACTIVE') q = q.eq('status', 'ACTIVE').order('start_date', { ascending: false });
  else if (filter === 'COMPLETED') q = q.eq('status', 'COMPLETED').order('end_date', { ascending: false });
  else q = q.eq('advisor_priority', true).order('advisor_flagged_at', { ascending: true });
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return ((data ?? []) as unknown as Row[]).map(toEnrollment);
}

export interface CompleteInput {
  teacherNote: string;
  /** YYYY-MM-DD */
  endDate?: string;
  level?: number;
}

export async function completeEnrollment(id: string, input: CompleteInput): Promise<CompleteEnrollmentResponse> {
  const v = validateCompleteEnrollment(input);
  if (!v.ok) throw new ApiError(v.message, 'VALIDATION', 422, v.field);
  if (!supabase) return mockComplete(id, v.value);
  try {
    return await callApi<CompleteEnrollmentResponse>(`enrollments/${id}/complete`, { method: 'POST', body: v.value });
  } catch (e) {
    // Edge Function not deployed (404 / CORS failure): same transaction via the database function.
    if (!(e instanceof ApiError && (e.code === 'FUNCTION_UNAVAILABLE' || e.code === 'NETWORK'))) throw e;
  }
  const { data, error } = await supabase.rpc('enrollment_complete', {
    p_enrollment_id: id,
    p_teacher_note: v.value.teacherNote,
    p_end_date: v.value.endDate ?? null,
    p_level: v.value.level ?? null,
  });
  if (error) throw mapDbError(error);
  const r = data as unknown as { id: string; certificate_code: string; end_date: string; level: number };
  return { id: r.id, status: 'COMPLETED', certificateCode: r.certificate_code, endDate: r.end_date, level: r.level };
}

export async function dropEnrollment(id: string, note?: string): Promise<void> {
  if (!supabase) return mockPatch(id, (e) => ({ ...e, status: 'DROPPED', advisorPriority: false, automations: cancelPending(e.automations, 'Học viên dừng học') }));
  const { error } = await supabase.rpc('enrollment_drop', { p_enrollment_id: id, p_note: note ?? null });
  if (error) throw mapDbError(error);
}

export async function markAdvisorContacted(id: string, note?: string): Promise<void> {
  if (!supabase) {
    return mockPatch(id, (e) => ({ ...e, advisorPriority: false, advisorContactedAt: new Date().toISOString(), automations: cancelPending(e.automations, 'Tư vấn viên đã gọi') }));
  }
  const { error } = await supabase.rpc('enrollment_mark_contacted', { p_enrollment_id: id, p_note: note ?? null });
  if (error) throw mapDbError(error);
}

/** Public: certificate by its code (anyone with the link). null = not found. */
export async function fetchCertificate(code: string): Promise<Certificate | null> {
  if (!supabase) {
    await sleep(200);
    const e = demo().find((x) => x.certificateCode === code.trim().toUpperCase() && x.status === 'COMPLETED');
    return e ? { code: e.certificateCode!, studentName: e.studentName, course: e.course, courseName: e.course, level: e.level, startDate: e.startDate, endDate: e.endDate!, branchName: e.campus === 'XA_LA' ? 'Cơ sở Xa La' : 'Cơ sở Ngô Thì Nhậm' } : null;
  }
  const { data, error } = await supabase.rpc('get_certificate', { p_code: code });
  if (error) throw mapDbError(error);
  if (!data) return null;
  const c = data as unknown as { code: string; student_name: string; course_code: string; course_name: string; level: number; start_date: string; end_date: string; branch_name: string };
  return { code: c.code, studentName: c.student_name, course: c.course_code as CourseCategory, courseName: c.course_name, level: c.level, startDate: c.start_date, endDate: c.end_date, branchName: c.branch_name };
}

// ─── Demo mode ──────────────────────────────────────────────────────────────

let demoList: Enrollment[] | null = null;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
const at9 = (date: Date, plusDays: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + plusDays);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};
function schedule(end: Date, done: number): Automation[] {
  return STAGE_ORDER.map((stage, i) => ({
    stage,
    scheduledAt: at9(end, [0, 3, 7, 14][i]),
    status: i < done ? (stage === 'ALUMNI_DISCOUNT' ? 'SKIPPED' : 'SENT') : 'PENDING',
    error: stage === 'ALUMNI_DISCOUNT' && i < done ? 'Thiếu dữ liệu/cấu hình: ALUMNI_VOUCHER (chưa có ưu đãi học viên cũ thật)' : null,
  }));
}
const cancelPending = (a: Automation[], why: string): Automation[] => a.map((x) => (x.status === 'PENDING' ? { ...x, status: 'CANCELLED', error: why } : x));

function demo(): Enrollment[] {
  if (demoList) return demoList;
  const base = { leadId: uuidv4(), parentName: 'Mẹ Thu Trang (mẫu)', phone: '0912345678', teacherNote: null, certificateCode: null, advisorPriority: false, advisorFlaggedAt: null, advisorContactedAt: null, automations: [] as Automation[] };
  demoList = [
    { ...base, id: uuidv4(), studentName: 'Bé Gia Bảo (mẫu)', course: 'TIEN_TIEU_HOC', level: 1, campus: 'XA_LA', startDate: iso(daysAgo(80)), endDate: null, status: 'ACTIVE' },
    { ...base, id: uuidv4(), leadId: uuidv4(), parentName: 'Bố Minh Đức (mẫu)', phone: '0987654321', studentName: 'Bé Khánh Linh (mẫu)', course: 'TOAN_TU_DUY', level: 1, campus: 'NGO_THI_NHAM', startDate: iso(daysAgo(100)), endDate: iso(daysAgo(15)), status: 'COMPLETED', teacherNote: 'Khánh Linh tính nhẩm nhanh, cần luyện thêm toán có lời văn.', certificateCode: 'THEDU-DEMO0001', advisorPriority: true, advisorFlaggedAt: daysAgo(1).toISOString(), automations: schedule(daysAgo(15), 4) },
    { ...base, id: uuidv4(), leadId: uuidv4(), parentName: 'Mẹ Lan Anh (mẫu)', phone: '0903111222', studentName: 'Bé Minh Anh (mẫu)', course: 'LUYEN_CHU_DEP', level: 1, campus: 'XA_LA', startDate: iso(daysAgo(70)), endDate: iso(daysAgo(4)), status: 'COMPLETED', teacherNote: 'Minh Anh viết đều nét, đúng độ cao chữ; nên luyện thêm chữ nghiêng.', certificateCode: 'THEDU-DEMO0002', automations: schedule(daysAgo(4), 2) },
  ];
  return demoList;
}

async function mockList(filter: EnrollmentFilter) {
  await sleep(250);
  return demo().filter((e) => (filter === 'PRIORITY' ? e.advisorPriority : e.status === filter));
}

async function mockPatch(id: string, fn: (e: Enrollment) => Enrollment) {
  await sleep(250);
  demoList = demo().map((e) => (e.id === id ? fn(e) : e));
}

async function mockComplete(id: string, v: CompleteInput): Promise<CompleteEnrollmentResponse> {
  await sleep(300);
  const e = demo().find((x) => x.id === id);
  if (!e) throw new ApiError('Không tìm thấy khóa học của học viên', 'NOT_FOUND', 404);
  if (e.status !== 'ACTIVE') throw new ApiError('Khóa học này đã hoàn thành hoặc đã dừng', 'CONFLICT', 409);
  const endDate = v.endDate ?? iso(new Date());
  const code = `THEDU-${Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, '0')}`;
  const end = new Date(`${endDate}T00:00:00`);
  await mockPatch(id, (x) => ({ ...x, status: 'COMPLETED', endDate, level: v.level ?? x.level, teacherNote: v.teacherNote, certificateCode: code, automations: schedule(end, end.getTime() <= Date.now() ? 1 : 0) }));
  return { id, status: 'COMPLETED', certificateCode: code, endDate, level: v.level ?? e.level };
}
