import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useOnboardingStore } from '@/store/useOnboardingStore';

import Button from '../Button';

export interface CoachStep {
  emoji: string;
  title: string;
  body: string;
}

export interface CoachmarksProps {
  /** Stable id, e.g. "parent-portal-v1" — remembered on this device once finished or skipped. */
  tour: string;
  steps: CoachStep[];
  /** Show only when the screen has something to explain (e.g. after data loaded). */
  enabled?: boolean;
  /** Distance from the bottom edge (e.g. above a ThumbBar). */
  bottom?: number;
}

const useHydrated = () => {
  const [ok, setOk] = useState(() => useOnboardingStore.persist.hasHydrated());
  useEffect(() => {
    if (ok) return;
    const unsub = useOnboardingStore.persist.onFinishHydration(() => setOk(true));
    // Hydration may have finished between the first render and this effect.
    if (useOnboardingStore.persist.hasHydrated()) setOk(true);
    return unsub;
  }, [ok]);
  return ok;
};

/**
 * Lightweight first-time guide: a floating card in the thumb zone (no full-screen overlay, the screen stays usable).
 * "Bỏ qua" or finishing remembers it, so it shows once per device.
 */
export default function Coachmarks({ tour, steps, enabled = true, bottom = 16 }: CoachmarksProps) {
  const hydrated = useHydrated();
  const seen = useOnboardingStore((s) => !!s.seen[tour]);
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const [i, setI] = useState(0);

  if (!hydrated || seen || !enabled || steps.length === 0) return null;
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;

  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 px-3" style={{ bottom }}>
      <View
        className="gap-3 rounded-3xl border border-brand-100 bg-white p-4"
        style={{ shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}
        accessibilityViewIsModal={false}
        accessibilityLiveRegion="polite"
        testID="coachmark"
      >
        <View className="flex-row items-start gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
            <Text style={{ fontSize: 24 }}>{step.emoji}</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-leaf-700">
              Hướng dẫn nhanh · {i + 1}/{steps.length}
            </Text>
            <Text className="text-[16px] font-extrabold leading-[22px] text-ink" accessibilityRole="header">
              {step.title}
            </Text>
            <Text className="text-[14px] leading-[21px] text-ink-muted">{step.body}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row gap-1.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {steps.map((_, k) => (
              <View key={k} className={`h-2 rounded-full ${k === i ? 'w-5 bg-brand-500' : 'w-2 bg-slate-200'}`} />
            ))}
          </View>
          {!last && (
            <Pressable onPress={() => markSeen(tour)} accessibilityRole="button" className="min-h-12 justify-center rounded-2xl px-3 active:bg-slate-100" testID="coachmark-skip">
              <Text className="text-[14px] font-semibold text-ink-muted">Bỏ qua</Text>
            </Pressable>
          )}
          <Button
            title={last ? 'Đã hiểu' : 'Tiếp theo'}
            onPress={() => (last ? markSeen(tour) : setI(i + 1))}
            className="min-w-[116px]"
            testID="coachmark-next"
          />
        </View>
      </View>
    </View>
  );
}
