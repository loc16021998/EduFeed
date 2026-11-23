import { Check, Flame, RotateCcw } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import Confetti from '@/components/Confetti';
import type { CourseCategory } from '@/types';
import { CHALLENGE_DAYS, challengesFor, habitMessage, habitProgress, localDay } from '@/utils/habitStreak';
import { haptics } from '@/utils/haptics';
import { useHabitStore } from '@/store/useHabitStore';

const EMPTY: string[] = [];

/**
 * "Thử thách 21 Ngày" — pick a small daily habit for the child and tick it off each evening.
 * 21 dots fill up; confetti + haptic on each tick (bigger burst at day 21). Stored on the device, synced to the centre.
 */
export default function HabitStreakWidget({ studentId, studentName, courses }: { studentId: string; studentName: string; courses: CourseCategory[] }) {
  const challenges = useMemo(() => challengesFor(courses), [courses]);
  const activeKey = useHabitStore((s) => s.active[studentId]) ?? challenges[0].key;
  const days = useHabitStore((s) => s.days[studentId]?.[activeKey]) ?? EMPTY;
  const { tick, choose, restart } = useHabitStore.getState();
  const challenge = challenges.find((c) => c.key === activeKey) ?? challenges[0];
  const p = habitProgress(days, localDay());

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [shot, setShot] = useState(0);
  const scale = useSharedValue(1);
  const btn = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const firstName = studentName.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(-1)[0] || 'Bé';

  const onTick = () => {
    if (p.checkedToday || p.completed) return;
    scale.value = withSequence(withTiming(0.92, { duration: 80 }), withSpring(1, { damping: 7 }));
    tick(studentId, challenge.key);
    haptics.success();
    setShot((n) => n + 1);
  };

  return (
    <View
      className="gap-3 overflow-hidden rounded-3xl bg-white p-4"
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      testID="habit-widget"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[15px] font-bold text-ink">Thử thách 21 ngày</Text>
        <View className="flex-row items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1">
          <Flame size={14} color="#EA580C" />
          <Text className="text-xs font-extrabold text-orange-700" testID="habit-streak">
            {p.streak} ngày liên tiếp
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {challenges.map((c) => {
          const on = c.key === challenge.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => {
                haptics.light();
                choose(studentId, c.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className={`h-9 flex-row items-center gap-1.5 rounded-full px-3 ${on ? 'bg-brand-500' : 'bg-slate-100 active:bg-slate-200'}`}
            >
              <Text className="text-[14px]">{c.emoji}</Text>
              <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-ink'}`}>{c.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text className="text-[13px] leading-5 text-ink-muted">
        Mỗi ngày: <Text className="font-semibold text-ink">{challenge.daily}</Text>
      </Text>

      {/* 21 dots: 3 rows × 7 */}
      <View className="flex-row flex-wrap justify-between gap-y-2" accessibilityLabel={`Đã hoàn thành ${p.done} trên ${CHALLENGE_DAYS} ngày`}>
        {Array.from({ length: CHALLENGE_DAYS }, (_, i) => {
          const filled = i < p.done;
          const isToday = i === p.done - 1 && p.checkedToday;
          return (
            <View
              key={i}
              style={{ width: '13%', aspectRatio: 1 }}
              className={`items-center justify-center rounded-full ${filled ? (isToday ? 'bg-accent-500' : 'bg-brand-500') : 'border border-dashed border-slate-300 bg-slate-50'}`}
            >
              {filled ? <Check size={14} color="#fff" strokeWidth={3} /> : <Text className="text-[10px] font-bold text-ink-subtle">{i + 1}</Text>}
            </View>
          );
        })}
      </View>

      <Text className="text-center text-[13px] font-semibold text-ink" testID="habit-message">
        {habitMessage(p)}
      </Text>

      {p.completed ? (
        <Pressable
          onPress={() => restart(studentId, challenge.key)}
          accessibilityRole="button"
          className="h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-slate-100 active:bg-slate-200"
        >
          <RotateCcw size={16} color="#0F172A" />
          <Text className="text-[15px] font-bold text-ink">Bắt đầu thử thách mới</Text>
        </Pressable>
      ) : (
        <Animated.View style={btn}>
          <Pressable
            onPress={onTick}
            disabled={p.checkedToday}
            accessibilityRole="button"
            accessibilityState={{ disabled: p.checkedToday }}
            className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl ${p.checkedToday ? 'bg-emerald-50' : 'bg-accent-500 active:bg-accent-600'}`}
            testID="habit-tick"
          >
            <Check size={18} color={p.checkedToday ? '#047857' : '#fff'} strokeWidth={3} />
            <Text className={`text-[15px] font-bold ${p.checkedToday ? 'text-emerald-700' : 'text-white'}`}>
              {p.checkedToday ? `Hôm nay ${firstName} đã hoàn thành` : `${firstName} đã hoàn thành hôm nay`}
            </Text>
          </Pressable>
        </Animated.View>
      )}
      <Text className="text-center text-[11px] text-ink-subtle">Ba mẹ tự đánh dấu cùng bé · chuỗi ngày hiện trong Báo cáo tuần</Text>

      {box.w > 0 && <Confetti shot={shot} width={box.w} height={box.h} count={p.completed ? 60 : 28} />}
    </View>
  );
}
