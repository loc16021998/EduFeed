/**
 * Admin dashboard data.
 *  - KPIs, channels and funnel come from dashboard_summary() (staff-only database function).
 *  - The lead table reads `leads` directly (staff RLS), one page at a time.
 *  - Tuition fees (course_fees) are entered by staff; revenue is only estimated from those.
 * Without Supabase (dev), a generated sample data set is used — the screen labels it "Dữ liệu mẫu".
 */
import { supabase } from '@/lib/supabase';
import type {
  CampusFilter,
  CourseCategory,
  CourseFees,
  DashboardLead,
  DashboardSummary,
  LeadChannel,
  LeadStatus,
  LeadStatusGroup,
} from '@/types';
import { sleep } from '@/utils/helpers';

import { ApiError } from './apiClient';

export const STATUS_GROUPS: Record<Exclude<LeadStatusGroup, 'ALL'>, LeadStatus[]> = {
  TO_CONTACT: ['NEW', 'CONTACTED'],
  SCHEDULED: ['CONFIRMED', 'REMINDED_24H', 'REMINDED_2H'],
  TRIAL_DONE: ['COMPLETED_TRIAL'],
  ENROLLED: ['ENROLLED'],
  CANCELLED: ['CANCELLED'],
};

export const PAGE_SIZE = 20;

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  if (error.hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  if (/dashboard_summary|course_fees|channel/.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa được nâng cấp cho trang Tổng quan. Chạy supabase/sql/upgrades/20261116090000_dashboard_analytics.sql.', 'INTERNAL');
  }
  return new ApiError('Không tải được số liệu, vui lòng thử lại.', 'INTERNAL');
}

const sinceIso = (days: number, now = Date.now()) => new Date(now - days * 86400_000).toISOString();

// ─── Summary ────────────────────────────────────────────────────────────────

interface SummaryRow {
  period: { days: number };
  leads: { current: number; previous: number };
  trials_today: { scheduled: number; completed: number };
  trial_conversion: { completed: number; enrolled: number };
  revenue: { month_start: string; enrolled: number; priced: number; total_vnd: number; missing_fee_courses: string[] };
  channels: Record<string, number>;
  funnel: { app_sessions: number; video_sessions: number; leads: number; trials_done: number; enrolled: number; tracking_since: string | null };
}

export async function fetchDashboardSummary(campus: CampusFilter, days: number): Promise<DashboardSummary> {
  if (!supabase) return mockSummary(campus, days);
  const { data, error } = await supabase.rpc('dashboard_summary', { p_branch: campus === 'ALL' ? null : campus, p_days: days });
  if (error) throw mapDbError(error);
  const r = data as unknown as SummaryRow;
  return {
    periodDays: r.period.days,
    leads: r.leads,
    trialsToday: r.trials_today,
    trialConversion: r.trial_conversion,
    revenue: {
      monthStart: r.revenue.month_start,
      enrolled: r.revenue.enrolled,
      priced: r.revenue.priced,
      totalVnd: r.revenue.total_vnd,
      missingFeeCourses: r.revenue.missing_fee_courses as CourseCategory[],
    },
    channels: r.channels as DashboardSummary['channels'],
    funnel: {
      appSessions: r.funnel.app_sessions,
      videoSessions: r.funnel.video_sessions,
      leads: r.funnel.leads,
      trialsDone: r.funnel.trials_done,
      enrolled: r.funnel.enrolled,
      trackingSince: r.funnel.tracking_since,
    },
  };
}

// ─── Lead table ─────────────────────────────────────────────────────────────

export interface LeadPageQuery {
  campus: CampusFilter;
  days: number;
  group: LeadStatusGroup;
  /** Free text: parent / child name, phone or booking code. */
  search?: string;
  /** 0-based page index. */
  page: number;
}

export interface LeadPage {
  items: DashboardLead[];
  hasMore: boolean;
}

