/**
 * Mini-game points (game_submit / game_summary). Points are encouragement only: 1 per right answer (max 30)
 * + 10 at ≥ 80 % accuracy, for the first 3 plays per child per day. Demo mode keeps the same rule in memory.
 */
import { supabase } from '@/lib/supabase';
import { sleep } from '@/utils/helpers';
import { previewPoints, type GameKey, type GameResult } from '@/utils/miniGames';

import { ApiError } from './apiClient';

export interface GameSummary {
  totalPoints: number;
  playsToday: number;
  best: Partial<Record<GameKey, number>>;
}

export interface SubmitResult {
  points: number;
  rewardedLeft: number;
  totalPoints: number;
}

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint === 'RATE_LIMITED') return new ApiError(error.message, 'RATE_LIMITED', 429);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (hint.startsWith('VALIDATION')) return new ApiError(error.message, 'VALIDATION', 422);
  if (/game_/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có Góc ôn tập. Chạy supabase/sql/upgrades/20261128090000_voice_games_community.sql.', 'INTERNAL');
  }
  return new ApiError('Chưa lưu được điểm, vui lòng thử lại.', 'INTERNAL');
}

const demoPlays: Record<string, { game: GameKey; correct: number; points: number; day: string }[]> = {};
const day = () => new Date().toDateString();

export async function fetchGameSummary(studentId: string): Promise<GameSummary> {
  if (!supabase) {
    await sleep(150);
    const plays = demoPlays[studentId] ?? [];
    const best: GameSummary['best'] = {};
    for (const p of plays) best[p.game] = Math.max(best[p.game] ?? 0, p.correct);
    return { totalPoints: plays.reduce((s, p) => s + p.points, 0), playsToday: plays.filter((p) => p.day === day()).length, best };
  }
  const { data, error } = await supabase.rpc('game_summary' as never, { p_student_id: studentId } as never);
  if (error) throw mapDbError(error);
  const d = data as unknown as { total_points: number; plays_today: number; best: Record<string, number> };
  return { totalPoints: Number(d.total_points ?? 0), playsToday: Number(d.plays_today ?? 0), best: d.best ?? {} };
}

export async function submitGame(studentId: string, game: GameKey, r: GameResult): Promise<SubmitResult> {
  if (!supabase) {
    await sleep(200);
    const plays = (demoPlays[studentId] ??= []);
    const today = plays.filter((p) => p.day === day()).length;
    const points = previewPoints(r, 3 - today);
    plays.push({ game, correct: r.correct, points, day: day() });
    return { points, rewardedLeft: Math.max(0, 2 - today), totalPoints: plays.reduce((s, p) => s + p.points, 0) };
  }
  const { data, error } = await supabase.rpc('game_submit' as never, { p_student_id: studentId, p_game: game, p_correct: r.correct, p_total: r.total } as never);
  if (error) throw mapDbError(error);
  const d = data as unknown as { points: number; rewarded_left: number; total_points: number };
  return { points: Number(d.points), rewardedLeft: Number(d.rewarded_left), totalPoints: Number(d.total_points) };
}
