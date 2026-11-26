/**
 * Admin Command Center data (supabase/migrations/20261204090000_admin_command_center.sql).
 * Everything else the command center shows comes from the existing services (CRM, payments,
 * parent accounts, videos, comments, staff tasks, release config).
 * Demo mode (no Supabase) returns small, clearly-labelled sample data.
 */
import { supabase } from '@/lib/supabase';
import { fetchReleaseConfigs } from '@/services/account';
import { ApiError } from '@/services/apiClient';
import { fetchInvoice } from '@/services/paymentService';
import type { CampusFilter, CampusLocation, CourseCategory, LeadChannel } from '@/types';

export type CommandRange = 'TODAY' | '7D' | '30D';
export const RANGE_DAYS: Record<CommandRange, number> = { TODAY: 1, '7D': 7, '30D': 30 };
export type SpendChannel = Exclude<LeadChannel, 'UNTRACKED'>;

export interface CommandInvoice {
  id: string;
  ref: string;
  studentName: string;
  course: CourseCategory;
  campus: CampusLocation;
  amountVnd: number;
  status: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';
  method: 'VIETQR' | 'VNPAY' | 'MANUAL' | null;
  receiptNo: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface ChannelStat {
  channel: LeadChannel;
  leads: number;
  enrolled: number;
  spendVnd: number;
  cpaVnd: number | null;
}

export interface CommandOverview {
  days: number;
  leads: { total: number; enrolled: number; cancelled: number };
  trials: { scheduled: number; attended: number };
  tuition: { collectedVnd: number; paidCount: number; unpaidVnd: number; unpaidCount: number };
  revenueByCourse: { course: CourseCategory; amountVnd: number; count: number }[];
  channels: ChannelStat[];
  spendVnd: number;
  recentInvoices: CommandInvoice[];
  queues: { attendanceRequests: number; newLeads: number; commentsToday: number; deletionRequests: number; openTasks: number };
}

export interface ClassReportRow {
  classId: string;
  className: string;
  course: CourseCategory;
  campus: CampusLocation;
  teacherName: string;
  slot: string | null;
  students: number;
  attended: number;
  reports: number;
}

export type CommentFilter = 'ALL' | 'QUESTIONS' | 'VISIBLE' | 'HIDDEN';
export interface ModerationComment {
  id: string;
  videoId: string;
  videoTitle: string;
  authorName: string;
  authorRole: 'PARENT' | 'TEACHER' | 'ADMIN' | 'GUEST';
  content: string;
  isHidden: boolean;
  isReply: boolean;
  createdAt: string;
}

export interface SystemHealth {
  push: { pending: number; failed24h: number; sent24h: number; oldestPendingAt: string | null; devices: number };
  weeklyDigest: { weekStart: string; published: number; zaloSent: number; drafts: number };
  zalo: { connected: boolean; expiresAt: string | null; lastError: string | null; lastErrorAt: string | null };
  release: { platform: 'android' | 'ios'; min: string; latest: string; force: boolean; updatedAt: string }[];
}

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

export const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Average cost per lead over channels that have spend recorded. */
export function averageCpa(channels: ChannelStat[]): number | null {
  const paid = channels.filter((c) => c.spendVnd > 0);
  const leads = paid.reduce((a, c) => a + c.leads, 0);
  const spend = paid.reduce((a, c) => a + c.spendVnd, 0);
  return leads > 0 && spend > 0 ? Math.round(spend / leads) : null;
}

/** "1,2 tr" / "850k" / "0 đ" — compact VND for KPI tiles. */
export function compactVnd(v: number): string {
  if (!v) return '0 đ';
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',').replace(',0', '')} tỷ`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} tr`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)}k`;
  return `${v} đ`;
}

/** Classes meeting today without a single contact-book entry yet. */
export const missingReports = (rows: ClassReportRow[]) => rows.filter((r) => r.students > 0 && r.reports === 0);

// ─── Errors ─────────────────────────────────────────────────────────────────

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (/admin_command_overview|admin_class_report_status|admin_recent_comments|admin_system_health|admin_ad_spend_save|account_deletion_requests/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có Trung tâm điều hành. Chạy supabase/sql/upgrades/20261204090000_admin_command_center.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không tải được dữ liệu, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const branchArg = (b: CampusFilter) => (b === 'ALL' ? null : b);

// ─── API ────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchCommandOverview(branch: CampusFilter, range: CommandRange): Promise<CommandOverview> {
  if (!supabase) return withDemoInvoiceStatus(demoOverview(branch, range));
  const r = await rpc<any>('admin_command_overview', { p_branch: branchArg(branch), p_days: RANGE_DAYS[range] });
  return {
    days: n(r.period?.days),
    leads: { total: n(r.leads?.total), enrolled: n(r.leads?.enrolled), cancelled: n(r.leads?.cancelled) },
    trials: { scheduled: n(r.trials?.scheduled), attended: n(r.trials?.attended) },
    tuition: { collectedVnd: n(r.tuition?.collectedVnd), paidCount: n(r.tuition?.paidCount), unpaidVnd: n(r.tuition?.unpaidVnd), unpaidCount: n(r.tuition?.unpaidCount) },
    revenueByCourse: (r.revenueByCourse ?? []).map((x: any) => ({ course: x.course, amountVnd: n(x.amountVnd), count: n(x.count) })),
    channels: (r.channels ?? []).map((x: any) => ({ channel: x.channel, leads: n(x.leads), enrolled: n(x.enrolled), spendVnd: n(x.spendVnd), cpaVnd: x.cpaVnd == null ? null : n(x.cpaVnd) })),
    spendVnd: n(r.spendVnd),
    recentInvoices: (r.recentInvoices ?? []).map((x: any) => ({ ...x, amountVnd: n(x.amountVnd) })),
    queues: {
      attendanceRequests: n(r.queues?.attendanceRequests),
      newLeads: n(r.queues?.newLeads),
      commentsToday: n(r.queues?.commentsToday),
      deletionRequests: n(r.queues?.deletionRequests),
      openTasks: n(r.queues?.openTasks),
    },
  };
}

export async function fetchClassReportStatus(branch: CampusFilter): Promise<ClassReportRow[]> {
  if (!supabase) return demoClasses(branch);
  const rows = await rpc<any[]>('admin_class_report_status', { p_branch: branchArg(branch) });
  return rows.map((r) => ({
    classId: r.class_id, className: r.class_name, course: r.course_code, campus: r.campus, teacherName: r.teacher_name,
    slot: r.slot, students: n(r.students), attended: n(r.attended), reports: n(r.reports),
  }));
}

export async function fetchModerationComments(filter: CommentFilter): Promise<ModerationComment[]> {
  if (!supabase) return demoComments(filter);
  const rows = await rpc<any[]>('admin_recent_comments', { p_filter: filter, p_limit: 60 });
  return rows.map((r) => ({
    id: r.id, videoId: r.video_id, videoTitle: r.video_title, authorName: r.author_name, authorRole: r.author_role,
    content: r.content, isHidden: !!r.is_hidden, isReply: !!r.is_reply, createdAt: r.created_at,
  }));
}

export async function fetchSystemHealth(): Promise<SystemHealth> {
  if (!supabase) {
    const rel = await fetchReleaseConfigs();
    return { ...demoHealth(), release: rel.map((r) => ({ platform: r.platform, min: r.minSupportedVersion, latest: r.latestVersion, force: r.isForceUpdate, updatedAt: '' })) };
  }
  const r = await rpc<any>('admin_system_health');
  return {
    push: { pending: n(r.push?.pending), failed24h: n(r.push?.failed24h), sent24h: n(r.push?.sent24h), oldestPendingAt: r.push?.oldestPendingAt ?? null, devices: n(r.push?.devices) },
    weeklyDigest: { weekStart: r.weeklyDigest?.weekStart ?? '', published: n(r.weeklyDigest?.published), zaloSent: n(r.weeklyDigest?.zaloSent), drafts: n(r.weeklyDigest?.drafts) },
    zalo: { connected: !!r.zalo?.connected, expiresAt: r.zalo?.expiresAt ?? null, lastError: r.zalo?.lastError ?? null, lastErrorAt: r.zalo?.lastErrorAt ?? null },
    release: (r.release ?? []).map((x: any) => ({ platform: x.platform, min: x.min, latest: x.latest, force: !!x.force, updatedAt: x.updatedAt })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function saveAdSpend(input: { branch: CampusFilter; channel: SpendChannel; month: string; amountVnd: number; note?: string }): Promise<void> {
  if (!Number.isFinite(input.amountVnd) || input.amountVnd < 0) throw new ApiError('Số tiền không hợp lệ', 'VALIDATION', 422, 'amount');
  if (!/^\d{4}-\d{2}-01$/.test(input.month)) throw new ApiError('Chọn tháng', 'VALIDATION', 422, 'month');
  if (!supabase) {
    demoSpend[`${input.branch}:${input.channel}`] = Math.round(input.amountVnd);
    return;
  }
  await rpc('admin_ad_spend_save', { p_branch: branchArg(input.branch), p_channel: input.channel, p_month: input.month, p_amount_vnd: Math.round(input.amountVnd), p_note: input.note ?? null });
}

// ─── Demo data ──────────────────────────────────────────────────────────────

const demoSpend: Record<string, number> = { 'ALL:FACEBOOK': 4500000, 'ALL:TIKTOK': 1200000 };
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

/** Demo: invoices confirmed in this session (payment demo store) show as paid. */
async function withDemoInvoiceStatus(o: CommandOverview): Promise<CommandOverview> {
  const recentInvoices = await Promise.all(
    o.recentInvoices.map(async (i) => {
      const live = (await fetchInvoice(i.id).catch(() => null))?.invoice;
      return live && live.status !== i.status ? { ...i, status: live.status, method: live.method, paidAt: live.paidAt, receiptNo: live.receiptNo ?? i.receiptNo } : i;
    }),
  );
  const unpaid = recentInvoices.filter((i) => i.status === 'PENDING_PAYMENT');
  return { ...o, recentInvoices, tuition: { ...o.tuition, unpaidCount: unpaid.length, unpaidVnd: unpaid.reduce((a, i) => a + i.amountVnd, 0) } };
}

function demoOverview(branch: CampusFilter, range: CommandRange): CommandOverview {
  const k = range === 'TODAY' ? 0.1 : range === '7D' ? 0.35 : 1;
  const b = branch === 'ALL' ? 1 : branch === 'XA_LA' ? 0.6 : 0.4;
  const s = (v: number) => Math.max(0, Math.round(v * k * b));
  const spend = (c: SpendChannel) => Math.round((demoSpend[`${branch}:${c}`] ?? demoSpend[`ALL:${c}`] ?? 0) * (branch === 'ALL' ? 1 : b));
  const channels: ChannelStat[] = (
    [
      ['FACEBOOK', s(38), s(9)],
      ['TIKTOK', s(17), s(3)],
      ['ZALO', s(12), s(4)],
      ['REFERRAL', s(8), s(5)],
    ] as [SpendChannel, number, number][]
  ).map(([channel, leads, enrolled]) => ({ channel, leads, enrolled, spendVnd: spend(channel), cpaVnd: leads > 0 && spend(channel) > 0 ? Math.round(spend(channel) / leads) : null }));
  const invoices: CommandInvoice[] = [
    { id: '00000000-0000-4000-8000-00000000d001', ref: 'THEDU1A2B3C4D', studentName: 'Bé Minh Khôi (mẫu)', course: 'TOAN_TU_DUY', campus: 'XA_LA', amountVnd: 2400000, status: 'PENDING_PAYMENT', method: null, receiptNo: null, createdAt: daysAgo(1), paidAt: null },
    { id: '00000000-0000-4000-8000-00000000d002', ref: 'THEDU5E6F7A8B', studentName: 'Bé Gia Huy (mẫu)', course: 'LUYEN_CHU_DEP', campus: 'NGO_THI_NHAM', amountVnd: 1800000, status: 'PAID', method: 'VIETQR', receiptNo: 'BL-0012', createdAt: daysAgo(3), paidAt: daysAgo(2) },
    { id: '00000000-0000-4000-8000-00000000d003', ref: 'THEDU9C0D1E2F', studentName: 'Bé Minh Anh (mẫu)', course: 'TIEN_TIEU_HOC', campus: 'XA_LA', amountVnd: 3200000, status: 'PAID', method: 'MANUAL', receiptNo: 'BL-0011', createdAt: daysAgo(5), paidAt: daysAgo(5) },
  ].filter((i) => branch === 'ALL' || i.campus === branch) as CommandInvoice[];
  const leads = channels.reduce((a, c) => a + c.leads, 0);
  return {
    days: range === 'TODAY' ? 1 : range === '7D' ? 7 : 30,
    leads: { total: leads, enrolled: channels.reduce((a, c) => a + c.enrolled, 0), cancelled: s(6) },
    trials: { scheduled: s(40), attended: s(31) },
    tuition: { collectedVnd: s(46800000), paidCount: s(18), unpaidVnd: invoices.filter((i) => i.status === 'PENDING_PAYMENT').reduce((a, i) => a + i.amountVnd, 0), unpaidCount: invoices.filter((i) => i.status === 'PENDING_PAYMENT').length },
    revenueByCourse: (
      [
        ['TOAN_TU_DUY', 19200000, 8],
        ['TIEN_TIEU_HOC', 14400000, 5],
        ['LUYEN_CHU_DEP', 9000000, 5],
        ['BOI_DUONG_TOAN_TV', 4200000, 2],
      ] as [CourseCategory, number, number][]
    ).map(([course, amt, c]) => ({ course, amountVnd: s(amt), count: s(c) })).filter((r) => r.amountVnd > 0),
    channels: channels.filter((c) => c.leads > 0 || c.spendVnd > 0),
    spendVnd: channels.reduce((a, c) => a + c.spendVnd, 0),
    recentInvoices: invoices,
    queues: { attendanceRequests: 2, newLeads: s(7), commentsToday: 3, deletionRequests: 0, openTasks: 4 },
  };
}

function demoClasses(branch: CampusFilter): ClassReportRow[] {
  const rows: ClassReportRow[] = [
    { classId: 'demo-c1', className: 'Tiền tiểu học A1 (mẫu)', course: 'TIEN_TIEU_HOC', campus: 'XA_LA', teacherName: 'Cô Hường', slot: '17:30–19:00', students: 3, attended: 3, reports: 3 },
    { classId: 'demo-c2', className: 'Toán tư duy B2 (mẫu)', course: 'TOAN_TU_DUY', campus: 'XA_LA', teacherName: 'Thầy Tú', slot: '18:00–19:30', students: 6, attended: 5, reports: 0 },
    { classId: 'demo-c3', className: 'Luyện chữ C1 (mẫu)', course: 'LUYEN_CHU_DEP', campus: 'NGO_THI_NHAM', teacherName: 'Cô Lan', slot: '17:00–18:30', students: 5, attended: 0, reports: 0 },
  ];
  return rows.filter((r) => branch === 'ALL' || r.campus === branch);
}

let demoCommentRows: ModerationComment[] = [
  { id: 'dc1', videoId: 'demo1', videoTitle: 'Bé học Toán tư duy qua trò chơi (mẫu)', authorName: 'Mẹ Minh Anh', authorRole: 'PARENT', content: 'Học phí khóa này thế nào ạ?', isHidden: false, isReply: false, createdAt: daysAgo(0.1) },
  { id: 'dc2', videoId: 'demo1', videoTitle: 'Bé học Toán tư duy qua trò chơi (mẫu)', authorName: 'Bố Gia Huy', authorRole: 'PARENT', content: 'Con mình 5 tuổi học được không cô?', isHidden: false, isReply: false, createdAt: daysAgo(0.3) },
  { id: 'dc3', videoId: 'demo2', videoTitle: 'Luyện chữ đẹp sau 4 tuần (mẫu)', authorName: 'Khách', authorRole: 'GUEST', content: 'Mua khoá học rẻ tại link…', isHidden: true, isReply: false, createdAt: daysAgo(1) },
];
export const demoSetCommentHidden = (id: string, hidden: boolean) => (demoCommentRows = demoCommentRows.map((c) => (c.id === id ? { ...c, isHidden: hidden } : c)));

function demoComments(filter: CommentFilter): ModerationComment[] {
  return demoCommentRows.filter((c) => (filter === 'HIDDEN' ? c.isHidden : filter === 'VISIBLE' ? !c.isHidden : filter === 'QUESTIONS' ? !c.isHidden && !c.isReply && c.authorRole !== 'TEACHER' && c.authorRole !== 'ADMIN' : true));
}

function demoHealth(): SystemHealth {
  return {
    push: { pending: 0, failed24h: 0, sent24h: 0, oldestPendingAt: null, devices: 0 },
    weeklyDigest: { weekStart: '', published: 0, zaloSent: 0, drafts: 0 },
    zalo: { connected: false, expiresAt: null, lastError: null, lastErrorAt: null },
    release: [],
  };
}
