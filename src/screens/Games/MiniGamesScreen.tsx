import { Clock, Star, Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader } from '@/components';
import Confetti from '@/components/Confetti';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { fetchGameSummary, submitGame, type GameSummary, type SubmitResult } from '@/services/games';
import { useParentStore } from '@/store';
import { useHabitStore } from '@/store/useHabitStore';
import { haptics } from '@/utils/haptics';
import { GAME_SECONDS, GAMES, isWin, nextQuestion, resultMessage, rng, type GameKey, type GameResult, type Question } from '@/utils/miniGames';

type Phase = { name: 'hub' } | { name: 'play'; game: GameKey; round: number } | { name: 'done'; game: GameKey; result: GameResult };

/** "Góc ôn tập thông minh" — 60-second review games for the selected child. Route /con-toi/on-tap. */
export default function MiniGamesScreen({ navigation }: RootStackScreenProps<'MiniGames'>) {
  const insets = useSafeAreaInsets();
  const { status, portal, selectedStudentId } = useParentStore();
  const student = portal?.students.find((s) => s.id === selectedStudentId) ?? portal?.students[0] ?? null;
  const [phase, setPhase] = useState<Phase>({ name: 'hub' });
  const [summary, setSummary] = useState<GameSummary | null>(null);

  useEffect(() => {
    if (status === 'signedOut') navigation.replace('ParentAuth');
    else if (status === 'signedIn' && !portal) useParentStore.getState().load();
  }, [status, portal, navigation]);

  const loadSummary = useCallback(() => {
    if (student) fetchGameSummary(student.id).then(setSummary, () => setSummary({ totalPoints: 0, playsToday: 0, best: {} }));
  }, [student]);
  useEffect(loadSummary, [loadSummary]);

  const courses = student?.enrollments.filter((e) => e.status === 'ACTIVE').map((e) => e.courseCode) ?? [];
  const games = useMemo(() => [...GAMES].sort((a, b) => Number(b.courses.some((c) => courses.includes(c))) - Number(a.courses.some((c) => courses.includes(c)))), [courses.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstName = student ? student.fullName.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(-1)[0] : 'bé';

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Góc ôn tập thông minh"
        onBack={() => (phase.name === 'play' ? setPhase({ name: 'hub' }) : navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ParentPortal'))}
      />
      {phase.name === 'play' && student ? (
        <GameBoard key={`${phase.game}-${phase.round}`} game={phase.game} onDone={(result) => setPhase({ name: 'done', game: phase.game, result })} />
      ) : (
        <ScrollView contentContainerClassName="gap-3 px-4 pt-1" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} testID="games-hub">
          {phase.name === 'done' && student && (
            <ResultCard
              studentId={student.id}
              game={phase.game}
              result={phase.result}
              onAgain={() => setPhase({ name: 'play', game: phase.game, round: Date.now() })}
              onHub={() => {
                setPhase({ name: 'hub' });
                loadSummary();
              }}
            />
          )}
          {phase.name === 'hub' && (
            <>
              <View className="flex-row items-center gap-3 rounded-3xl bg-brand-500 p-4">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                  <Trophy size={24} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-white">Điểm chăm chỉ của {firstName}</Text>
                  <Text className="text-xs text-white/85">{summary ? `${summary.playsToday} lượt hôm nay · 3 lượt đầu mỗi ngày được tính điểm` : 'Đang tải…'}</Text>
                </View>
                <Text className="text-[28px] font-black text-white" testID="game-points">
                  {summary?.totalPoints ?? '—'}
                </Text>
              </View>
              {!hasSupabase && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Bản demo: điểm chỉ lưu tạm trên máy.</Text>}
              {games.map((g) => (
                <Pressable
                  key={g.key}
                  disabled={!student}
                  onPress={() => {
                    haptics.light();
                    setPhase({ name: 'play', game: g.key, round: Date.now() });
                  }}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 rounded-3xl bg-white p-4 active:bg-slate-50"
                  testID={`game-${g.key}`}
                >
                  <Text style={{ fontSize: 36 }}>{g.emoji}</Text>
                  <View className="flex-1 gap-0.5">
                    <Text className="text-[16px] font-bold text-ink">{g.title}</Text>
                    <Text className="text-[13px] leading-5 text-ink-muted">{g.subtitle}</Text>
                    {!!summary?.best[g.key] && <Text className="text-xs font-semibold text-brand-700">Kỷ lục: {summary.best[g.key]} câu đúng</Text>}
                  </View>
                  <View className="rounded-full bg-accent-500 px-3 py-1.5">
                    <Text className="text-xs font-bold text-white">{GAME_SECONDS}s</Text>
                  </View>
                </Pressable>
              ))}
              <Text className="px-1 text-center text-[11px] leading-4 text-ink-subtle">Mỗi lượt 1 phút — chơi cùng ba mẹ, ngồi cách màn hình một sải tay. Xong lượt đầu mỗi ngày, ô “Ôn tập 1 phút” trong Thử thách 21 ngày được tự đánh dấu.</Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Board ──────────────────────────────────────────────────────────────────

function GameBoard({ game, onDone }: { game: GameKey; onDone: (r: GameResult) => void }) {
  const r = useRef(rng(Date.now() % 2147483647)).current;
  const [left, setLeft] = useState(GAME_SECONDS);
  const [score, setScore] = useState<GameResult>({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [q, setQ] = useState<Question>(() => nextQuestion(game, r, 0));
  const [flash, setFlash] = useState<{ choice: string; ok: boolean } | null>(null);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }, { scale: pop.value }] }));

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  const finished = useRef(false);
  useEffect(() => {
    if (left <= 0 && !finished.current) {
      finished.current = true;
      haptics.success();
      onDone(scoreRef.current);
    }
  }, [left, onDone]);

  const answer = (choice: string) => {
    if (flash || left <= 0) return;
    const ok = choice === q.answer;
    setFlash({ choice, ok });
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
    if (ok) {
      haptics.light();
      pop.value = withSequence(withTiming(1.08, { duration: 90 }), withSpring(1, { damping: 9 }));
    } else {
      haptics.medium();
      shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 }));
    }
    const nextStreak = ok ? streak + 1 : 0;
    setStreak(nextStreak);
    setTimeout(() => {
      setFlash(null);
      setQ(nextQuestion(game, r, nextStreak));
    }, ok ? 220 : 520);
  };

  const cols = q.options.length > 4 ? 3 : 2;
  return (
    <View className="flex-1 gap-4 px-4 pt-2" testID="game-board">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
          <Clock size={16} color={left <= 10 ? '#DC2626' : '#0F172A'} />
          <Text className={`text-[16px] font-black ${left <= 10 ? 'text-red-600' : 'text-ink'}`} testID="game-timer">
            {Math.max(0, left)}s
          </Text>
        </View>
        {streak >= 3 && <Text className="text-[13px] font-bold text-accent-600">🔥 {streak} câu liên tiếp</Text>}
        <View className="flex-row items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
          <Star size={16} color="#F59E0B" fill="#F59E0B" />
          <Text className="text-[16px] font-black text-ink" testID="game-score">
            {score.correct}
          </Text>
        </View>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-slate-200">
        <View className="h-full rounded-full bg-brand-500" style={{ width: `${(Math.max(0, left) / GAME_SECONDS) * 100}%` }} />
      </View>

      <Animated.View style={shakeStyle} className="items-center gap-1 rounded-3xl bg-white py-8">
        <Text className="text-[14px] font-semibold text-ink-muted">{q.hint}</Text>
        <Text className="font-black text-ink" style={{ fontSize: game === 'LETTER_HUNT' ? 72 : 52 }} testID="game-prompt">
          {q.prompt}
        </Text>
      </Animated.View>

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {q.options.map((o) => {
          const state = flash && (o === flash.choice ? (flash.ok ? 'ok' : 'bad') : flash && !flash.ok && o === q.answer ? 'ok' : null);
          return (
            <Pressable
              key={o}
              onPress={() => answer(o)}
              accessibilityRole="button"
              accessibilityLabel={`Đáp án ${o}`}
              style={{ width: cols === 3 ? '31.5%' : '48.5%', height: cols === 3 ? 88 : 96 }}
              className={`items-center justify-center rounded-3xl border-2 ${
                state === 'ok' ? 'border-emerald-500 bg-emerald-50' : state === 'bad' ? 'border-red-400 bg-red-50' : 'border-transparent bg-white active:bg-brand-50'
              }`}
              testID="game-option"
            >
              <Text className="font-black text-ink" style={{ fontSize: game === 'LETTER_HUNT' ? 44 : 34 }}>
                {o}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Result ─────────────────────────────────────────────────────────────────

function ResultCard({ studentId, game, result, onAgain, onHub }: { studentId: string; game: GameKey; result: GameResult; onAgain: () => void; onHub: () => void }) {
  const [saved, setSaved] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [shot, setShot] = useState(0);
  const win = isWin(result);

  useEffect(() => {
    let alive = true;
    submitGame(studentId, game, result).then(
      (s) => alive && setSaved(s),
      (e) => alive && setError(e instanceof Error ? e.message : 'Chưa lưu được điểm'),
    );
    // Counts as today's "Ôn tập 1 phút" in the 21-day challenge (idempotent per day).
    if (result.total > 0) useHabitStore.getState().tick(studentId, 'MINI_GAME');
    if (win) setTimeout(() => setShot(1), 150);
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  return (
    <View
      className="items-center gap-3 overflow-hidden rounded-3xl bg-white p-5"
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      testID="game-result"
    >
      <Text style={{ fontSize: 48 }}>{win ? '🏆' : '⭐'}</Text>
      <Text className="text-center text-[17px] font-bold text-ink">{resultMessage(result)}</Text>
      <View className="flex-row gap-6">
        <View className="items-center">
          <Text className="text-[28px] font-black text-brand-600" testID="result-correct">
            {result.correct}
          </Text>
          <Text className="text-xs text-ink-muted">câu đúng</Text>
        </View>
        <View className="items-center">
          <Text className="text-[28px] font-black text-ink">{pct}%</Text>
          <Text className="text-xs text-ink-muted">chính xác</Text>
        </View>
        <View className="items-center">
          <Text className="text-[28px] font-black text-accent-600" testID="result-points">
            {saved ? `+${saved.points}` : '…'}
          </Text>
          <Text className="text-xs text-ink-muted">điểm</Text>
        </View>
      </View>
      {saved && saved.points === 0 && <Text className="text-center text-xs text-ink-muted">Hôm nay đã đủ 3 lượt tính điểm — chơi tiếp để luyện thêm nhé!</Text>}
      {!!error && <Text className="text-center text-xs text-red-600">{error}</Text>}
      <View className="w-full flex-row gap-2.5">
        <Button className="flex-1" title="Chơi lại" variant="accent" onPress={onAgain} testID="game-again" />
        <Button className="flex-1" title="Về Góc ôn tập" variant="outline" onPress={onHub} />
      </View>
      {box.w > 0 && <Confetti shot={shot} width={box.w} height={box.h} count={48} />}
    </View>
  );
}
