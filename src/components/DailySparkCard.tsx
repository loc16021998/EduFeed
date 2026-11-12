import AsyncStorage from '@react-native-async-storage/async-storage';
import { Heart, Lightbulb, Share2, X } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dayNumber, pickSpark } from '@/content/parentingSparks';
import { useBookingStore, useQuizStore, useUserStore } from '@/store';
import { CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';
import { shareText } from '@/utils/platform';

// Likes + "hide for today", kept on this device.
interface SparkPrefs {
  liked: string[];
  hiddenDay: number | null;
  toggleLike: (id: string) => boolean;
  hideToday: () => void;
}
export const useSparkPrefs = create<SparkPrefs>()(
  persist(
    (set, get) => ({
      liked: [],
      hiddenDay: null,
      toggleLike: (id) => {
        const on = !get().liked.includes(id);
        set({ liked: on ? [...get().liked.slice(-99), id] : get().liked.filter((x) => x !== id) });
        return on;
      },
      hideToday: () => set({ hiddenDay: dayNumber() }),
    }),
    { name: 'thedu.sparks', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

const HEARTS = 6;

/**
 * Daily parenting tip on the home feed, matched to the child's age and course
 * (from the quiz result / booking form / saved profile). Changes every day.
 * Like = floating hearts + haptic; Share = native share sheet (clipboard on desktop web).
 */
function DailySparkCard() {
  const quizCourse = useQuizStore((s) => s.result?.primary ?? null);
  const formCourse = useBookingStore((s) => s.form.course);
  const age = useUserStore((s) => s.childAge);
  const course = quizCourse ?? formCourse ?? null;
  const spark = useMemo(() => pickSpark(course, age), [course, age]);

  const liked = useSparkPrefs((s) => s.liked.includes(spark.id));
  const toggleLike = useSparkPrefs((s) => s.toggleLike);
  const hideToday = useSparkPrefs((s) => s.hideToday);
  const [burst, setBurst] = useState(0);
  const pop = useSharedValue(1);

  const onLike = useCallback(() => {
    const on = toggleLike(spark.id);
    pop.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 300 }), withSpring(1));
    if (on) {
      haptics.light();
      setBurst((n) => n + 1);
    }
  }, [toggleLike, spark.id, pop]);

  const onShare = () => shareText(`💡 ${spark.text}\n\n— Mẹo mỗi ngày cho ba mẹ từ TH EDU`);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const forWho = [age ? `Bé ${age} tuổi` : null, course ? CATEGORY_LABELS[course] : null].filter(Boolean).join(' · ');

  return (
    <View className="mx-4 mb-4 gap-2.5 rounded-3xl border border-amber-100 bg-amber-50 p-4" testID="daily-spark">
      <View className="flex-row items-center gap-2">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-amber-400">
          <Lightbulb size={15} color="#fff" />
        </View>
        <Text className="flex-1 text-[13px] font-extrabold uppercase tracking-wide text-amber-900">Mẹo mỗi ngày</Text>
        {!!forWho && <Text className="text-[11px] font-semibold text-amber-800/80">{forWho}</Text>}
        <Pressable onPress={hideToday} accessibilityRole="button" accessibilityLabel="Ẩn mẹo hôm nay" hitSlop={8} className="ml-1 h-7 w-7 items-center justify-center rounded-full active:bg-amber-100">
          <X size={15} color="#92400E" />
        </Pressable>
      </View>

      <Text className="text-[15px] leading-[22px] text-ink">{spark.text}</Text>

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onLike}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? 'Bỏ thích mẹo này' : 'Thích mẹo này'}
          className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${liked ? 'bg-rose-100' : 'bg-white'}`}
        >
          <View>
            <Animated.View style={heartStyle}>
              <Heart size={16} color={liked ? '#E11D48' : COLORS.muted} fill={liked ? '#E11D48' : 'transparent'} />
            </Animated.View>
            <FloatingHearts burst={burst} />
          </View>
          <Text className={`text-[13px] font-semibold ${liked ? 'text-rose-600' : 'text-ink-muted'}`}>{liked ? 'Đã thích' : 'Hữu ích'}</Text>
        </Pressable>
        <Pressable onPress={onShare} accessibilityRole="button" className="flex-row items-center gap-1.5 rounded-full bg-white px-3.5 py-2 active:bg-slate-50">
          <Share2 size={15} color={COLORS.muted} />
          <Text className="text-[13px] font-semibold text-ink-muted">Chia sẻ</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A handful of hearts float up and fade from the like button. */
function FloatingHearts({ burst }: { burst: number }) {
  if (!burst) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: HEARTS }, (_, i) => (
        <FloatingHeart key={`${burst}-${i}`} index={i} />
      ))}
    </View>
  );
}

function FloatingHeart({ index }: { index: number }) {
  const t = useSharedValue(0);
  const [done, setDone] = useState(false);
  const dx = (index - (HEARTS - 1) / 2) * 9;
  const rise = 46 + (index % 3) * 14;
  useEffect(() => {
    t.value = withTiming(1, { duration: 900 + index * 70, easing: Easing.out(Easing.quad) }, (fin) => {
      if (fin) runOnJS(setDone)(true);
    });
  }, [t, index]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateX: dx * t.value }, { translateY: -rise * t.value }, { scale: 0.6 + t.value * 0.5 }],
  }));
  if (done) return null;
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <Heart size={14} color="#F43F5E" fill="#F43F5E" />
    </Animated.View>
  );
}

/** True when the parent hid today's tip. */
export const useSparkHiddenToday = () => useSparkPrefs((s) => s.hiddenDay === dayNumber());

export default memo(DailySparkCard);
