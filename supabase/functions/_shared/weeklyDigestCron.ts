/**
 * Sunday weekly digest — POST /api/cron/weekly-digest (pg_cron every 10 minutes, Sunday 19:30 → 21:50 VN,
 * plus a Monday-morning catch-up). Each tick builds and publishes reports for students not done yet, so a
 * slow or failed tick simply continues on the next one (weekly_digest_candidates skips published weeks).
 *
 * Per student: weekly_report_source_internal → buildWeeklyDigest (rules) → optional AI wording →
 * weekly_report_save (publish + push WEEKLY_REPORT_READY) → optional Zalo summary to linked parents.
 *
 * Dependencies are injected (no Deno APIs) so the whole flow is unit-tested in Node.
 */
import { buildWeeklyDigest, mergeAiWording, vnDate, weekOf, type WeeklyDigest, type WeeklySource } from './weeklyReport.ts';

export interface ZaloTarget {
  parentId: string;
  fullName: string;
  phone: string;
  zaloId: string | null;
}

export interface WeeklyDigestDeps {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<T>;
  now: () => Date;
  /** Optional: AI rewording (returns the model's JSON or null). Failures fall back to the rules. */
  polish?: (src: WeeklySource, draft: WeeklyDigest) => Promise<unknown | null>;
  /** Optional: one Zalo summary per parent. Return true when sent. */
  zalo?: (target: ZaloTarget, ctx: { studentName: string; reportId: string; digest: WeeklyDigest; weekStart: string }) => Promise<boolean>;
  log?: (msg: string, extra?: unknown) => void;
}

export interface StudentResult {
  studentId: string;
  id: string | null;
  published: boolean;
  pushed: number;
  zaloSent: number;
  wordingSource: 'RULES' | 'AI';
  hasActivity: boolean;
}

export interface WeeklyDigestSummary {
  skipped?: 'NOT_TIME';
  weekStart: string | null;
  candidates: number;
  generated: number;
  failed: number;
  pushed: number;
  zaloSent: number;
  aiUsed: number;
  quiet: number;
  /** Stopped early to stay within the Edge Function time limit; the next tick continues. */
  partial: boolean;
}

/**
 * Which week to build now (Asia/Ho_Chi_Minh): Sunday ≥ 19:30 → this week; Monday before 12:00 → last week
 * (catch-up if Sunday's ticks failed); otherwise nothing.
 */
export function digestWeekFor(now: Date): string | null {
  const local = new Date(now.getTime() + 7 * 3600_000);
  const dow = local.getUTCDay();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = vnDate(now);
  if (dow === 0 && minutes >= 19 * 60 + 30) return weekOf(today).weekStart;
  if (dow === 1 && minutes < 12 * 60) return weekOf(shift(today, -1)).weekStart;
  return null;
}
const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Build + save (+ publish, push, Zalo) one student's report. */
export async function generateWeeklyReportForStudent(
  deps: WeeklyDigestDeps,
  studentId: string,
  weekStart: string,
  opts: { publish?: boolean; allowAi?: boolean } = {},
): Promise<StudentResult> {
  const raw = await deps.rpc<WeeklySource | null>('weekly_report_source_internal', { p_student_id: studentId, p_week_start: weekStart });
  if (!raw) return { studentId, id: null, published: false, pushed: 0, zaloSent: 0, wordingSource: 'RULES', hasActivity: false };

  const src = normaliseSource(raw);
  let digest = buildWeeklyDigest(src);
  // AI only for weeks with something to say (holiday weeks keep the plain rule text).
  if (deps.polish && opts.allowAi !== false && digest.hasActivity) {
    try {
      const ai = await deps.polish(src, digest);
      if (ai) digest = mergeAiWording(digest, ai, { keepSummary: src.existing?.generatedBy === 'TEACHER_EDITED' });
    } catch (e) {
      deps.log?.('[weekly] AI wording failed, using rules', String(e).slice(0, 200));
    }
  }

  const saved = await deps.rpc<{ id: string; published: boolean; pushed: number; zalo: ZaloTarget[] }>('weekly_report_save', {
    p_student_id: studentId,
    p_week_start: src.weekStart,
    p_report: digest,
    p_publish: opts.publish !== false,
  });

  let zaloSent = 0;
  if (deps.zalo && saved.zalo?.length) {
    for (const t of saved.zalo) {
      try {
        if (await deps.zalo(t, { studentName: src.studentName, reportId: saved.id, digest, weekStart: src.weekStart })) zaloSent++;
      } catch (e) {
        deps.log?.('[weekly] Zalo failed', String(e).slice(0, 200));
      }
    }
    // Mark even when nobody could be reached (no template / no Zalo id): never retry-spam the same week.
    await deps.rpc('weekly_report_mark_zalo', { p_id: saved.id });
  }
  return { studentId, id: saved.id, published: saved.published, pushed: saved.pushed ?? 0, zaloSent, wordingSource: digest.wordingSource, hasActivity: digest.hasActivity };
}

/** One cron tick. opts.weekStart / force: manual run (e.g. re-run a week from the SQL editor via curl). */
export async function runWeeklyDigest(
  deps: WeeklyDigestDeps,
  opts: { weekStart?: string; force?: boolean; limit?: number; concurrency?: number; budgetMs?: number } = {},
): Promise<WeeklyDigestSummary> {
  const started = Date.now();
  const weekStart = opts.weekStart ? weekOf(opts.weekStart).weekStart : opts.force ? weekOf(vnDate(deps.now())).weekStart : digestWeekFor(deps.now());
  const summary: WeeklyDigestSummary = { weekStart, candidates: 0, generated: 0, failed: 0, pushed: 0, zaloSent: 0, aiUsed: 0, quiet: 0, partial: false };
  if (!weekStart) return { ...summary, skipped: 'NOT_TIME' };

  const ids = (await deps.rpc<{ student_id: string }[]>('weekly_digest_candidates', { p_week_start: weekStart, p_limit: opts.limit ?? (deps.polish ? 60 : 400) })).map((r) => r.student_id);
  summary.candidates = ids.length;
  const budget = opts.budgetMs ?? 100_000;
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      if (Date.now() - started > budget) {
        summary.partial = true;
        return;
      }
      const id = ids[next++];
      try {
        const r = await generateWeeklyReportForStudent(deps, id, weekStart);
        summary.generated++;
        summary.pushed += r.pushed;
        summary.zaloSent += r.zaloSent;
        if (r.wordingSource === 'AI') summary.aiUsed++;
        if (!r.hasActivity) summary.quiet++;
      } catch (e) {
        summary.failed++;
        deps.log?.('[weekly] student failed', { id, error: String(e).slice(0, 300) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, 8)) }, worker));
  return summary;
}

/** The RPC returns jsonb; make sure every list exists so the rules never throw on a sparse row. */
export function normaliseSource(s: WeeklySource): WeeklySource {
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
