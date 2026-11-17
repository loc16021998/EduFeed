/**
 * Staff operations: roles (RBAC), classes, attendance (QR + manual), batch contact-book entries, tasks.
 * Every rule (who sees which class / lead / student) is enforced by the database — these calls only ask.
 * Without Supabase: in-memory sample data, labelled on screen.
 */
import { supabase } from '@/lib/supabase';
import type { CampusLocation, CourseCategory, PickedMedia } from '@/types';
import { sleep, uuidv4 } from '@/utils/helpers';

import { ApiError } from './apiClient';
import { uploadMedia } from './media/storageUpload';
import type { ScheduleSlot } from './parentPortal';

export type StaffKind = 'ADMIN' | 'MANAGER' | 'TEACHER' | 'ADVISOR';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';
export type TaskType = 'LEAD_FOLLOWUP' | 'MAKEUP_CLASS' | 'HOMEWORK_GRADE' | 'OTHER';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface ClassInfo {
  id: string;
  name: string;
  courseCode: CourseCategory;
  level: number;
  campus: CampusLocation;
  teacherId: string | null;
  teacherName: string | null;
  schedule: ScheduleSlot[];
  isActive: boolean;
  members: number;
}

export interface RosterRow {
  enrollmentId: string;
  studentId: string | null;
  studentName: string;
  sessionsRemaining: number | null;
  linked: boolean;
  attendance: { status: AttendanceStatus; method: 'QR' | 'MANUAL'; time: string } | null;
  reported: boolean;
}

export interface StaffTask {
  id: string;
  title: string;
  description: string | null;
  targetType: TaskType;
  targetId: string | null;
  dueDate: string;
  priority: 1 | 2 | 3;
  status: TaskStatus;
  resultNote: string | null;
  completedAt: string | null;
  auto: boolean;
  assignee: string | null;
  lead: { id: string; code: string; parentName: string; phone: string; studentName: string; courseCode: CourseCategory; branch: CampusLocation; status: string; appointmentTime: string | null } | null;
  request: { id: string; requestedDate: string; reason: string; studentName: string; parentPhone: string | null } | null;
}

export interface StaffMember {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  displayName: string | null;
  kind: StaffKind;
  hasProfile: boolean;
  campus: CampusLocation | null;
  openTasks: number;
}

export interface ClassCandidate {
  enrollmentId: string;
  studentName: string;
  inClass: boolean;
  otherClass: string | null;
}

/** Quick feedback chips for batch reports (shown to parents as tags). */
export const FEEDBACK_TAGS = ['Tập trung', 'Tích cực phát biểu', 'Chữ đẹp hơn', 'Tính nhẩm nhanh', 'Đọc trôi chảy', 'Hoàn thành bài tập', 'Cần luyện thêm ở nhà', 'Cần cẩn thận hơn'];

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/staff_|class_|attendance_|daily_report_batch/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có phân quyền & công việc. Chạy supabase/sql/upgrades/20261126090000_staff_rbac_tasks.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

const slots = (v: unknown): ScheduleSlot[] => (Array.isArray(v) ? (v as ScheduleSlot[]).filter((s) => typeof s?.d === 'number') : []);
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** JS weekday → schedule d (2…7, 8 = CN). */
export const todayD = () => (new Date().getDay() === 0 ? 8 : new Date().getDay() + 1);

// ─── Role ───────────────────────────────────────────────────────────────────

export async function fetchMyKind(): Promise<StaffKind | null> {
  if (!supabase) return demoKind;
  return rpc<StaffKind | null>('staff_kind');
}

// ─── Classes ────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const toClass = (c: any): ClassInfo => ({
  id: c.id, name: c.name, courseCode: c.course_code, level: c.level, campus: c.campus_location, teacherId: c.teacher_id,
  teacherName: c.teacher_name, schedule: slots(c.schedule), isActive: c.is_active, members: Number(c.members ?? 0),
});

export async function listClasses(): Promise<ClassInfo[]> {
  if (!supabase) {
    await sleep(200);
    return demo().classes.map((c) => ({ ...c, members: demo().members.filter((m) => m.classId === c.id).length }));
  }
  return (await rpc<any[]>('class_list')).map(toClass);
}

