import { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Placeholder block with a soft pulse, sized exactly like the content it stands in for,
 * so nothing jumps when the real content arrives. Hidden from screen readers.
 */
export default function Skeleton({ width = '100%', height = 16, radius = 10, style }: SkeletonProps) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(t);
  }, [t]);
  const pulse = useAnimatedStyle(() => ({ opacity: 0.55 + t.value * 0.45 }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: '#E2E8F0' }, pulse, style]}
    />
  );
}

const DARKER = { backgroundColor: '#CBD5E1' };

/** Feed card placeholder: same full-bleed 4:5 card as FeedVideoCard (teacher row on top, caption + CTA at the bottom). */
export function FeedCardSkeleton({ height }: { height: number }) {
  return (
    <View className="mx-4 mb-4 overflow-hidden rounded-3xl" style={{ height }} accessibilityLabel="Đang tải video">
      <Skeleton height={height} radius={0} />
      <View className="absolute left-3 right-3 top-3 flex-row items-center gap-2.5">
        <Skeleton width={40} height={40} radius={20} style={DARKER} />
        <View className="gap-1.5">
          <Skeleton width={120} height={12} style={DARKER} />
          <Skeleton width={80} height={10} style={DARKER} />
        </View>
      </View>
      <View className="absolute bottom-4 left-4 right-4 gap-2.5">
        <Skeleton width="85%" height={16} style={DARKER} />
        <Skeleton width="55%" height={12} style={DARKER} />
        <Skeleton height={48} radius={16} style={DARKER} />
      </View>
    </View>
  );
}

/** Portfolio placeholder: picker chips, before/after image, student card, teacher note. */
export function PortfolioSkeleton({ imageHeight }: { imageHeight: number }) {
  return (
    <View className="gap-4" accessibilityLabel="Đang tải nhật ký tiến bộ">
      <View className="flex-row gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={96} height={56} radius={16} />
        ))}
      </View>
      <Skeleton height={imageHeight} radius={24} />
      <View className="gap-2.5 rounded-3xl bg-white p-4">
        <Skeleton width="50%" height={16} />
        <Skeleton width="70%" height={12} />
        <Skeleton height={10} />
        <Skeleton width="85%" height={10} />
      </View>
    </View>
  );
}
