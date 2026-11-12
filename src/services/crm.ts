/**
 * Staff CRM: trial schedule, lead status changes, completing trials.
 *
 * Calls the database functions crm_set_status() / crm_complete_trial() directly with the staff
 * member's own session — the database checks is_staff() — so this works even before the Edge
 * Function is deployed. The T+2h parent message is then sent by the 15-minute cron.
 * Without Supabase (dev), an in-memory demo schedule is used.
 */
import { supabase } from '@/lib/supabase';
import type { CampusLocation, CourseCategory, CrmFilter, CrmLead, CrmMessageKind, CrmMessageState, LeadStatus } from '@/types';
import { sleep, uuidv4 } from '@/utils/helpers';

import { ApiError } from './apiClient';

const LEAD_COLUMNS =
  'id, code, parent_name, phone_number, student_name, student_age, course_code, branch_location, appointment_time, status, teacher_note, staff_note, source, promo_code, created_at';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchCrmLeads(filter: CrmFilter, now = new Date()): Promise<CrmLead[]> {
  if (!supabase) return mockFetch(filter, now);

  let q = supabase.from('leads').select(LEAD_COLUMNS).limit(150);
  const today = startOfDay(now);
  switch (filter) {
    case 'TODAY':
      q = q.gte('appointment_time', today.toISOString()).lt('appointment_time', addDays(today, 1).toISOString())
        .order('appointment_time', { ascending: true });
      break;
    case 'UPCOMING':
      q = q.gte('appointment_time', today.toISOString()).lt('appointment_time', addDays(today, 8).toISOString())
        .not('status', 'in', '(CANCELLED,ENROLLED)')
        .order('appointment_time', { ascending: true });
      break;
    case 'PENDING':
      q = q.in('status', ['NEW', 'CONTACTED']).order('created_at', { ascending: false });
      break;
    case 'COMPLETED':
      q = q.eq('status', 'COMPLETED_TRIAL').order('appointment_time', { ascending: false });
      break;
  }
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  const rows = data ?? [];

  // Latest state of each automated message per lead (crm_logs is staff-readable via RLS).
  const messages = new Map<string, Partial<Record<CrmMessageKind, CrmMessageState>>>();
  if (rows.length) {
    const { data: logs } = await supabase
      .from('crm_logs')
      .select('lead_id, kind, status, error, created_at')
      .in('lead_id', rows.map((r) => r.id))
      .order('created_at', { ascending: false });
    for (const l of logs ?? []) {
      const m = messages.get(l.lead_id) ?? {};
      if (!m[l.kind]) m[l.kind] = { status: l.status, error: l.error, at: l.created_at };
      messages.set(l.lead_id, m);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    parentName: r.parent_name,
    phone: r.phone_number,
    studentName: r.student_name,
    studentAge: r.student_age,
    course: r.course_code as CourseCategory,
    campus: r.branch_location as CampusLocation,
    appointmentTime: r.appointment_time,
    status: r.status as LeadStatus,
    teacherNote: r.teacher_note,
    staffNote: r.staff_note,
    source: r.source,
    promoCode: r.promo_code,
    createdAt: r.created_at,
    messages: messages.get(r.id) ?? {},
  }));
}

// ─── Actions ────────────────────────────────────────────────────────────────

export type StaffSettableStatus = 'NEW' | 'CONTACTED' | 'CONFIRMED' | 'ENROLLED' | 'CANCELLED';

export async function setLeadStatus(id: string, status: StaffSettableStatus, note?: string): Promise<void> {
  if (!supabase) return mockSetStatus(id, status, note);
  const { error } = await supabase.rpc('crm_set_status', { p_lead_id: id, p_status: status, p_note: note ?? null });
  if (error) throw mapDbError(error);
}

export async function completeTrial(id: string, teacherNote: string): Promise<void> {
  if (!supabase) return mockComplete(id, teacherNote);
  const { error } = await supabase.rpc('crm_complete_trial', { p_lead_id: id, p_teacher_note: teacherNote });
  if (error) throw mapDbError(error);
}

// ─── Demo mode (no Supabase, dev only) ──────────────────────────────────────

let demo: CrmLead[] | null = null;

