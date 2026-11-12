import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

const COLORS = ['#F97316', '#2F6BFF', '#EC4899', '#F59E0B', '#8B5CF6', '#10B981', '#8BC34A'];

interface ConfettiProps {
  /** Increment to fire a new burst (0 = nothing). Each value fires once. */
  shot: number;
  /** Size of the area the confetti falls through. */
  width: number;
  height: number;
  count?: number;
}

/**
 * Confetti cannon built on Reanimated (UI thread, works on iOS / Android / web — no extra native module).
 * Pieces launch from the bottom centre, fan out, then fall with a slight drift and spin.
 * Renders nothing until fired; pointerEvents none so it never blocks the content below.
 */
function Confetti({ shot, width, height, count = 36 }: ConfettiProps) {
  const pieces = useMemo(() => {
    // Deterministic per shot so re-renders don't reshuffle a running burst.
    let seed = shot * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: count }, (_, i) => ({
      key: `${shot}-${i}`,
      color: COLORS[i % COLORS.length],
      // Launch direction: −70°…+70° from vertical.
      angle: (rnd() - 0.5) * 2.4,
      power: 0.55 + rnd() * 0.45,
      drift: (rnd() - 0.5) * 60,
      spin: (rnd() - 0.5) * 1080,
      w: 6 + Math.round(rnd() * 5),
      h: 9 + Math.round(rnd() * 6),
      delay: Math.round(rnd() * 120),
      round: i % 4 === 0,
    }));
  }, [shot, count]);

  if (!shot || width <= 0 || height <= 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(({ key, ...p }) => (
        <Piece key={key} {...p} width={width} height={height} />
      ))}
    </View>
  );
}

interface PieceProps {
  color: string;
  angle: number;
  power: number;
  drift: number;
  spin: number;
  w: number;
  h: number;
  delay: number;
  round: boolean;
  width: number;
  height: number;
}

function Piece({ color, angle, power, drift, spin, w, h, delay, round, width, height }: PieceProps) {
  const up = useSharedValue(0); // 0 → 1: flight to the peak
  const fall = useSharedValue(0); // 0 → 1: fall from the peak

  useEffect(() => {
    up.value = withDelay(delay, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    fall.value = withDelay(delay + 520, withTiming(1, { duration: 1500, easing: Easing.in(Easing.quad) }));
  }, [up, fall, delay]);

  const peakX = Math.sin(angle) * width * 0.55 * power;
  const peakY = -Math.cos(angle) * height * 0.85 * power;

  const style = useAnimatedStyle(() => {
    const x = peakX * up.value + drift * fall.value;
    // Rise to the peak, then fall back past the launch point (out of the area).
    const y = peakY * up.value + (-peakY + 60) * fall.value;
    return {
      opacity: fall.value > 0.85 ? (1 - fall.value) / 0.15 : 1,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${spin * (up.value + fall.value) * 0.5}deg` }],
    };
  });

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: width / 2 - w / 2, top: height - 10, width: w, height: round ? w : h, borderRadius: round ? w / 2 : 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

export default memo(Confetti);