const LEAD_COLUMNS =
  'id, code, parent_name, phone_number, student_name, student_age, course_code, branch_location, status, channel, utm_campaign, created_at';

/** Characters with a meaning in PostgREST filters (or-list, grouping, wildcards, quoting, escapes). */
const FILTER_SYNTAX = /[,()*%:.\\"'`]/g;

/** Safe search terms (no PostgREST filter syntax), max 40 chars. */
export function cleanSearch(raw?: string): { text: string; digits: string } {
  const text = (raw ?? '').replace(FILTER_SYNTAX, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { text, digits: text.replace(/\D/g, '') };
}

function matchesSearch(l: DashboardLead, raw?: string): boolean {
  const { text, digits } = cleanSearch(raw);
  if (!text) return true;
  const t = text.toLowerCase();
  return (
    l.parentName.toLowerCase().includes(t) ||
    l.studentName.toLowerCase().includes(t) ||
    l.code.toLowerCase().includes(t) ||
    (digits.length >= 3 && l.phone.includes(digits))
  );
}

export async function fetchDashboardLeads(q: LeadPageQuery): Promise<LeadPage> {
  if (!supabase) return mockLeads(q);
  const from = q.page * PAGE_SIZE;
  // One extra row tells whether another page exists.
  let query = supabase
    .from('leads')
    .select(LEAD_COLUMNS)
    .gte('created_at', sinceIso(q.days))
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE);
  if (q.campus !== 'ALL') query = query.eq('branch_location', q.campus);
  if (q.group !== 'ALL') query = query.in('status', STATUS_GROUPS[q.group]);
  const s = cleanSearch(q.search);
  if (s.text) {
    // PostgREST or(): commas / parentheses / wildcards are stripped from the input by cleanSearch.
    const parts = [`parent_name.ilike.*${s.text}*`, `student_name.ilike.*${s.text}*`, `code.ilike.*${s.text}*`];
    if (s.digits.length >= 3) parts.push(`phone_number.like.*${s.digits}*`);
    query = query.or(parts.join(','));
  }

  const { data, error } = await query;
  if (error) throw mapDbError(error);
  const rows = data ?? [];
  return {
    hasMore: rows.length > PAGE_SIZE,
    items: rows.slice(0, PAGE_SIZE).map((r) => ({
      id: r.id,
      code: r.code,
      parentName: r.parent_name,
      phone: r.phone_number,
      studentName: r.student_name,
      studentAge: r.student_age,
      course: r.course_code as CourseCategory,
      campus: r.branch_location as DashboardLead['campus'],
      status: r.status as LeadStatus,
      channel: r.channel as LeadChannel,
      campaign: r.utm_campaign,
      createdAt: r.created_at,
    })),
  };
}

// ─── Tuition ────────────────────────────────────────────────────────────────

export const FEE_MIN_VND = 100_000;
export const FEE_MAX_VND = 50_000_000;

export async function fetchCourseFees(): Promise<CourseFees> {
  if (!supabase) {
    await sleep(150);
    return { ...demoFees };
  }
  const { data, error } = await supabase.from('course_fees').select('course_code, monthly_fee_vnd');
  if (error) throw mapDbError(error);
  return Object.fromEntries((data ?? []).map((r) => [r.course_code, r.monthly_fee_vnd])) as CourseFees;
}

/** Saves the given fees; a course set to null is removed (revenue for it becomes "unknown" again). */
export async function saveCourseFees(fees: Partial<Record<CourseCategory, number | null>>): Promise<void> {
  for (const v of Object.values(fees)) {
    if (v != null && (!Number.isInteger(v) || v < FEE_MIN_VND || v > FEE_MAX_VND)) {
      throw new ApiError('Học phí phải từ 100.000đ đến 50.000.000đ / tháng', 'VALIDATION', 422, 'monthly_fee_vnd');
    }
  }
  const upserts = Object.entries(fees).filter(([, v]) => v != null).map(([course_code, v]) => ({ course_code, monthly_fee_vnd: v as number }));
  const removals = Object.entries(fees).filter(([, v]) => v == null).map(([c]) => c);

  if (!supabase) {
    await sleep(250);
    for (const { course_code, monthly_fee_vnd } of upserts) demoFees[course_code as CourseCategory] = monthly_fee_vnd;
    for (const c of removals) delete demoFees[c as CourseCategory];
    return;
  }
  if (upserts.length) {
    const { error } = await supabase.from('course_fees').upsert(upserts, { onConflict: 'course_code' });
    if (error) throw mapDbError(error);
  }
  if (removals.length) {
    const { error } = await supabase.from('course_fees').delete().in('course_code', removals);
    if (error) throw mapDbError(error);
  }
}

// ─── Demo data (no Supabase, dev only) ──────────────────────────────────────

interface DemoLead extends DashboardLead {
  trialDone: boolean;
  trialCompletedAt: string | null;
  enrolledAt: string | null;
  appointmentTime: string | null;
}

const demoFees: CourseFees = {};
let demo: DemoLead[] | null = null;

function demoData(now: number): DemoLead[] {
  // Deterministic pseudo-random sequence so screenshots / tests are stable.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const parents = ['Mẹ Thu Trang', 'Bố Minh Đức', 'Mẹ Lan Anh', 'Mẹ Hồng Nhung', 'Bố Quang Huy', 'Mẹ Ngọc Mai', 'Bố Tuấn Anh', 'Mẹ Phương Thảo', 'Mẹ Thanh Hà', 'Bố Văn Nam'];
  const kids = ['Gia Bảo', 'Khánh Linh', 'Minh Anh', 'Đức Huy', 'Bảo Nam', 'An Nhiên', 'Tuệ Lâm', 'Hà My', 'Minh Khang', 'Bảo Ngọc'];
  const courses: CourseCategory[] = ['TIEN_TIEU_HOC', 'LUYEN_CHU_DEP', 'TOAN_TU_DUY', 'BOI_DUONG_TOAN_TV'];
  const channels: LeadChannel[] = ['FACEBOOK', 'FACEBOOK', 'FACEBOOK', 'TIKTOK', 'TIKTOK', 'ZALO', 'REFERRAL', 'REFERRAL', 'UNTRACKED'];
  const campaigns: Partial<Record<LeadChannel, string>> = { FACEBOOK: 'khai-giang-t11', TIKTOK: 'video-luyen-chu', ZALO: 'oa-broadcast' };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const out: DemoLead[] = [];
  for (let i = 0; i < 64; i++) {
    const ageDays = i < 3 ? 0 : Math.floor(rnd() * 90);
    const created = now - ageDays * 86400_000 - Math.floor(rnd() * 8) * 3600_000;
    const channel = pick(channels);
    const r = rnd();
    // Older leads have had time to progress further.
    let status: LeadStatus =
      ageDays < 2 ? pick(['NEW', 'NEW', 'CONTACTED', 'CONFIRMED'] as const)
      : r < 0.12 ? 'CANCELLED'
      : r < 0.3 ? 'CONTACTED'
      : r < 0.45 ? 'CONFIRMED'
      : r < 0.7 ? 'COMPLETED_TRIAL'
      : 'ENROLLED';
    let appointmentTime: string | null = null;
    if (i < 4) {
      // A few trials today for the "today" KPI.
      status = i === 3 ? 'COMPLETED_TRIAL' : 'REMINDED_2H';
      appointmentTime = new Date(today.getTime() + (17 + (i % 2) * 2) * 3600_000).toISOString();
    }
    const trialDone = status === 'COMPLETED_TRIAL' || status === 'ENROLLED';
    const done = trialDone ? Math.min(now, created + 3 * 86400_000) : null;
    out.push({
      id: `demo-${i}`,
      code: `TH-${(0xa1b2c3 + i * 7919).toString(16).toUpperCase().slice(-6)}`,
      parentName: `${pick(parents)} (mẫu)`,
      phone: `09${String(10000000 + Math.floor(rnd() * 89999999)).slice(0, 8)}`,
      studentName: `Bé ${pick(kids)}`,
      studentAge: 4 + Math.floor(rnd() * 7),
      course: pick(courses),
      campus: rnd() < 0.6 ? 'XA_LA' : 'NGO_THI_NHAM',
      status,
      channel,
      campaign: campaigns[channel] ?? null,
      createdAt: new Date(created).toISOString(),
      trialDone,
      trialCompletedAt: done ? new Date(done).toISOString() : null,
      enrolledAt: status === 'ENROLLED' && done ? new Date(Math.min(now, done + 86400_000)).toISOString() : null,
      appointmentTime,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function demoSet(campus: CampusFilter) {
  demo ??= demoData(Date.now());
  return demo.filter((l) => campus === 'ALL' || l.campus === campus);
}

async function mockSummary(campus: CampusFilter, days: number): Promise<DashboardSummary> {
  await sleep(300);
  const now = Date.now();
  const all = demoSet(campus);
  const from = now - days * 86400_000;
  const prevFrom = now - 2 * days * 86400_000;
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
  const cur = all.filter((l) => t(l.createdAt) >= from);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const isToday = (iso: string | null) => t(iso) >= today.getTime() && t(iso) < today.getTime() + 86400_000;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const enrolledThisMonth = all.filter((l) => l.status === 'ENROLLED' && t(l.enrolledAt) >= monthStart.getTime());
  const priced = enrolledThisMonth.filter((l) => demoFees[l.course] != null);
  const channels: DashboardSummary['channels'] = {};
  for (const l of cur) channels[l.channel] = (channels[l.channel] ?? 0) + 1;
  const completedInPeriod = all.filter((l) => t(l.trialCompletedAt) >= from);

  return {
    periodDays: days,
    leads: { current: cur.length, previous: all.filter((l) => t(l.createdAt) >= prevFrom && t(l.createdAt) < from).length },
    trialsToday: {
      scheduled: all.filter((l) => isToday(l.appointmentTime) && l.status !== 'CANCELLED').length,
      completed: all.filter((l) => isToday(l.appointmentTime) && l.trialDone).length,
    },
    trialConversion: { completed: completedInPeriod.length, enrolled: completedInPeriod.filter((l) => l.status === 'ENROLLED').length },
    revenue: {
      monthStart: monthStart.toISOString(),
      enrolled: enrolledThisMonth.length,
      priced: priced.length,
      totalVnd: priced.reduce((n, l) => n + (demoFees[l.course] ?? 0), 0),
      missingFeeCourses: [...new Set(enrolledThisMonth.filter((l) => demoFees[l.course] == null).map((l) => l.course))],
    },
    channels,
    funnel: {
      // Anonymous visits are not tied to a campus — sample numbers only.
      appSessions: Math.round(days * 41),
      videoSessions: Math.round(days * 17),
      leads: cur.length,
      trialsDone: cur.filter((l) => l.trialDone).length,
      enrolled: cur.filter((l) => l.status === 'ENROLLED').length,
      trackingSince: new Date(now - 120 * 86400_000).toISOString(),
    },
  };
}

async function mockLeads(q: LeadPageQuery): Promise<LeadPage> {
  await sleep(250);
  const from = Date.now() - q.days * 86400_000;
  const list = demoSet(q.campus).filter(
    (l) => new Date(l.createdAt).getTime() >= from && (q.group === 'ALL' || STATUS_GROUPS[q.group].includes(l.status)) && matchesSearch(l, q.search),
  );
  const start = q.page * PAGE_SIZE;
  return { items: list.slice(start, start + PAGE_SIZE), hasMore: list.length > start + PAGE_SIZE };
}