export async function saveClass(c: { id?: string; name: string; courseCode: CourseCategory; level: number; campus: CampusLocation; teacherId: string | null; schedule: ScheduleSlot[]; isActive?: boolean }): Promise<string> {
  if (c.name.trim().length < 2) throw new ApiError('Tên lớp 2–60 ký tự', 'VALIDATION', 422, 'name');
  if (!supabase) {
    await sleep(200);
    const d = demo();
    const ex = d.classes.find((x) => x.id === c.id);
    const teacherName = d.staff.find((s) => s.id === c.teacherId)?.displayName ?? null;
    if (ex) Object.assign(ex, { ...c, name: c.name.trim(), teacherName, isActive: c.isActive ?? ex.isActive });
    else d.classes.push({ id: uuidv4(), name: c.name.trim(), courseCode: c.courseCode, level: c.level, campus: c.campus, teacherId: c.teacherId, teacherName, schedule: c.schedule, isActive: true, members: 0 });
    return c.id ?? d.classes[d.classes.length - 1].id;
  }
  const r = await rpc<{ id: string }>('admin_class_upsert', {
    p: { id: c.id ?? null, name: c.name.trim(), course_code: c.courseCode, level: c.level, campus_location: c.campus, teacher_id: c.teacherId, schedule: c.schedule, ...(c.isActive === undefined ? {} : { is_active: c.isActive }) },
  });
  return r.id;
}

export async function classCandidates(classId: string): Promise<ClassCandidate[]> {
  if (!supabase) {
    await sleep(200);
    const d = demo();
    return d.roster.map((r) => ({ enrollmentId: r.enrollmentId, studentName: r.studentName, inClass: d.members.some((m) => m.classId === classId && m.enrollmentId === r.enrollmentId), otherClass: null }));
  }
  return (await rpc<any[]>('class_candidates', { p_class_id: classId })).map((c) => ({ enrollmentId: c.enrollment_id, studentName: c.student_name, inClass: !!c.in_class, otherClass: c.other_class }));
}

export async function setClassMembers(classId: string, enrollmentIds: string[]): Promise<number> {
  if (!supabase) {
    await sleep(200);
    const d = demo();
    d.members = d.members.filter((m) => m.classId !== classId).concat(enrollmentIds.map((e) => ({ classId, enrollmentId: e })));
    return enrollmentIds.length;
  }
  return (await rpc<{ members: number }>('admin_class_members_set', { p_class_id: classId, p_enrollment_ids: enrollmentIds })).members;
}

// ─── Teacher: roster, attendance, batch reports ─────────────────────────────

export async function fetchRoster(classId: string, date?: string): Promise<RosterRow[]> {
  if (!supabase) {
    await sleep(200);
    const d = demo();
    return d.roster.filter((r) => d.members.some((m) => m.classId === classId && m.enrollmentId === r.enrollmentId)).map((r) => ({ ...r }));
  }
  return (await rpc<any[]>('class_roster', { p_class_id: classId, p_date: date ?? null })).map((r) => ({
    enrollmentId: r.enrollment_id, studentId: r.student_id, studentName: r.student_name, sessionsRemaining: r.sessions_remaining,
    linked: !!r.linked, attendance: r.attendance ? { status: r.attendance.status, method: r.attendance.method, time: r.attendance.time } : null, reported: !!r.reported,
  }));
}

export async function markAttendance(classId: string, studentId: string, status: AttendanceStatus): Promise<void> {
  if (!supabase) {
    await sleep(120);
    const r = demo().roster.find((x) => x.studentId === studentId);
    if (r) r.attendance = { status, method: 'MANUAL', time: new Date().toISOString() };
    return;
  }
  await rpc('attendance_mark', { p_class_id: classId, p_student_id: studentId, p_status: status, p_method: 'MANUAL', p_date: null });
}

