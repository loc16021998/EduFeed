/**
 * Weekly progress report ("Báo cáo tiến độ tuần") — pure rules, shared by the Edge Function (Sunday digest)
 * and the app (teacher preview, demo data). No Deno / React Native imports; unit-tested in Node.
 *
 * Numbers (attendance, streak, skill bars) ALWAYS come from these rules. The optional AI step may only
 * reword highlights / tips / the summary sentence (see mergeAiWording) — it never changes a number.
 *
 * Tone: warm and encouraging. Skill bars are shown as words ("Đang tiến bộ", "Tốt", "Rất tốt"), never as
 * a grade; a bar never drops below 40 so a quiet week never looks like failure.
 */

export type CourseCode = 'TIEN_TIEU_HOC' | 'LUYEN_CHU_DEP' | 'TOAN_TU_DUY' | 'BOI_DUONG_TOAN_TV';
export type SessionStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';

export interface WeeklySource {
  studentId: string;
  studentName: string;
  campus: string;
  branchName: string | null;
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // Sunday
  courses: { code: string; name: string }[];
  attendance: { date: string; courseCode: string; status: SessionStatus }[];
  reports: { date: string; courseCode: string; attendance: 'PRESENT' | 'ABSENT' | 'EXCUSED'; teacherName: string; feedback: string | null; tags: string[]; media: string[] }[];
  /** Approved leave days in the week. */
  leaves: string[];
  /** Practice days (any challenge), week + up to 60 days before. */
  habitDays: string[];
  existing: { id: string; generatedBy: 'AUTO_DIGEST' | 'TEACHER_EDITED'; teacherNote: string | null; teacherName: string | null; publishedAt: string | null } | null;
}

export interface AttendanceSummary {
  totalSessions: number;
  attendedCount: number;
  onTimeCount: number;
  excusedCount: number;
}

export interface SkillScores {
  focus: number | null;
  handwritingOrLogic: number | null;
  confidence: number | null;
  homePractice: number | null;
}

export interface WeeklyDigest {
  attendanceSummary: AttendanceSummary;
  skillScores: SkillScores;
  habitSummary: { daysPracticed: number; streak: number };
  highlights: string[];
  tips: string[];
  teacherSummaryNote: string | null;
  teacherName: string | null;
  featuredMedia: string[];
  /** Any session or home practice this week. False = holiday / break: saved, but no notification. */
  hasActivity: boolean;
  wordingSource: 'RULES' | 'AI';
}

// ─── Dates (calendar days, no time zone surprises) ──────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
export const addDays = (iso: string, n: number) => toIso(new Date(fromIso(iso).getTime() + n * 86400_000));

/** Calendar date in Vietnam (UTC+7, no DST) for an instant. */
export function vnDate(now: Date): string {
  return toIso(new Date(now.getTime() + 7 * 3600_000));
}

