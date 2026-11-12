import { ChevronsLeftRight } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/utils/haptics';

import Confetti from './Confetti';
import Skeleton from './Skeleton';

export interface InteractiveSliderProps {
  beforeUri: string;
  afterUri: string;
  /** Top-left overlay, e.g. "Nét chữ cũ". */
  beforeLabel?: string;
  /** Top-right overlay, e.g. "Nét chữ chuẩn nét thanh nét đậm". */
  afterLabel?: string;
  /** Bottom-left caption, e.g. "TRƯỚC KHI HỌC · Ngày 1". */
  beforeCaption?: string;
  /** Bottom-right caption, e.g. "SAU 2 THÁNG · Hiện tại". */
  afterCaption?: string;
  /** Height ÷ width. Defaults to 4:3 portrait. */
  aspectRatio?: number;
  /** 0 → all "after", 1 → all "before". */
  initialPosition?: number;
  /** Nudge the handle once on mount / image change to teach the gesture. */
  showHint?: boolean;
  /** Called once per image pair when the parent drags all the way to the "after" image. */
  onFullReveal?: () => void;
  /** Confetti + success haptic on full reveal (default true). */
  celebrate?: boolean;
}

const HANDLE = 44;
const SPRING = { damping: 20, stiffness: 220 };
/** Handle position at or below which the "after" image counts as fully revealed. */
const REVEALED = 0.04;
/** How far a fling carries the handle (seconds of velocity). */
const FLING = 0.18;

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

/**
 * Drag (or tap) to reveal the "after" image beneath the "before" image.
 *  - Runs on the UI thread via Gesture Handler + Reanimated, so dragging stays at 60fps.
 *  - Physics: a fling keeps travelling with its velocity and settles with a spring.
 *  - Haptics: a light tick at 25 / 50 / 75 %, a success buzz on full reveal (native only).
 *  - Full reveal of the "after" image → confetti + onFullReveal(), once per image pair.
 *  - A skeleton covers the frame until both images have loaded (no blank flash / layout shift).
 * Horizontal-only activation lets the parent ScrollView keep vertical scrolling.
 */
