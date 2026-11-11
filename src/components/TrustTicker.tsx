import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { timeAgoVN } from '@/services/trust';
import { useTrustStore } from '@/store/useTrustStore';
import { isWeb } from '@/utils/platform';

import SampleDataTag from './SampleDataTag';

interface TrustTickerProps {
  /** Pause rotation + polling while the screen isn't focused. */
  active?: boolean;
  rotateMs?: number;
}

/**
 * Slim, non-intrusive stream of real recent bookings (anonymised server-side).
 * Renders nothing when there's no genuine activity — it never invents events.
 */
export default function TrustTicker({ active = true, rotateMs = 4500 }: TrustTickerProps) {
  const { data: events, origin } = useTrustStore((s) => s.activity);
  const loadActivity = useTrustStore((s) => s.loadActivity);
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  // Poll for fresh activity every minute while visible.
  useEffect(() => {
    if (!active) return;
    loadActivity();
    const t = setInterval(() => loadActivity(true), 60_000);
    return () => clearInterval(t);
  }, [active, loadActivity]);

  useEffect(() => {
    if (!active || events.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % events.length), rotateMs);
    return () => clearInterval(t);
  }, [active, events.length, rotateMs]);

  if (events.length === 0) return null;
  const e = events[index % events.length];

  return (
    <View
      className="mx-4 mb-2 h-9 flex-row items-center gap-2 overflow-hidden rounded-full border border-emerald-100 bg-emerald-50 px-3"
      accessible
      accessibilityLabel={`Hoạt động gần đây: ${e.actorLabel} vừa đặt lịch học thử ${e.courseName} tại ${e.branchName}, ${timeAgoVN(e.createdAt)}`}
    >
      <PulseDot animate={active && !reduceMotion} />
      <View className="flex-1 overflow-hidden">
        {/* Web: Reanimated's CSS keyframe exit leaves absolutely-positioned copies that clip the
            text inside this short bar, so swap items without layout animations there. */}
        <Animated.View
          key={e.id}
          entering={isWeb ? undefined : reduceMotion ? FadeIn : FadeInDown.duration(320)}
          exiting={isWeb ? undefined : reduceMotion ? FadeOut : FadeOutUp.duration(220)}
        >
          <Text className="text-[12px] text-emerald-900" numberOfLines={1}>
            <Text className="font-bold">{e.actorLabel}</Text> vừa đặt lịch học thử{' '}
            <Text className="font-bold">{e.courseName}</Text> tại {e.branchName}
            <Text className="text-emerald-700"> · {timeAgoVN(e.createdAt)}</Text>
          </Text>
        </Animated.View>
      </View>
      <SampleDataTag origin={origin} />
    </View>
  );
}

function PulseDot({ animate }: { animate: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = animate ? withRepeat(withTiming(1, { duration: 1400 }), -1, false) : 0;
  }, [animate, p]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.6 }] }));

  return (
    <View className="h-2.5 w-2.5 items-center justify-center">
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' }, ring]} />
      <View className="h-2 w-2 rounded-full bg-emerald-500" />
    </View>
  );
}
