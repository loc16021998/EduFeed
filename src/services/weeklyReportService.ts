/**
 * Weekly progress reports ("Báo cáo tiến độ tuần") — app side.
 *
 * Parents   read PUBLISHED reports of their own children (parent_weekly_reports) and mark them seen
 *           (parent_weekly_report_viewed → parent_viewed_at, first open only).
 * Teachers  see the class's status for the week (draft / sent / seen), preview the draft built from the same
 *           rules as the Sunday digest, and add a one-line personal note (weekly_report_teacher_note).
 * Habit     "Thử thách 21 ngày" ticks are also sent to the centre (habit_checkin) so the report can show the
 *           home-practice streak. Fire-and-forget: the tick on the phone never waits for the network.
 *
 * Building + publishing happens on the server every Sunday 19:30 (supabase/functions/_shared/weeklyDigestCron.ts).
 * Without Supabase (dev / demo) everything runs on sample data built by the same rules.
 */
import { supabase } from '@/lib/supabase';
import { sleep } from '@/utils/helpers';

import {
  addDays,
  buildWeeklyDigest,
  weekOf,
  type AttendanceSummary,
  type SkillScores,
  type WeeklyDigest,
  type WeeklySource,
} from '../../supabase/functions/_shared/weeklyReport';
import { ApiError } from './apiClient';
import { isDemoParentSignedIn, photoUrls } from './parentPortal';

export type { AttendanceSummary, SkillScores, WeeklyDigest };

export interface WeeklyReport {
  id: string;
  studentId: string;
  weekStart: string;
  weekEnd: string;
  attendance: AttendanceSummary;
  skills: SkillScores;
  habit: { daysPracticed: number; streak: number };
  highlights: string[];
  tips: string[];
  teacherNote: string | null;
  teacherName: string | null;
  /** Storage paths (class-reports) — or full URLs in demo mode. Resolve with weeklyPhotoUrls. */
  media: string[];
  generatedBy: 'AUTO_DIGEST' | 'TEACHER_EDITED';
  hasActivity: boolean;
  publishedAt: string | null;
  viewedAt: string | null;
  courses: string[];
}

