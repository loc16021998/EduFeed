/**
 * "Góc ôn tập thông minh" — 60-second review games. Pure logic (tested): question generators and scoring.
 *   LETTER_HUNT  "Săn chữ cái"  find the named letter among look-alikes (b/d/p/q, m/n, ă/â…) — Tiền tiểu học, Luyện chữ
 *   QUICK_MATH   "Tính nhanh"   pick the answer of a + / − within 20 (harder as the streak grows) — Toán tư duy
 */
import type { CourseCategory } from '@/types';

export type GameKey = 'LETTER_HUNT' | 'QUICK_MATH';
export const GAME_SECONDS = 60;
/** "Win" (confetti): at least this many right answers with ≥ 80 % accuracy. */
export const WIN_CORRECT = 10;

export interface GameInfo {
  key: GameKey;
  emoji: string;
  title: string;
  subtitle: string;
  courses: CourseCategory[];
}

export const GAMES: GameInfo[] = [
  { key: 'LETTER_HUNT', emoji: '🔤', title: 'Săn chữ cái', subtitle: 'Tìm đúng chữ cô đọc — b, d, p, q dễ nhầm lắm!', courses: ['TIEN_TIEU_HOC', 'LUYEN_CHU_DEP', 'BOI_DUONG_TOAN_TV'] },
  { key: 'QUICK_MATH', emoji: '➕', title: 'Tính nhanh', subtitle: 'Chọn đáp án đúng cho phép cộng, trừ trong 20', courses: ['TOAN_TU_DUY', 'TIEN_TIEU_HOC', 'BOI_DUONG_TOAN_TV'] },
];

export interface Question {
  /** Big text shown to the child. */
  prompt: string;
  /** Short instruction above it. */
  hint: string;
  options: string[];
  answer: string;
}

/** Small deterministic RNG (mulberry32) so tests can fix the sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)];
function shuffle<T>(r: () => number, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Groups of letters children confuse; distractors come from the same group first.
const LOOKALIKES = [
  ['b', 'd', 'p', 'q'],
  ['m', 'n', 'u', 'h'],
  ['a', 'ă', 'â', 'o'],
  ['o', 'ô', 'ơ', 'c'],
  ['e', 'ê', 'c', 'o'],
  ['u', 'ư', 'n', 'v'],
  ['d', 'đ', 'b', 'l'],
  ['l', 'h', 'k', 't'],
  ['g', 'y', 'q', 'p'],
  ['s', 'x', 'r', 'v'],
] as const;

export function letterQuestion(r: () => number): Question {
  const group = pick(r, LOOKALIKES);
  const answer = pick(r, group);
  const pool = new Set<string>(group.filter((l) => l !== answer));
  while (pool.size < 5) for (const l of pick(r, LOOKALIKES)) if (l !== answer) pool.add(l);
  // Look-alikes from the answer's own group first, then others.
  const others = shuffle(r, [...pool].filter((l) => !(group as readonly string[]).includes(l)));
  const own = group.filter((l) => l !== answer);
  const options = shuffle(r, [answer, ...[...own, ...others].slice(0, 5)]);
  return { prompt: answer, hint: 'Chạm vào chữ', options, answer };
}

/** level 0 → sums ≤ 10; level 1 → ≤ 20; level 2 → ≤ 20 with subtraction across 10. */
export function mathQuestion(r: () => number, level: number): Question {
  const max = level === 0 ? 10 : 20;
  let a: number, b: number, op: '+' | '−', ans: number;
  if (r() < 0.5 || level === 0) {
    a = 1 + Math.floor(r() * (max - 1));
    b = 1 + Math.floor(r() * (max - a));
    op = '+';
    ans = a + b;
  } else {
    a = (level === 2 ? 11 : 2) + Math.floor(r() * (max - (level === 2 ? 11 : 2) + 1));
    b = 1 + Math.floor(r() * (level === 2 ? Math.min(9, a - 1) : a - 1));
    op = '−';
    ans = a - b;
  }
  const wrong = new Set<number>();
  for (const d of shuffle(r, [-2, -1, 1, 2, 3, -3, 10, -10])) {
    const w = ans + d;
    if (w >= 0 && w <= 30 && wrong.size < 3) wrong.add(w);
  }
  return { prompt: `${a} ${op} ${b}`, hint: 'Bằng bao nhiêu?', options: shuffle(r, [ans, ...wrong].map(String)), answer: String(ans) };
}

export function nextQuestion(game: GameKey, r: () => number, streak: number): Question {
  return game === 'LETTER_HUNT' ? letterQuestion(r) : mathQuestion(r, streak >= 8 ? 2 : streak >= 3 ? 1 : 0);
}

export interface GameResult {
  correct: number;
  total: number;
}

export const isWin = (r: GameResult) => r.correct >= WIN_CORRECT && r.correct * 5 >= r.total * 4;

/** Same rule as the database (game_submit) — shown before the server confirms. */
export function previewPoints(r: GameResult, rewardedPlaysLeft: number): number {
  if (rewardedPlaysLeft <= 0) return 0;
  return Math.min(r.correct, 30) + (r.total >= 10 && r.correct * 5 >= r.total * 4 ? 10 : 0);
}

export function resultMessage(r: GameResult): string {
  if (r.total === 0) return 'Hết giờ rồi! Lần sau mình cùng thử nhé.';
  if (isWin(r)) return 'Xuất sắc! Con nhanh và chính xác quá 🎉';
  if (r.correct * 5 >= r.total * 4) return 'Rất chính xác! Lần sau thử nhanh hơn chút nhé.';
  if (r.correct >= WIN_CORRECT) return 'Nhanh lắm! Giờ mình chậm lại một chút cho thật đúng nhé.';
  return 'Con đã cố gắng rồi! Chơi thêm vài lần là giỏi ngay.';
}
