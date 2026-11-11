import { ChevronsLeftRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export interface BeforeAfterSliderProps {
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
}

const HANDLE = 44;
const SPRING = { damping: 20, stiffness: 220 };

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

/**
 * Drag (or tap) to reveal the "after" image beneath the "before" image.
 * Runs entirely on the UI thread via Gesture Handler + Reanimated, so dragging stays at 60fps.
 * Horizontal-only activation lets the parent ScrollView keep vertical scrolling.
 */
export default function BeforeAfterSlider({
  beforeUri,
  afterUri,
  beforeLabel = 'TRƯỚC',
  afterLabel = 'SAU',
  beforeCaption,
  afterCaption,
  aspectRatio = 4 / 3,
  initialPosition = 0.5,
  showHint = true,
}: BeforeAfterSliderProps) {
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);
  const pos = useSharedValue(initialPosition);
  const dragStart = useSharedValue(0);
  const ready = width > 0;

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    w.value = next;
    setWidth(next);
  };

  // Reset (and optionally demo the gesture) whenever a new pair of images is shown.
  useEffect(() => {
    if (!ready) return;
    pos.value = initialPosition;
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
  }, [beforeUri, afterUri, ready, initialPosition, showHint, pos]);

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart(() => {
      dragStart.value = pos.value;
    })
    .onUpdate((e) => {
      if (w.value > 0) pos.value = clamp01(dragStart.value + e.translationX / w.value);
    });

  const tap = Gesture.Tap().onEnd((e) => {
    if (w.value > 0) pos.value = withSpring(clamp01(e.x / w.value), SPRING);
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
    pos.value = withSpring(clamp01(pos.value + delta), SPRING);
  };

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
            <Image source={{ uri: afterUri }} style={{ width, height }} resizeMode="cover" />

            {/* Before = clipped from the left up to the handle */}
            <Animated.View style={[styles.clip, { height }, clipStyle]}>
              <Image source={{ uri: beforeUri }} style={{ width, height }} resizeMode="cover" />
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
          </Animated.View>
        </GestureDetector>
      )}
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
