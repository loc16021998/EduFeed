/**
 * "Thử thách 21 Ngày" — small daily at-home habits, ticked off by the parent on this device.
 * Pure logic (tested); state lives in useHabitStore. Nothing here is sent to the centre.
 */
import type { CourseCategory } from '@/types';

export const CHALLENGE_DAYS = 21;

export interface HabitChallenge {
  key: string;
  emoji: string;
  title: string;
  /** What to do each day (5–10 minutes). */
  daily: string;
  course: CourseCategory | null;
}

export const HABIT_CHALLENGES: HabitChallenge[] = [
  { key: 'WRITE_LINE', emoji: '✍️', title: 'Viết đẹp mỗi ngày', daily: 'Viết 1 dòng chữ thật nắn nót trong vở ô li', course: 'LUYEN_CHU_DEP' },
  { key: 'MENTAL_MATH', emoji: '🧮', title: 'Tính nhẩm 10 phép', daily: 'Cùng ba mẹ tính nhẩm 10 phép cộng trừ', course: 'TOAN_TU_DUY' },
  { key: 'READ_ALOUD', emoji: '📖', title: 'Đọc to 5 phút', daily: 'Đọc to một đoạn truyện cho ba mẹ nghe', course: 'TIEN_TIEU_HOC' },
  { key: 'TIDY_DESK', emoji: '🎒', title: 'Tự soạn cặp sách', daily: 'Tự xếp sách vở, bút thước cho buổi học mai', course: null },
  /** Ticked automatically when the child finishes a game in "Góc ôn tập thông minh". */
  { key: 'MINI_GAME', emoji: '🎮', title: 'Ôn tập 1 phút', daily: 'Chơi 1 lượt trong Góc ôn tập thông minh (tự đánh dấu)', course: null },
];

/** Challenges matching the child's courses first, then the general ones. */
export function challengesFor(courses: CourseCategory[]): HabitChallenge[] {
  const mine = HABIT_CHALLENGES.filter((c) => c.course && courses.includes(c.course));
  const rest = HABIT_CHALLENGES.filter((c) => !mine.includes(c));
  return [...mine, ...rest];
}

/** Local calendar date "YYYY-MM-DD". */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
};

export interface HabitProgress {
  /** Days ticked (unique, sorted). */
  done: number;
  /** Consecutive days ending today (or yesterday, if today isn't ticked yet). */
  streak: number;
  checkedToday: boolean;
  completed: boolean;
}

export function habitProgress(days: string[], today = localDay()): HabitProgress {
  const set = new Set(days);
  const checkedToday = set.has(today);
  let cursor = checkedToday ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const done = Math.min(set.size, CHALLENGE_DAYS);
  return { done, streak, checkedToday, completed: done >= CHALLENGE_DAYS };
}

/** Add today (idempotent). Returns the new list. */
export function checkIn(days: string[], today = localDay()): string[] {
  if (days.includes(today) || days.length >= CHALLENGE_DAYS) return days;
  return [...days, today].sort();
}

/** Gentle message for the current state — never guilt-trips a missed day. */
export function habitMessage(p: HabitProgress): string {
  if (p.completed) return 'Hoàn thành 21 ngày! Một thói quen tốt đã thành hình 🎉';
  if (p.checkedToday) return p.streak >= 3 ? `Chuỗi ${p.streak} ngày liên tiếp — tuyệt vời!` : 'Hôm nay xong rồi, hẹn bé ngày mai nhé!';
  if (p.done === 0) return 'Bắt đầu ngày đầu tiên cùng bé nhé!';
  if (p.streak === 0) return 'Không sao cả, mình tiếp tục từ hôm nay nhé!';
  return `Giữ chuỗi ${p.streak} ngày — đánh dấu hôm nay thôi!`;
}