/** Monday–Sunday week containing the given date (YYYY-MM-DD). */
export function weekOf(iso: string): { weekStart: string; weekEnd: string } {
  const dow = fromIso(iso).getUTCDay(); // 0 = Sunday
  const weekStart = addDays(iso, dow === 0 ? -6 : 1 - dow);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/** "18/11 – 24/11" */
export function weekLabel(weekStart: string): string {
  const e = addDays(weekStart, 6);
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${f(weekStart)} – ${f(e)}`;
}

// ─── Attendance ─────────────────────────────────────────────────────────────

/**
 * One session per (day, course). A QR / manual check-in wins over the contact book (it knows LATE);
 * an approved leave counts as excused only on a day with nothing recorded.
 */
export function summarizeAttendance(src: Pick<WeeklySource, 'attendance' | 'reports' | 'leaves' | 'weekStart' | 'weekEnd'>): AttendanceSummary {
  const inWeek = (d: string) => d >= src.weekStart && d <= src.weekEnd;
  const sessions = new Map<string, SessionStatus>();
  for (const r of src.reports ?? []) if (inWeek(r.date)) sessions.set(`${r.date}|${r.courseCode}`, r.attendance);
  for (const a of src.attendance ?? []) if (inWeek(a.date)) sessions.set(`${a.date}|${a.courseCode}`, a.status);
  const days = new Set([...sessions.keys()].map((k) => k.split('|')[0]));
  for (const d of src.leaves ?? []) if (inWeek(d) && !days.has(d)) sessions.set(`${d}|LEAVE`, 'EXCUSED');
  let attended = 0, onTime = 0, excused = 0;
  for (const s of sessions.values()) {
    if (s === 'PRESENT' || s === 'LATE') attended++;
    if (s === 'PRESENT') onTime++;
    if (s === 'EXCUSED') excused++;
  }
  return { totalSessions: sessions.size, attendedCount: attended, onTimeCount: onTime, excusedCount: excused };
}

// ─── Home practice ──────────────────────────────────────────────────────────

/** Days practiced in the week and the streak of consecutive days ending on the last practiced day ≤ week end (within the week's last 2 days). */
export function habitSummary(days: string[], weekStart: string, weekEnd: string): { daysPracticed: number; streak: number } {
  const set = new Set((days ?? []).map((d) => d.slice(0, 10)));
  let daysPracticed = 0;
  for (let d = weekStart; d <= weekEnd; d = addDays(d, 1)) if (set.has(d)) daysPracticed++;
  // A streak still "alive" on Sunday evening: ends Sunday, or Saturday if Sunday is not ticked yet.
  let cursor = set.has(weekEnd) ? weekEnd : addDays(weekEnd, -1);
  let streak = 0;
  while (set.has(cursor) && streak < 400) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return { daysPracticed, streak };
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export const TAG = {
  FOCUS: 'Tập trung',
  SPEAK: 'Tích cực phát biểu',
  WRITING: 'Chữ đẹp hơn',
  MENTAL: 'Tính nhẩm nhanh',
  READING: 'Đọc trôi chảy',
  HOMEWORK: 'Hoàn thành bài tập',
  PRACTICE_MORE: 'Cần luyện thêm ở nhà',
  CAREFUL: 'Cần cẩn thận hơn',
} as const;

const clamp = (n: number) => Math.round(Math.min(98, Math.max(40, n)));

/** Writing courses → "Chữ viết"; maths courses → "Tư duy logic". */
export function skillTrack(courses: string[]): 'WRITING' | 'LOGIC' {
  const c = new Set(courses);
  // Toán tư duy is the clearest "logic" course; a child doing BOI_DUONG + LUYEN_CHU_DEP shows handwriting.
  if (c.has('TOAN_TU_DUY')) return 'LOGIC';
  if (c.has('BOI_DUONG_TOAN_TV') && !c.has('LUYEN_CHU_DEP')) return 'LOGIC';
  return 'WRITING';
}

export function scoreSkills(src: WeeklySource, att: AttendanceSummary, habit: { daysPracticed: number }): SkillScores {
  const tags = (src.reports ?? []).filter((r) => r.date >= src.weekStart && r.date <= src.weekEnd).flatMap((r) => r.tags ?? []);
  const n = (t: string) => tags.filter((x) => x === t).length;
  const track = skillTrack(src.courses.map((c) => c.code));
  const attended = att.attendedCount;

  // No class attended → nothing observed in class this week (bars hidden, not "low").
  const focus = attended === 0 ? null : clamp(66 + 10 * (att.onTimeCount / attended) + 10 * n(TAG.FOCUS) + 5 * n(TAG.HOMEWORK) - 7 * n(TAG.CAREFUL));
  const craft =
    attended === 0
      ? null
      : clamp(66 + (track === 'WRITING' ? 11 * n(TAG.WRITING) + 4 * n(TAG.READING) : 11 * n(TAG.MENTAL) + 4 * n(TAG.HOMEWORK)) - 6 * n(TAG.PRACTICE_MORE) - 3 * n(TAG.CAREFUL));
  const confidence = attended === 0 ? null : clamp(64 + 11 * n(TAG.SPEAK) + 6 * n(TAG.READING) + 3 * Math.min(attended, 3));
  // Home practice: only when the family uses the 21-day challenge at all (any tick in the last ~2 months).
  const usesChallenge = (src.habitDays ?? []).length > 0;
  const homePractice = usesChallenge ? clamp(40 + (58 * Math.min(habit.daysPracticed, 7)) / 7) : null;
  return { focus, handwritingOrLogic: craft, confidence, homePractice };
}

/** Bar label — always encouraging. */
export function skillLevel(score: number | null): string {
  if (score === null) return 'Chưa có dữ liệu tuần này';
  if (score >= 85) return 'Rất tốt';
  if (score >= 70) return 'Tốt';
  return 'Đang tiến bộ';
}

export function skillLabels(courses: string[]): Record<keyof SkillScores, string> {
  return {
    focus: 'Tập trung trong lớp',
    handwritingOrLogic: skillTrack(courses) === 'WRITING' ? 'Chữ viết' : 'Tư duy logic',
    confidence: 'Tự tin phát biểu',
    homePractice: 'Luyện tập ở nhà',
  };
}

// ─── Tips (5 minutes at home) ───────────────────────────────────────────────

export const HOME_TIPS: Record<CourseCode, string[]> = {
  LUYEN_CHU_DEP: [
    'Mỗi tối dành 5 phút cho con viết 1 dòng chữ thật nắn nót, ba mẹ khen một chữ con viết đẹp nhất.',
    'Trước khi viết, cùng con kiểm tra tư thế: lưng thẳng, mắt cách vở một gang tay, cầm bút bằng 3 ngón.',
    'Cho con tô lại 3 nét khó nhất trong tuần (nét khuyết, nét móc) bằng bút chì rồi mới viết mực.',
    'Chụp ảnh trang vở đẹp nhất tuần và dán lên tủ lạnh — con sẽ tự hào và muốn viết đẹp hơn.',
  ],
  TOAN_TU_DUY: [
    'Chơi "đố nhanh" 5 phút trong bữa tối: ba mẹ đọc 10 phép cộng trừ, con trả lời nhanh nhất có thể.',
    'Khi đi chợ, nhờ con đếm tiền lẻ hoặc tính tổng 2–3 món đồ — toán gắn với cuộc sống con nhớ lâu hơn.',
    'Cùng con giải 1 bài toán có lời văn: con đọc to đề, gạch chân số liệu rồi mới tính.',
    'Xếp hình bằng đồ vật trong nhà (que tăm, nắp chai) để con đếm cạnh, đếm góc — luyện tư duy hình học.',
  ],
  TIEN_TIEU_HOC: [
    'Đọc to cùng con 5 phút trước giờ ngủ, để con chỉ tay theo từng chữ khi đọc.',
    'Chơi trò "tìm chữ cái": con tìm 5 đồ vật trong nhà bắt đầu bằng chữ cái vừa học.',
    'Cho con tự soạn cặp sách cho buổi học tới — rèn tính tự lập trước khi vào lớp 1.',
    'Hỏi con "Hôm nay ở lớp con thích nhất điều gì?" và lắng nghe 3 phút — con tự tin diễn đạt hơn.',
  ],
  BOI_DUONG_TOAN_TV: [
    'Mỗi tối cùng con làm 2 bài toán có lời văn, khuyến khích con nói to cách nghĩ trước khi viết.',
    'Cho con kể lại một đoạn truyện ngắn bằng lời của mình trong 3 phút — luyện diễn đạt Tiếng Việt.',
    'Ôn bảng cửu chương bằng trò "hỏi xoay vòng" giữa ba mẹ và con, mỗi người 5 câu.',
    'Cùng con soát lại bài về nhà: con tự tìm 1 lỗi sai và sửa — rèn tính cẩn thận.',
  ],
};

const GENERAL_TIPS = {
  PRACTICE: 'Duy trì "Thử thách 21 ngày" trong app: mỗi tối 5 phút, đánh dấu cùng con để giữ chuỗi.',
  CAREFUL: 'Khi con làm xong bài, cùng con "soát lại 1 lượt" trước khi đóng vở — thói quen cẩn thận hình thành từ đây.',
  BREAK: 'Tuần nghỉ là dịp tốt để con đọc truyện, vẽ tranh hoặc chơi trò chơi trí tuệ cùng gia đình 5–10 phút mỗi ngày.',
};

/** Deterministic: rotates with the week number so the tips change from week to week. */
export function pickTips(courses: string[], weekStart: string, needs: { practiceMore: boolean; careful: boolean; lowHome: boolean; noSessions: boolean }): string[] {
  const out: string[] = [];
  const known = courses.filter((c): c is CourseCode => c in HOME_TIPS);
  const seed = Math.floor(fromIso(weekStart).getTime() / (7 * 86400_000));
  if (needs.noSessions) out.push(GENERAL_TIPS.BREAK);
  for (const [i, c] of (known.length ? known : (['TIEN_TIEU_HOC'] as CourseCode[])).entries()) {
    const list = HOME_TIPS[c];
    out.push(list[(seed + i) % list.length]);
    if (known.length === 1 && needs.practiceMore) out.push(list[(seed + 1) % list.length]);
  }
  if (needs.careful) out.push(GENERAL_TIPS.CAREFUL);
  if (needs.lowHome) out.push(GENERAL_TIPS.PRACTICE);
  return [...new Set(out)].slice(0, 3);
}

// ─── Highlights + summary ───────────────────────────────────────────────────

/** "Nguyễn Minh Khôi (mẫu)" → "Khôi". */
export const firstName = (full: string) => full.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(-1)[0] || 'bé';

const PRAISE: Record<string, (n: string) => string> = {
  [TAG.FOCUS]: (n) => `${n} tập trung tốt trong giờ học`,
  [TAG.SPEAK]: (n) => `${n} tích cực giơ tay phát biểu`,
  [TAG.WRITING]: (n) => `Chữ viết của ${n} đẹp và đều hơn`,
  [TAG.MENTAL]: (n) => `${n} tính nhẩm nhanh, chính xác`,
  [TAG.READING]: (n) => `${n} đọc trôi chảy, rõ ràng`,
  [TAG.HOMEWORK]: (n) => `${n} hoàn thành đầy đủ bài tập`,
};

export function buildHighlights(src: WeeklySource, att: AttendanceSummary, habit: { daysPracticed: number; streak: number }, inProgress = false): string[] {
  const name = firstName(src.studentName);
  const out: string[] = [];
  const inWeek = (src.reports ?? []).filter((r) => r.date >= src.weekStart && r.date <= src.weekEnd);
  const counts = new Map<string, number>();
  for (const t of inWeek.flatMap((r) => r.tags ?? [])) if (PRAISE[t]) counts.set(t, (counts.get(t) ?? 0) + 1);

  if (att.totalSessions > 0 && att.attendedCount === att.totalSessions) {
    out.push(att.onTimeCount === att.attendedCount ? `Đi học đầy đủ và đúng giờ ${att.attendedCount}/${att.totalSessions} buổi` : `Đi học đầy đủ ${att.attendedCount}/${att.totalSessions} buổi`);
  }
  for (const [t, c] of [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2)) {
    out.push(`${PRAISE[t](name)}${c > 1 ? ` (thầy cô khen ${c} buổi)` : ''}`);
  }
  if (habit.streak >= 3) out.push(`Giữ chuỗi luyện tập tại nhà ${habit.streak} ngày liên tiếp 🔥`);
  else if (habit.daysPracticed >= 3) out.push(`Luyện tập ở nhà ${habit.daysPracticed} ngày trong tuần`);

  if (out.length === 0 && inProgress && att.attendedCount === 0) {
    out.push(`Tuần học của ${name} đang diễn ra — báo cáo sẽ đầy đủ vào tối Chủ nhật`);
  } else if (out.length === 0) {
    out.push(att.totalSessions === 0 ? `Tuần này lớp nghỉ — ${name} có thời gian nghỉ ngơi và ôn bài cùng gia đình` : att.attendedCount > 0 ? `${name} đã tham gia ${att.attendedCount} buổi học cùng các bạn` : `Thầy cô luôn chờ đón ${name} quay lại lớp`);
  }
  return out.slice(0, 3);
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

function autoSummary(src: WeeklySource, att: AttendanceSummary, inProgress = false): { note: string; teacher: string | null } {
  const name = firstName(src.studentName);
  const inWeek = (src.reports ?? []).filter((r) => r.date >= src.weekStart && r.date <= src.weekEnd);
  const latest = [...inWeek].reverse().find((r) => (r.feedback ?? '').trim().length >= 10);
  const teacher = (latest ?? [...inWeek].reverse()[0])?.teacherName?.replace(/\s*\(.*?\)\s*/g, ' ').trim() || null;
  if (latest) return { note: clip(latest.feedback!.replace(/\s+/g, ' ').trim(), 280), teacher };
  if (inProgress && att.attendedCount === 0) return { note: `Thầy cô sẽ cập nhật nhận xét về ${name} sau các buổi học trong tuần.`, teacher };
  if (att.totalSessions === 0) return { note: `Chúc ${name} một tuần nghỉ thật vui. Hẹn gặp con ở buổi học tới nhé!`, teacher };
  if (att.attendedCount === 0) return { note: `Cả lớp nhớ ${name} lắm. Thầy cô mong gặp lại con ở buổi học tới!`, teacher };
  return { note: `${name} đã có một tuần học chăm chỉ. Thầy cô rất vui khi thấy con tiến bộ từng ngày — cố lên con nhé!`, teacher };
}

// ─── Build ──────────────────────────────────────────────────────────────────

/**
 * opts.today (YYYY-MM-DD): while the week is not over (teacher preview mid-week), an empty week reads as
 * "đang diễn ra" instead of "lớp nghỉ". The Sunday digest passes nothing: the week is complete.
 */
export function buildWeeklyDigest(src: WeeklySource, opts: { today?: string } = {}): WeeklyDigest {
  const inProgress = !!opts.today && opts.today < src.weekEnd;
  const att = summarizeAttendance(src);
  const habit = habitSummary(src.habitDays ?? [], src.weekStart, src.weekEnd);
  const skills = scoreSkills(src, att, habit);
  const courses = src.courses.map((c) => c.code);
  const inWeek = (src.reports ?? []).filter((r) => r.date >= src.weekStart && r.date <= src.weekEnd);
  const tags = inWeek.flatMap((r) => r.tags ?? []);
  const tips = pickTips(courses.length ? courses : [...new Set(inWeek.map((r) => r.courseCode))], src.weekStart, {
    practiceMore: tags.includes(TAG.PRACTICE_MORE),
    careful: tags.includes(TAG.CAREFUL),
    lowHome: habit.daysPracticed < 3,
    noSessions: att.totalSessions === 0 && !inProgress,
  });
  const auto = autoSummary(src, att, inProgress);
  const teacherEdited = src.existing?.generatedBy === 'TEACHER_EDITED' && !!src.existing.teacherNote;
  // Latest photos of the week (contact-book order is oldest → newest).
  const featuredMedia = inWeek.flatMap((r) => r.media ?? []).filter((m) => typeof m === 'string' && m.length > 0).reverse().slice(0, 2);
  return {
    attendanceSummary: att,
    skillScores: skills,
    habitSummary: habit,
    highlights: buildHighlights(src, att, habit, inProgress),
    tips,
    teacherSummaryNote: teacherEdited ? src.existing!.teacherNote : auto.note,
    teacherName: teacherEdited ? src.existing!.teacherName : auto.teacher,
    featuredMedia,
    hasActivity: att.totalSessions > 0 || habit.daysPracticed > 0,
    wordingSource: 'RULES',
  };
}

// ─── Optional AI wording ────────────────────────────────────────────────────

export const WEEKLY_AI_SYSTEM = `Bạn viết "Báo cáo tiến độ tuần" gửi phụ huynh của trung tâm TH EDU (trẻ 4–10 tuổi, Hà Nội).
Bạn nhận dữ liệu thật của tuần và bản nháp do hệ thống tạo. Hãy viết lại cho ấm áp, tự nhiên, cụ thể hơn.

Nguyên tắc bắt buộc:
- Chỉ dùng sự kiện có trong dữ liệu. Không bịa thêm hoạt động, điểm số, tên người hay chi tiết mới.
- Không thay đổi bất kỳ con số nào (số buổi, số ngày, chuỗi ngày).
- Giọng tích cực, khích lệ, không so sánh với bạn khác, không phê bình nặng nề.
- highlights: 1–3 câu ngắn (≤ 120 ký tự) về điểm mạnh của bé trong tuần.
- tips: 1–3 việc nhỏ ba mẹ làm cùng con ở nhà trong 5 phút, phù hợp môn học (≤ 160 ký tự mỗi việc).
- summary: 1–2 câu tổng kết (≤ 280 ký tự), xưng "thầy cô", gọi trẻ bằng tên.`;

export const WEEKLY_AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['highlights', 'tips', 'summary'],
  properties: {
    highlights: { type: 'array', items: { type: 'string' } },
    tips: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
} as const;

/** Facts only — no phone numbers, no parent names, no storage paths. */
export function weeklyAiPrompt(src: WeeklySource, draft: WeeklyDigest): string {
  const inWeek = (src.reports ?? []).filter((r) => r.date >= src.weekStart && r.date <= src.weekEnd);
  return JSON.stringify({
    tenBe: firstName(src.studentName),
    monHoc: src.courses.map((c) => c.name),
    tuan: weekLabel(src.weekStart),
    chuyenCan: draft.attendanceSummary,
    luyenTapTaiNha: draft.habitSummary,
    nhanXetCuaThayCo: inWeek.map((r) => ({ ngay: r.date, nhanXet: r.feedback ? clip(r.feedback, 400) : null, khen: r.tags })),
    banNhap: { highlights: draft.highlights, tips: draft.tips, summary: draft.teacherSummaryNote },
  });
}

/** Keep the AI's wording only if it is well-formed; numbers / photos / teacher's own note stay untouched. */
export function mergeAiWording(draft: WeeklyDigest, ai: unknown, opts: { keepSummary: boolean }): WeeklyDigest {
  const o = ai as { highlights?: unknown; tips?: unknown; summary?: unknown } | null;
  const list = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length >= 8).map((x) => clip(x.replace(/\s+/g, ' ').trim(), max)).slice(0, 3) : [];
  const hl = list(o?.highlights, 160);
  const tips = list(o?.tips, 200);
  const summary = typeof o?.summary === 'string' && o.summary.trim().length >= 10 ? clip(o.summary.replace(/\s+/g, ' ').trim(), 300) : null;
  if (!hl.length || !tips.length) return draft;
  return {
    ...draft,
    highlights: hl,
    tips,
    teacherSummaryNote: opts.keepSummary || !summary ? draft.teacherSummaryNote : summary,
    wordingSource: 'AI',
  };
}

// ─── Sharing ────────────────────────────────────────────────────────────────

export function weeklyShareText(input: { studentName: string; weekStart: string; attendance: AttendanceSummary; streak: number; highlights: string[]; teacherName?: string | null; teacherNote?: string | null }): string {
  const name = firstName(input.studentName);
  const lines = [`🌟 Thành tích tuần ${weekLabel(input.weekStart)} của ${name} tại TH EDU`];
  if (input.attendance.totalSessions > 0) lines.push(`📅 Chuyên cần: ${input.attendance.attendedCount}/${input.attendance.totalSessions} buổi`);
  if (input.streak > 0) lines.push(`🔥 Chuỗi luyện tập tại nhà: ${input.streak} ngày`);
  for (const h of input.highlights.slice(0, 3)) lines.push(`✨ ${h}`);
  if (input.teacherNote) lines.push(`💬 "${clip(input.teacherNote, 160)}"${input.teacherName ? ` — ${input.teacherName}` : ''}`);
  return lines.join('\n');
}