export async function scanAttendance(classId: string, code: string): Promise<{ studentName: string; status: AttendanceStatus; already: boolean }> {
  const token = code.trim();
  if (!token) throw new ApiError('Mã trống', 'VALIDATION', 422);
  if (!supabase) {
    await sleep(250);
    const raw = token.replace(/^THEDU-HS:/i, '').toUpperCase();
    const r = demo().roster.find((x) => x.qr === raw);
    if (!r || !demo().members.some((m) => m.classId === classId && m.enrollmentId === r.enrollmentId)) throw new ApiError('Mã QR không đúng — không tìm thấy học viên', 'NOT_FOUND', 404);
    const already = r.attendance?.status === 'PRESENT' || r.attendance?.status === 'LATE';
    if (!already) r.attendance = { status: 'PRESENT', method: 'QR', time: new Date().toISOString() };
    return { studentName: r.studentName, status: r.attendance!.status, already };
  }
  const r = await rpc<{ student_name: string; status: AttendanceStatus; already: boolean }>('attendance_scan', { p_class_id: classId, p_token: token });
  return { studentName: r.student_name, status: r.status, already: r.already };
}

export async function sendBatchReport(input: {
  classId: string;
  studentIds: string[];
  feedback: string;
  tags: string[];
  photos: PickedMedia[];
  date?: string;
  onProgress?: (f: number) => void;
}): Promise<{ created: number; skipped: number }> {
  if (input.studentIds.length === 0) throw new ApiError('Chọn ít nhất 1 học viên', 'VALIDATION', 422, 'students');
  if (input.photos.length > 6) throw new ApiError('Tối đa 6 ảnh', 'VALIDATION', 422, 'media');
  if (!supabase) {
    await sleep(400);
    let created = 0;
    for (const r of demo().roster) {
      if (r.studentId && input.studentIds.includes(r.studentId) && !r.reported) {
        r.reported = true;
        if (r.sessionsRemaining !== null) r.sessionsRemaining = Math.max(0, r.sessionsRemaining - 1);
        created++;
      }
    }
    return { created, skipped: input.studentIds.length - created };
  }
  const date = input.date ?? todayIso();
  const paths: string[] = [];
  for (let i = 0; i < input.photos.length; i++) {
    const p = input.photos[i];
    const ext = /png/.test(p.type) ? 'png' : /webp/.test(p.type) ? 'webp' : 'jpg';
    const path = `class/${input.classId}/${date}-${uuidv4().slice(0, 8)}.${ext}`;
    await uploadMedia(path, p, (f) => input.onProgress?.((i + f) / input.photos.length), 'class-reports');
    paths.push(path);
  }
  return rpc<{ created: number; skipped: number }>('daily_report_batch', {
    p_class_id: input.classId, p_session_date: date, p_student_ids: input.studentIds, p_feedback: input.feedback.trim() || null, p_tags: input.tags, p_media: paths,
  });
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

const toTask = (t: any): StaffTask => ({
  id: t.id, title: t.title, description: t.description, targetType: t.target_type, targetId: t.target_id, dueDate: t.due_date,
  priority: t.priority, status: t.status, resultNote: t.result_note, completedAt: t.completed_at, auto: !!t.auto, assignee: t.assignee,
  lead: t.lead ? { id: t.lead.id, code: t.lead.code, parentName: t.lead.parent_name, phone: t.lead.phone, studentName: t.lead.student_name, courseCode: t.lead.course_code, branch: t.lead.branch, status: t.lead.status, appointmentTime: t.lead.appointment_time } : null,
  request: t.request ? { id: t.request.id, requestedDate: t.request.requested_date, reason: t.request.reason, studentName: t.request.student_name, parentPhone: t.request.parent_phone } : null,
});

export async function listTasks(scope: 'MINE' | 'ALL', status: 'OPEN' | 'DONE'): Promise<StaffTask[]> {
  if (!supabase) {
    await sleep(200);
    return demo().tasks.filter((t) => (status === 'DONE' ? t.status === 'COMPLETED' : t.status !== 'COMPLETED')).map((t) => ({ ...t }));
  }
  return (await rpc<any[]>('staff_task_list', { p_scope: scope, p_status: status })).map(toTask);
}

export async function updateTask(id: string, status: TaskStatus, note?: string): Promise<void> {
  if (note && note.length > 500) throw new ApiError('Ghi chú tối đa 500 ký tự', 'VALIDATION', 422, 'note');
  if (!supabase) {
    await sleep(150);
    const t = demo().tasks.find((x) => x.id === id);
    if (t) Object.assign(t, { status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null, resultNote: note?.trim() || t.resultNote });
    return;
  }
  await rpc('staff_task_update', { p_task_id: id, p_status: status, p_note: note?.trim() || null });
}

export async function createTask(t: { assignedTo: string; title: string; description?: string; type: TaskType; targetId?: string | null; due: string; priority: 1 | 2 | 3 }): Promise<void> {
  if (t.title.trim().length < 3) throw new ApiError('Tiêu đề ít nhất 3 ký tự', 'VALIDATION', 422, 'title');
  if (!supabase) {
    await sleep(200);
    demo().tasks.unshift({ id: uuidv4(), title: t.title.trim(), description: t.description?.trim() || null, targetType: t.type, targetId: t.targetId ?? null, dueDate: t.due, priority: t.priority, status: 'PENDING', resultNote: null, completedAt: null, auto: false, assignee: demo().staff.find((s) => s.id === t.assignedTo)?.displayName ?? null, lead: null, request: null });
    return;
  }
  await rpc('staff_task_create', { p_assigned_to: t.assignedTo, p_title: t.title.trim(), p_description: t.description?.trim() || null, p_type: t.type, p_target_id: t.targetId ?? null, p_due: t.due, p_priority: t.priority });
}

// ─── Staff directory & roles ────────────────────────────────────────────────

export async function staffDirectory(): Promise<StaffMember[]> {
  if (!supabase) {
    await sleep(150);
    return demo().staff.map((s) => ({ ...s }));
  }
  return (await rpc<any[]>('staff_directory')).map((s) => ({
    id: s.id, email: s.email, role: s.role, displayName: s.display_name, kind: s.kind, hasProfile: !!s.has_profile, campus: s.campus_location, openTasks: Number(s.open_tasks ?? 0),
  }));
}

export async function setStaffProfile(userId: string, kind: Exclude<StaffKind, 'ADMIN'>, campus: CampusLocation | null, displayName?: string): Promise<void> {
  if (!supabase) {
    await sleep(150);
    const s = demo().staff.find((x) => x.id === userId);
    if (s) Object.assign(s, { kind, campus, hasProfile: true, displayName: displayName?.trim() || s.displayName });
    return;
  }
  await rpc('admin_staff_profile_set', { p_user_id: userId, p_kind: kind, p_campus: campus, p_display_name: displayName?.trim() || null });
}

/** Parent: content of the child's check-in QR. */
export async function fetchStudentQr(studentId: string): Promise<string> {
  if (!supabase) {
    await sleep(150);
    return `THEDU-HS:${demo().roster.find((r) => r.studentId === studentId)?.qr ?? 'DEMO0000000000000001'}`;
  }
  return rpc<string>('parent_student_qr', { p_student_id: studentId });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Demo ───────────────────────────────────────────────────────────────────

let demoKind: StaffKind = 'ADMIN';
/** Demo sign-in decides the kind (admin@… = ADMIN, others = TEACHER). */
export const setDemoKind = (k: StaffKind) => (demoKind = k);

interface DemoState {
  classes: ClassInfo[];
  members: { classId: string; enrollmentId: string }[];
  roster: (RosterRow & { qr: string })[];
  tasks: StaffTask[];
  staff: StaffMember[];
}
let demoState: DemoState | null = null;
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
function demo(): DemoState {
  if (demoState) return demoState;
  const t1 = 'demo-staff-huong';
  const adv = 'demo-staff-mai';
  const cls = 'demo-class-a1';
  demoState = {
    staff: [
      { id: 'demo-admin', email: 'admin@thedu.vn', role: 'admin', displayName: 'Quản trị (mẫu)', kind: 'ADMIN', hasProfile: false, campus: null, openTasks: 0 },
      { id: t1, email: 'co.huong@thedu.vn', role: 'staff', displayName: 'Cô Hường (mẫu)', kind: 'TEACHER', hasProfile: true, campus: 'XA_LA', openTasks: 1 },
      { id: adv, email: 'chi.mai@thedu.vn', role: 'staff', displayName: 'Chị Mai – tư vấn (mẫu)', kind: 'ADVISOR', hasProfile: true, campus: 'XA_LA', openTasks: 2 },
      { id: 'demo-staff-tu', email: 'thay.tu@thedu.vn', role: 'staff', displayName: null, kind: 'MANAGER', hasProfile: false, campus: null, openTasks: 0 },
    ],
    classes: [{ id: cls, name: 'Tiền tiểu học A1 (mẫu)', courseCode: 'TIEN_TIEU_HOC', level: 1, campus: 'XA_LA', teacherId: t1, teacherName: 'Cô Hường (mẫu)', schedule: [{ d: 2, start: '17:30', end: '19:00' }, { d: 4, start: '17:30', end: '19:00' }, { d: 6, start: '17:30', end: '19:00' }], isActive: true, members: 3 }],
    members: [
      { classId: cls, enrollmentId: 'demo-e1' },
      { classId: cls, enrollmentId: 'demo-e2' },
      { classId: cls, enrollmentId: 'demo-e3' },
    ],
    roster: [
      { enrollmentId: 'demo-e1', studentId: 'demo-student-khoi', studentName: 'Minh Khôi (mẫu)', sessionsRemaining: 2, linked: true, attendance: null, reported: false, qr: 'DEMO0000000000000001' },
      { enrollmentId: 'demo-e2', studentId: 'demo-s2', studentName: 'Gia Bảo (mẫu)', sessionsRemaining: 14, linked: true, attendance: null, reported: false, qr: 'DEMO0000000000000002' },
      { enrollmentId: 'demo-e3', studentId: 'demo-s3', studentName: 'Bảo Ngọc (mẫu)', sessionsRemaining: 9, linked: true, attendance: null, reported: false, qr: 'DEMO0000000000000003' },
    ],
    tasks: [
      { id: 'demo-t1', title: 'Gọi xác nhận học thử – Chị Lan (mẫu)', description: 'Bé Na (6 tuổi) · Tiền tiểu học · Xa La', targetType: 'LEAD_FOLLOWUP', targetId: 'demo-lead-1', dueDate: inHours(-1), priority: 1, status: 'PENDING', resultNote: null, completedAt: null, auto: true, assignee: 'Chị Mai – tư vấn (mẫu)', lead: { id: 'demo-lead-1', code: 'TH-1A2B3C', parentName: 'Chị Lan (mẫu)', phone: '0903111222', studentName: 'Bé Na', courseCode: 'TIEN_TIEU_HOC', branch: 'XA_LA', status: 'NEW', appointmentTime: inHours(26) }, request: null },
      { id: 'demo-t2', title: 'Gọi tư vấn khóa tiếp theo – Khánh Linh (mẫu)', description: 'Học viên đã hoàn thành khóa TOAN_TU_DUY 14 ngày trước.', targetType: 'LEAD_FOLLOWUP', targetId: 'demo-lead-2', dueDate: inHours(5), priority: 2, status: 'IN_PROGRESS', resultNote: null, completedAt: null, auto: true, assignee: 'Chị Mai – tư vấn (mẫu)', lead: { id: 'demo-lead-2', code: 'TH-4D5E6F', parentName: 'Bố Minh Đức (mẫu)', phone: '0987654321', studentName: 'Khánh Linh', courseCode: 'TOAN_TU_DUY', branch: 'XA_LA', status: 'ENROLLED', appointmentTime: null }, request: null },
      { id: 'demo-t3', title: 'Xếp buổi học bù – Minh Khôi (mẫu)', description: 'Bé ốm hôm thứ Hai', targetType: 'MAKEUP_CLASS', targetId: 'demo-req', dueDate: inHours(30), priority: 2, status: 'PENDING', resultNote: null, completedAt: null, auto: true, assignee: 'Cô Hường (mẫu)', lead: null, request: { id: 'demo-req', requestedDate: inHours(30).slice(0, 10), reason: 'Bé ốm hôm thứ Hai', studentName: 'Minh Khôi (mẫu)', parentPhone: '0912000111' } },
    ],
  };
  return demoState;
}