export default function InteractiveSlider({
  beforeUri,
  afterUri,
  beforeLabel = 'TRƯỚC',
  afterLabel = 'SAU',
  beforeCaption,
  afterCaption,
  aspectRatio = 4 / 3,
  initialPosition = 0.5,
  showHint = true,
  onFullReveal,
  celebrate = true,
}: InteractiveSliderProps) {
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const pos = useSharedValue(initialPosition);
  const dragStart = useSharedValue(0);
  const bucket = useSharedValue(Math.floor(initialPosition * 4));
  const revealed = useSharedValue(false);
  const [loaded, setLoaded] = useState(0);
  const [shot, setShot] = useState(0);
  const ready = width > 0;

  const onRevealJS = useCallback(() => {
    if (celebrate) {
      haptics.success();
      setShot((n) => n + 1);
    }
    onFullReveal?.();
  }, [celebrate, onFullReveal]);
  const tickJS = useCallback(() => haptics.light(), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    w.value = next;
    setWidth(next);
  };

  // New pair of images → wait for them to load again, allow a new celebration.
  useEffect(() => {
    setLoaded(0);
    revealed.value = false;
  }, [beforeUri, afterUri, revealed]);

  // Reset (and optionally demo the gesture) whenever a new pair of images is shown.
  useEffect(() => {
    if (!ready) return;
    pos.value = initialPosition;
    bucket.value = Math.floor(initialPosition * 4);
    if (showHint) {
      pos.value = withDelay(
        350,
        withSequence(
          withTiming(0.7, { duration: 420 }),
          withTiming(0.3, { duration: 560 }),
          withSpring(initialPosition, SPRING),
        ),
      );
    }
  }, [beforeUri, afterUri, ready, initialPosition, showHint, pos, bucket]);

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart(() => {
      dragStart.value = pos.value;
    })
    .onUpdate((e) => {
      if (w.value <= 0) return;
      const next = clamp01(dragStart.value + e.translationX / w.value);
      pos.value = next;
      // Light tick each time the handle crosses a quarter mark.
      const b = Math.min(3, Math.floor(next * 4));
      if (b !== bucket.value) {
        bucket.value = b;
        runOnJS(tickJS)();
      }
      if (next <= REVEALED && !revealed.value) {
        revealed.value = true;
        runOnJS(onRevealJS)();
      }
    })
    .onEnd((e) => {
      if (w.value <= 0) return;
      // Fling: carry on with the release velocity, then settle with a spring.
      const v = e.velocityX / w.value;
      let target = clamp01(pos.value + v * FLING);
      if (target <= REVEALED) target = 0;
      pos.value = withSpring(target, { ...SPRING, velocity: v });
      if (target <= REVEALED && !revealed.value) {
        revealed.value = true;
        runOnJS(onRevealJS)();
      }
    });

  const tap = Gesture.Tap().onEnd((e) => {
    if (w.value <= 0) return;
    const target = clamp01(e.x / w.value);
    pos.value = withSpring(target, SPRING);
    if (target <= REVEALED && !revealed.value) {
      revealed.value = true;
      runOnJS(onRevealJS)();
    }
  });

  const gesture = Gesture.Race(pan, tap);

  const clipStyle = useAnimatedStyle(() => ({ width: pos.value * w.value }));
  const dividerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * w.value - 1.5 }],
  }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * w.value - HANDLE / 2 }],
  }));
  // Fade each label out as its image gets covered.
  const beforeLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pos.value, [0.12, 0.3], [0, 1], Extrapolation.CLAMP),
  }));
  const afterLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pos.value, [0.7, 0.88], [1, 0], Extrapolation.CLAMP),
  }));

  const height = width * aspectRatio;

  const nudge = (delta: number) => {
    const target = clamp01(pos.value + delta);
    pos.value = withSpring(target, SPRING);
    if (target <= REVEALED && !revealed.value) {
      revealed.value = true;
      onRevealJS();
    }
  };
  const onImage = () => setLoaded((n) => n + 1);

  return (
    <View
      onLayout={onLayout}
      className="w-full overflow-hidden rounded-3xl bg-slate-200"
      style={{ height: ready ? height : undefined, aspectRatio: ready ? undefined : 1 / aspectRatio }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`So sánh ảnh: ${beforeLabel} và ${afterLabel}`}
      accessibilityHint="Vuốt lên hoặc xuống để xem thêm ảnh trước hoặc ảnh sau"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 0.2 : -0.2)}
    >
      {ready && (
        <GestureDetector gesture={gesture}>
          <Animated.View style={StyleSheet.absoluteFill}>
            {/* After = full background */}
            <Image source={{ uri: afterUri }} style={{ width, height }} resizeMode="cover" onLoad={onImage} onError={onImage} />

            {/* Before = clipped from the left up to the handle */}
            <Animated.View style={[styles.clip, { height }, clipStyle]}>
              <Image source={{ uri: beforeUri }} style={{ width, height }} resizeMode="cover" onLoad={onImage} onError={onImage} />
            </Animated.View>

            {/* Top labels */}
            <Animated.View pointerEvents="none" style={[styles.labelLeft, beforeLabelStyle]}>
              <View className="rounded-xl bg-black/65 px-2.5 py-1.5">
                <Text className="text-[11px] font-bold text-white">{beforeLabel}</Text>
              </View>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.labelRight, afterLabelStyle]}>
              <View className="rounded-xl bg-brand-500 px-2.5 py-1.5">
                <Text className="text-right text-[11px] font-bold text-white">{afterLabel}</Text>
              </View>
            </Animated.View>

            {/* Bottom captions */}
            {!!beforeCaption && (
              <Animated.View pointerEvents="none" style={[styles.captionLeft, beforeLabelStyle]}>
                <Text className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-ink">
                  {beforeCaption}
                </Text>
              </Animated.View>
            )}
            {!!afterCaption && (
              <Animated.View pointerEvents="none" style={[styles.captionRight, afterLabelStyle]}>
                <Text className="rounded-full bg-accent-500 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-white">
                  {afterCaption}
                </Text>
              </Animated.View>
            )}

            {/* Divider + handle */}
            <Animated.View pointerEvents="none" style={[styles.divider, { height }, dividerStyle]} />
            <Animated.View pointerEvents="none" style={[styles.handle, { top: height / 2 - HANDLE / 2 }, handleStyle]}>
              <ChevronsLeftRight size={22} color="#1A44B3" strokeWidth={2.5} />
            </Animated.View>

            {/* Until both images are in: same-size skeleton (no blank frame, no layout shift). */}
            {loaded < 2 && (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <Skeleton width={width} height={height} radius={0} />
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      )}
      {ready && <Confetti shot={shot} width={width} height={height} />}
    </View>
  );
}

// Animated views use StyleSheet (not className) so Reanimated owns their transforms.
const styles = StyleSheet.create({
  clip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  divider: { position: 'absolute', top: 0, left: 0, width: 3, backgroundColor: '#fff' },
  handle: {
    position: 'absolute',
    left: 0,
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  labelLeft: { position: 'absolute', top: 12, left: 12, maxWidth: '46%' },
  labelRight: { position: 'absolute', top: 12, right: 12, maxWidth: '46%', alignItems: 'flex-end' },
  captionLeft: { position: 'absolute', bottom: 12, left: 12 },
  captionRight: { position: 'absolute', bottom: 12, right: 12 },
});
