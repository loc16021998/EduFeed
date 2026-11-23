import { Heart, Maximize2, MessageCircle, Share2 } from 'lucide-react-native';
import { memo, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { formatCount } from '@/services/videoSocial';
import { haptics } from '@/utils/haptics';

export const HEART_ON = '#FF4D6D';

interface Props {
  liked: boolean;
  likes: number;
  comments: number;
  shares: number;
  onLike?: () => void;
  onComments?: () => void;
  /** Omit to hide the share button (no public link for this video). */
  onShare?: () => void;
  /** Optional full-screen button at the bottom of the rail. */
  onExpand?: () => void;
  testID?: string;
}

/**
 * Right-hand action rail on an EduFeed card: ♥ (pop + haptic), 💬 (opens the comments sheet), share.
 * Each target is 48×48 with its count underneath; white icons on a dark disc read on any video frame.
 */
function VideoActionRail({ liked, likes, comments, shares, onLike, onComments, onShare, onExpand, testID = 'action-rail' }: Props) {
  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Pop on every change (also when a double-tap liked it), a softer dip when un-liking.
    scale.value = liked ? withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 260 })) : withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, { damping: 10 }));
  }, [liked, scale]);
  const heart = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View pointerEvents="box-none" className="items-center gap-1.5" testID={testID}>
      <RailButton
        label={liked ? 'Bỏ thích' : 'Thích'}
        count={likes}
        selected={liked}
        onPress={
          onLike &&
          (() => {
            haptics.light();
            onLike();
          })
        }
        testID="rail-like"
      >
        <Animated.View style={heart}>
          <Heart size={28} color={liked ? HEART_ON : '#fff'} fill={liked ? HEART_ON : 'transparent'} strokeWidth={2.2} />
        </Animated.View>
      </RailButton>
      <RailButton label="Bình luận" count={comments} onPress={onComments} testID="rail-comments">
        <MessageCircle size={26} color="#fff" strokeWidth={2.2} />
      </RailButton>
      {onShare && (
        <RailButton label="Chia sẻ" count={shares} onPress={onShare} testID="rail-share">
          <Share2 size={25} color="#fff" strokeWidth={2.2} />
        </RailButton>
      )}
      {onExpand && (
        <Pressable onPress={onExpand} hitSlop={4} accessibilityRole="button" accessibilityLabel="Xem toàn màn hình" className="h-12 w-12 items-center justify-center rounded-full bg-black/30 active:bg-black/50" testID="feed-expand">
          <Maximize2 size={21} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

function RailButton({ label, count, selected, onPress, children, testID }: { label: string; count: number; selected?: boolean; onPress?: () => void; children: React.ReactNode; testID: string }) {
  return (
    <View className="items-center">
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${count}`}
        accessibilityState={selected === undefined ? undefined : { selected }}
        aria-selected={selected}
        className="h-12 w-12 items-center justify-center rounded-full bg-black/30 active:bg-black/50"
        testID={testID}
      >
        {children}
      </Pressable>
      <Text className="mt-0.5 text-[12px] font-bold text-white" style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 }} testID={`${testID}-count`}>
        {formatCount(count)}
      </Text>
    </View>
  );
}

export default memo(VideoActionRail);

/** Big heart that floats up where the parent double-tapped. */
export function FloatingHeart({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 750 });
    const id = setTimeout(onDone, 780);
    return () => clearTimeout(id);
  }, [t, onDone]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [{ translateY: -70 * t.value }, { scale: t.value < 0.25 ? 0.4 + t.value * 3.2 : 1.2 - (t.value - 0.25) * 0.3 }, { rotate: '-12deg' }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - 48, top: y - 48 }, style]} testID="floating-heart">
      <Heart size={96} color={HEART_ON} fill={HEART_ON} />
    </Animated.View>
  );
}
