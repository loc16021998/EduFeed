import { Check } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface SuccessBurstProps {
  size?: number;
  color?: string;
}

const CONFETTI_COLORS = ['#F97316', '#2F6BFF', '#EC4899', '#F59E0B', '#8B5CF6', '#10B981'];
const PARTICLES = 14;

/** Celebratory check: circle pops in, tick follows, a ring pulses and confetti bursts outward. */
export default function SuccessBurst({ size = 96, color = '#10B981' }: SuccessBurstProps) {
  const circle = useSharedValue(0);
  const tick = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    circle.value = withSpring(1, { damping: 11, stiffness: 160 });
    tick.value = withDelay(220, withSpring(1, { damping: 12 }));
    ring.value = withDelay(180, withRepeat(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }), 2, false));
  }, [circle, tick, ring]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: circle.value }] }));
  const tickStyle = useAnimatedStyle(() => ({ opacity: tick.value, transform: [{ scale: 0.4 + tick.value * 0.6 }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 0.9 }],
  }));

  const box = size * 2.4;

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Thành công">
      <Animated.View
        style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ringStyle]}
      />
      {Array.from({ length: PARTICLES }, (_, i) => (
        <Particle key={i} index={i} radius={size * (0.85 + (i % 3) * 0.15)} />
      ))}
      <Animated.View
        style={[
          styles.center,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          circleStyle,
        ]}
      >
        <Animated.View style={tickStyle}>
          <Check size={size * 0.55} color="#fff" strokeWidth={3.5} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function Particle({ index, radius }: { index: number; radius: number }) {
  const t = useSharedValue(0);
  const angle = (index / PARTICLES) * Math.PI * 2;
  const dot = index % 2 ? 8 : 6;

  useEffect(() => {
    t.value = withDelay(160 + (index % 4) * 40, withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) }));
  }, [t, index]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : (1 - t.value) / 0.3,
    transform: [
      { translateX: Math.cos(angle) * radius * t.value },
      { translateY: Math.sin(angle) * radius * t.value },
      { scale: 1 - t.value * 0.4 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: dot, height: dot, borderRadius: index % 3 ? dot / 2 : 2, backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length] },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