export interface WeeklyOverviewRow {
  studentId: string;
  studentName: string;
  reportId: string | null;
  teacherNote: string | null;
  publishedAt: string | null;
  parentViewedAt: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/weekly_|habit_checkin|staff_weekly/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có Báo cáo tuần. Chạy supabase/sql/upgrades/20261201090000_weekly_progress_reports.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Today on this phone (families and the centre are all in Vietnam). */
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const thisWeekStart = () => weekOf(todayIso()).weekStart;
export const lastWeekStart = () => addDays(thisWeekStart(), -7);

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const score = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.min(100, num(v))));
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Defensive: older / partial rows (e.g. a teacher-only draft) still render. */
export function toWeeklyReport(r: any): WeeklyReport {
  const a = r.attendance_summary ?? {};
  const s = r.skill_scores ?? {};
  const h = r.habit_summary ?? {};
  return {
    id: String(r.id),
    studentId: String(r.student_id),
    weekStart: String(r.week_start_date).slice(0, 10),
    weekEnd: String(r.week_end_date ?? addDays(String(r.week_start_date).slice(0, 10), 6)).slice(0, 10),
    attendance: { totalSessions: num(a.totalSessions), attendedCount: num(a.attendedCount), onTimeCount: num(a.onTimeCount), excusedCount: num(a.excusedCount) },
    skills: { focus: score(s.focus), handwritingOrLogic: score(s.handwritingOrLogic), confidence: score(s.confidence), homePractice: score(s.homePractice) },
    habit: { daysPracticed: num(h.daysPracticed), streak: num(h.streak) },
    highlights: strings(r.highlights_vi),
    tips: strings(r.improvement_tips_vi),
    teacherNote: typeof r.teacher_summary_note === 'string' && r.teacher_summary_note.trim() ? r.teacher_summary_note : null,
    teacherName: typeof r.teacher_name === 'string' && r.teacher_name.trim() ? r.teacher_name : null,
    media: strings(r.featured_media_urls).slice(0, 2),
    generatedBy: r.generated_by === 'TEACHER_EDITED' ? 'TEACHER_EDITED' : 'AUTO_DIGEST',
    hasActivity: !!r.has_activity,
    publishedAt: r.published_at ?? null,
    viewedAt: r.parent_viewed_at ?? null,
    courses: strings(r.courses),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Parents ────────────────────────────────────────────────────────────────

/** Published reports, newest week first. */
export async function fetchWeeklyReports(studentId: string, limit = 12): Promise<WeeklyReport[]> {
  if (!supabase) {
    await sleep(250);
    return demoReports().filter((r) => r.studentId === studentId).map((r) => ({ ...r }));
  }
  return (await rpc<unknown[]>('parent_weekly_reports', { p_student_id: studentId, p_limit: limit })).map(toWeeklyReport);
}

/** First open by a parent. Never throws (engagement tracking must not break the screen). */
export async function markWeeklyReportViewed(reportId: string): Promise<string | null> {
  if (!supabase) {
    const r = demoReports().find((x) => x.id === reportId);
    if (r && !r.viewedAt) r.viewedAt = new Date().toISOString();
    return r?.viewedAt ?? null;
  }
  try {
    return await rpc<string | null>('parent_weekly_report_viewed', { p_report_id: reportId });
  } catch {
    return null;
  }
}

export const weeklyPhotoUrls = (paths: string[]) => photoUrls(paths);

/** Send a "Thử thách 21 ngày" tick to the centre. Silent on failure (offline ticks re-sync on the next tick). */
export async function syncHabitCheckin(studentId: string, key: string, days: string[]): Promise<void> {
  if (!supabase || isDemoParentSignedIn() || studentId.startsWith('demo-')) return;
  // Newest first; stop at the first day the server already has (older ones were synced before).
  const recent = days.filter((d) => d >= addDays(todayIso(), -7)).sort().reverse();
  for (const day of recent) {
    const { data, error } = await supabase.rpc('habit_checkin' as never, { p_student_id: studentId, p_key: key, p_day: day } as never);
    if (error || data === false) return; // not linked / DB not upgraded / offline / already synced
  }
}

// ─── Teachers ───────────────────────────────────────────────────────────────

export async function fetchWeeklyOverview(classId: string, weekStart: string): Promise<WeeklyOverviewRow[]> {
  if (!supabase) {
    await sleep(200);
    return demoOverview().map((r) => ({ ...r }));
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (await rpc<any[]>('staff_weekly_overview', { p_class_id: classId, p_week_start: weekStart })).map((r) => ({
    studentId: r.studentId, studentName: r.studentName, reportId: r.reportId ?? null, teacherNote: r.teacherNote ?? null,
    publishedAt: r.publishedAt ?? null, parentViewedAt: r.parentViewedAt ?? null,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** The draft as parents will see it on Sunday (same rules as the server). */
export async function fetchWeeklyPreview(studentId: string, weekStart: string): Promise<{ source: WeeklySource; digest: WeeklyDigest }> {
  const source = supabase ? await rpc<WeeklySource>('staff_weekly_source', { p_student_id: studentId, p_week_start: weekStart }) : demoSource(studentId, weekStart);
  if (!source) throw new ApiError('Không tìm thấy học viên', 'NOT_FOUND', 404);
  const norm = normalise(source);
  return { source: norm, digest: buildWeeklyDigest(norm, { today: todayIso() }) };
}

export const TEACHER_NOTE_MAX = 200;

export async function saveWeeklyTeacherNote(studentId: string, weekStart: string, note: string): Promise<void> {
  const clean = note.replace(/\s+/g, ' ').trim();
  if (clean.length > TEACHER_NOTE_MAX) throw new ApiError(`Ghi chú tối đa ${TEACHER_NOTE_MAX} ký tự`, 'VALIDATION', 422, 'note');
  if (!supabase) {
    await sleep(150);
    const row = demoOverview().find((r) => r.studentId === studentId);
    if (row) row.teacherNote = clean || null;
    demoNotes.set(`${studentId}|${weekStart}`, clean);
    return;
  }
  await rpc('weekly_report_teacher_note', { p_student_id: studentId, p_week_start: weekStart, p_note: clean });
}

function normalise(s: WeeklySource): WeeklySource {
  const arr = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    ...s,
    courses: arr(s.courses),
    attendance: arr(s.attendance).map((a) => ({ ...a, date: String(a.date).slice(0, 10) })),
    reports: arr(s.reports).map((r) => ({ ...r, date: String(r.date).slice(0, 10), tags: arr(r.tags), media: arr(r.media) })),
    leaves: arr(s.leaves).map((d) => String(d).slice(0, 10)),
    habitDays: arr(s.habitDays).map((d) => String(d).slice(0, 10)),
    weekStart: String(s.weekStart).slice(0, 10),
    weekEnd: String(s.weekEnd).slice(0, 10),
  };
}

// ─── Demo data (same rules as production) ──────────────────────────────────

const KHOI = 'demo-student-khoi';
const ANH = 'demo-student-anh';
const pic = (seed: string) => `https://picsum.photos/seed/${seed}/900/1200`;
const demoNotes = new Map<string, string>();
const DEMO_NAMES: Record<string, string> = { [KHOI]: 'Minh Khôi (mẫu)', [ANH]: 'Minh Anh (mẫu)', 'demo-s2': 'Gia Bảo (mẫu)', 'demo-s3': 'Bảo Ngọc (mẫu)' };
let demoList: WeeklyReport[] | null = null;
let demoRows: WeeklyOverviewRow[] | null = null;

function demoSource(studentId: string, weekStart: string): WeeklySource {
  const d = (n: number) => addDays(weekStart, n);
  const khoi = studentId !== ANH;
  const holiday = weekStart === addDays(lastWeekStart(), -14);
  const note = demoNotes.get(`${studentId}|${weekStart}`);
  const base: WeeklySource = {
    studentId,
    studentName: DEMO_NAMES[studentId] ?? 'Minh Khôi (mẫu)',
    campus: 'XA_LA',
    branchName: 'Cơ sở Xa La',
    weekStart,
    weekEnd: d(6),
    courses: khoi ? [{ code: 'TOAN_TU_DUY', name: 'Toán tư duy' }] : [{ code: 'LUYEN_CHU_DEP', name: 'Luyện chữ đẹp' }],
    attendance: [],
    reports: [],
    leaves: [],
    habitDays: [],
    existing: note ? { id: 'demo-draft', generatedBy: 'TEACHER_EDITED', teacherNote: note, teacherName: 'Cô Hường (mẫu)', publishedAt: null } : null,
  };
  if (holiday) return base;
  if (khoi) {
    base.attendance = [
      { date: d(1), courseCode: 'TOAN_TU_DUY', status: 'PRESENT' },
      { date: d(5), courseCode: 'TOAN_TU_DUY', status: 'LATE' },
    ];
    base.reports = [
      { date: d(1), courseCode: 'TOAN_TU_DUY', attendance: 'PRESENT', teacherName: 'Thầy Tú (mẫu)', feedback: 'Khôi tính nhẩm phép cộng có nhớ rất nhanh, chủ động giơ tay trả lời.', tags: ['Tính nhẩm nhanh', 'Tích cực phát biểu'], media: [pic('thedu-math-1')] },
      { date: d(5), courseCode: 'TOAN_TU_DUY', attendance: 'PRESENT', teacherName: 'Thầy Tú (mẫu)', feedback: 'Con hoàn thành bài hình khối, tuần sau mình luyện thêm đếm cạnh cho thật cẩn thận nhé.', tags: ['Tính nhẩm nhanh', 'Cần cẩn thận hơn'], media: [pic('thedu-math-2'), pic('thedu-math-3')] },
    ];
    base.habitDays = [d(-1), d(0), d(1), d(2), d(3), d(4), d(6)];
  } else {
    base.attendance = [{ date: d(2), courseCode: 'LUYEN_CHU_DEP', status: 'PRESENT' }];
    base.reports = [
      { date: d(2), courseCode: 'LUYEN_CHU_DEP', attendance: 'PRESENT', teacherName: 'Cô Hường (mẫu)', feedback: 'Minh Anh viết nét khuyết đều hơn tuần trước, ngồi đúng tư thế. Cô rất vui!', tags: ['Chữ đẹp hơn', 'Tập trung'], media: [pic('thedu-chu-1')] },
    ];
    base.habitDays = [d(3), d(4), d(5)];
  }
  // Sample data never shows sessions in the future (preview of the current week).
  const today = todayIso();
  base.attendance = base.attendance.filter((x) => x.date <= today);
  base.reports = base.reports.filter((x) => x.date <= today);
  base.habitDays = base.habitDays.filter((x) => x <= today);
  return base;
}

function demoReports(): WeeklyReport[] {
  if (demoList) return demoList;
  const weeks = [lastWeekStart(), addDays(lastWeekStart(), -7), addDays(lastWeekStart(), -14)];
  demoList = [KHOI, ANH].flatMap((sid) =>
    weeks.map((w, i) => {
      const src = demoSource(sid, w);
      const g = buildWeeklyDigest(src);
      return {
        id: `demo-weekly-${sid}-${i}`,
        studentId: sid,
        weekStart: w,
        weekEnd: addDays(w, 6),
        attendance: g.attendanceSummary,
        skills: g.skillScores,
        habit: g.habitSummary,
        highlights: g.highlights,
        tips: g.tips,
        teacherNote: g.teacherSummaryNote,
        teacherName: g.teacherName,
        media: g.featuredMedia,
        generatedBy: 'AUTO_DIGEST' as const,
        hasActivity: g.hasActivity,
        publishedAt: new Date(`${addDays(w, 6)}T12:30:00Z`).toISOString(),
        viewedAt: i === 0 ? null : new Date(`${addDays(w, 7)}T01:00:00Z`).toISOString(),
        courses: src.courses.map((c) => c.code),
      };
    }),
  );
  return demoList;
}

function demoOverview(): WeeklyOverviewRow[] {
  if (demoRows) return demoRows;
  demoRows = [
    { studentId: 'demo-s3', studentName: 'Bảo Ngọc (mẫu)', reportId: null, teacherNote: null, publishedAt: null, parentViewedAt: null },
    { studentId: 'demo-s2', studentName: 'Gia Bảo (mẫu)', reportId: null, teacherNote: null, publishedAt: null, parentViewedAt: null },
    { studentId: KHOI, studentName: 'Minh Khôi (mẫu)', reportId: null, teacherNote: null, publishedAt: null, parentViewedAt: null },
  ];
  return demoRows;
}

/** A draft digest shaped like a published report, for the shared card (teacher preview). */
export function digestToReport(source: WeeklySource, digest: WeeklyDigest): WeeklyReport {
  return {
    id: source.existing?.id ?? `draft-${source.studentId}-${source.weekStart}`,
    studentId: source.studentId,
    weekStart: source.weekStart,
    weekEnd: source.weekEnd,
    attendance: digest.attendanceSummary,
    skills: digest.skillScores,
    habit: digest.habitSummary,
    highlights: digest.highlights,
    tips: digest.tips,
    teacherNote: digest.teacherSummaryNote,
    teacherName: digest.teacherName,
    media: digest.featuredMedia,
    generatedBy: source.existing?.generatedBy ?? 'AUTO_DIGEST',
    hasActivity: digest.hasActivity,
    publishedAt: source.existing?.publishedAt ?? null,
    viewedAt: null,
    courses: source.courses.map((c) => c.code),
  };
}