function demoLeads(now: Date): CrmLead[] {
  const at = (dayOffset: number, h: number, m: number) => {
    const d = addDays(startOfDay(now), dayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const sent = (minsAgo: number): CrmMessageState => ({ status: 'SENT', error: null, at: new Date(now.getTime() - minsAgo * 60_000).toISOString() });
  const base = (o: Partial<CrmLead>): CrmLead => ({
    id: uuidv4(), code: `TH-${Math.random().toString(16).slice(2, 8).toUpperCase()}`, parentName: '', phone: '', studentName: '', studentAge: 6,
    course: 'LUYEN_CHU_DEP', campus: 'XA_LA', appointmentTime: null, status: 'NEW', teacherNote: null, staffNote: null,
    source: 'FEED', promoCode: null, createdAt: new Date(now.getTime() - 2 * 86400_000).toISOString(), messages: {}, ...o,
  });
  return [
    base({ parentName: 'Mẹ Thu Trang (mẫu)', phone: '0912345678', studentName: 'Bé Gia Bảo', course: 'LUYEN_CHU_DEP', appointmentTime: at(0, 17, 30), status: 'REMINDED_2H', messages: { CONFIRMATION: sent(2880), REMINDER_24H: sent(1440), REMINDER_2H: sent(30) } }),
    base({ parentName: 'Bố Minh Đức (mẫu)', phone: '0987654321', studentName: 'Bé Khánh Linh', studentAge: 7, course: 'TOAN_TU_DUY', appointmentTime: at(0, 19, 0), status: 'CONFIRMED', promoCode: 'CLB_PHU_HUYNH_100K', messages: { CONFIRMATION: sent(600) } }),
    base({ parentName: 'Mẹ Lan Anh (mẫu)', phone: '0903111222', studentName: 'Bé Minh Anh', studentAge: 5, course: 'TIEN_TIEU_HOC', campus: 'NGO_THI_NHAM', appointmentTime: at(1, 17, 30), status: 'NEW', source: 'QUIZ', messages: { CONFIRMATION: { status: 'SKIPPED', error: 'Chưa cấu hình mẫu ZNS', at: new Date(now.getTime() - 3600_000).toISOString() } } }),
    base({ parentName: 'Mẹ Hồng Nhung (mẫu)', phone: '0934555666', studentName: 'Bé Đức Huy', studentAge: 8, course: 'BOI_DUONG_TOAN_TV', appointmentTime: at(3, 9, 45), status: 'CONTACTED', source: 'SHARE_LINK' }),
    base({ parentName: 'Bố Quang Huy (mẫu)', phone: '0977888999', studentName: 'Bé Bảo Nam', course: 'TOAN_TU_DUY', appointmentTime: at(-1, 17, 30), status: 'COMPLETED_TRIAL', teacherNote: 'Bảo Nam tính nhẩm nhanh, cần luyện đọc hiểu đề toán có lời văn.', messages: { CONFIRMATION: sent(4000), POST_TRIAL: sent(1200) } }),
  ];
}

const inFilter = (l: CrmLead, f: CrmFilter, now: Date) => {
  const t = l.appointmentTime ? new Date(l.appointmentTime).getTime() : NaN;
  const today = startOfDay(now).getTime();
  switch (f) {
    case 'TODAY': return t >= today && t < addDays(startOfDay(now), 1).getTime();
    case 'UPCOMING': return t >= today && t < addDays(startOfDay(now), 8).getTime() && !['CANCELLED', 'ENROLLED'].includes(l.status);
    case 'PENDING': return l.status === 'NEW' || l.status === 'CONTACTED';
    case 'COMPLETED': return l.status === 'COMPLETED_TRIAL';
  }
};

async function mockFetch(filter: CrmFilter, now: Date) {
  await sleep(300);
  demo ??= demoLeads(now);
  return demo.filter((l) => inFilter(l, filter, now)).sort((a, b) => (a.appointmentTime ?? '').localeCompare(b.appointmentTime ?? ''));
}

async function mockSetStatus(id: string, status: StaffSettableStatus, note?: string) {
  await sleep(250);
  demo = (demo ?? []).map((l) => (l.id === id ? { ...l, status, staffNote: note ?? l.staffNote } : l));
}

async function mockComplete(id: string, note: string) {
  await sleep(250);
  if (note.trim().length < 10) throw new ApiError('Nhận xét của giáo viên cần 10–1000 ký tự', 'VALIDATION', 422, 'teacher_note');
  demo = (demo ?? []).map((l) => (l.id === id ? { ...l, status: 'COMPLETED_TRIAL', teacherNote: note.trim() } : l));
}
