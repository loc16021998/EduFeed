import { BadgeCheck, Heart, Maximize2, Share2, Volume2, VolumeX } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components';
import Gradient from '@/components/media/Gradient';
import type { FeedItem } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/utils/constants';

import OptimizedVideoFeedItem from '@/components/OptimizedVideoFeedItem';
import { pickStreamUrl } from '@/utils/networkPolicy';

import CtaBar from './CtaBar';

interface FeedVideoCardProps {
  item: FeedItem;
  height: number;
  active: boolean;
  /** Next card on a fast unmetered link: buffer its video in the background. */
  warm?: boolean;
  /** false = Data Saver (tap to play). */
  autoplay?: boolean;
  /** Use the low-resolution stream when the video has one. */
  preferLowRes?: boolean;
  muted: boolean;
  liked: boolean;
  following: boolean;
  onToggleMute: () => void;
  onLike: (id: string) => void;
  onFollow: (teacherName: string) => void;
  onCta: (link: string, videoId?: string) => void;
  /** Omit to hide the share button (e.g. editor preview). */
  onShare?: (item: FeedItem) => void;
  /** Open the full-screen player. */
  onExpand?: (item: FeedItem) => void;
}

function FeedVideoCard({
  item,
  height,
  active,
  warm = false,
  autoplay = true,
  preferLowRes = false,
  muted,
  liked,
  following,
  onToggleMute,
  onLike,
  onFollow,
  onCta,
  onShare,
  onExpand,
}: FeedVideoCardProps) {
  return (
    <View style={{ height }} className="mx-4 mb-4 overflow-hidden rounded-3xl bg-slate-900">
      <OptimizedVideoFeedItem
        uri={pickStreamUrl(item, { preferLowRes })}
        posterUri={item.thumbnailUrl}
        mode={active ? 'active' : warm ? 'warm' : 'idle'}
        muted={muted}
        autoplay={autoplay}
        testID={active ? 'feed-video-active' : undefined}
      />

      {/* Scrims keep white text legible on any frame; they never block taps. */}
      <Gradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110 }}
      />
      <Gradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' }}
      />

      {/* ── Top overlay: teacher + follow + mute ── */}
      <View pointerEvents="box-none" className="absolute left-0 right-0 top-0 flex-row items-center gap-2.5 p-3">
        <View className="rounded-full border-2 border-white">
          <Avatar uri={item.teacherAvatar} name={item.teacherName} size={38} />
        </View>
        <View className="flex-shrink">
          <View className="flex-row items-center gap-1">
            <Text className="text-[15px] font-bold text-white" numberOfLines={1}>
              {item.teacherName}
            </Text>
            <BadgeCheck size={14} color="#60A5FA" fill="#fff" />
          </View>
          {/* Course: white text on a dark pill + a colour dot — readable on any video frame. */}
          <View className="mt-0.5 flex-row items-center gap-1 self-start rounded-full bg-black/35 px-2 py-0.5">
            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[item.category] }} />
            <Text className="text-[11px] font-semibold text-white">{CATEGORY_LABELS[item.category]}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => onFollow(item.teacherName)}
          accessibilityRole="button"
          accessibilityState={{ selected: following }}
          className={`ml-1 h-9 justify-center rounded-full px-3.5 ${following ? 'border border-white/70 bg-white/10' : 'bg-white'}`}
        >
          <Text className={`text-xs font-bold ${following ? 'text-white' : 'text-brand-600'}`}>
            {following ? 'Đang theo dõi' : '+ Theo dõi'}
          </Text>
        </Pressable>

        <View className="flex-1" />
        <Pressable
          onPress={onToggleMute}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Bật tiếng' : 'Tắt tiếng'}
          className="h-11 w-11 items-center justify-center rounded-full bg-black/40"
        >
          {muted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
        </Pressable>
      </View>

      {/* ── Bottom overlay: caption, hashtags, sticky CTA ── */}
      <View pointerEvents="box-none" className="absolute bottom-0 left-0 right-0 gap-3 p-3">
        <View pointerEvents="box-none" className="flex-row items-end gap-1">
          <Text className="mr-2 flex-1 text-base font-semibold leading-[22px] text-white" numberOfLines={3}>
            {item.title}
          </Text>
          <Pressable
            onPress={() => onLike(item.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Bỏ yêu thích' : 'Yêu thích'}
            className="h-11 w-11 items-center justify-center rounded-full bg-black/25 active:bg-black/40"
          >
            <Heart size={26} color={liked ? '#EF4444' : '#fff'} fill={liked ? '#EF4444' : 'transparent'} />
          </Pressable>
          {onShare && item.shareSlug && (
            <Pressable onPress={() => onShare(item)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Chia sẻ video" className="h-11 w-11 items-center justify-center rounded-full bg-black/25 active:bg-black/40">
              <Share2 size={23} color="#fff" />
            </Pressable>
          )}
          {onExpand && (
            <Pressable onPress={() => onExpand(item)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Xem toàn màn hình" testID="feed-expand" className="h-11 w-11 items-center justify-center rounded-full bg-black/25 active:bg-black/40">
              <Maximize2 size={22} color="#fff" />
            </Pressable>
          )}
        </View>

        <View pointerEvents="box-none" className="flex-row flex-wrap gap-1.5">
          {item.tags.map((t) => (
            <View key={t} className="rounded-full bg-white/20 px-2.5 py-1">
              <Text className="text-xs font-semibold text-white">{t}</Text>
            </View>
          ))}
        </View>

        <CtaBar text={item.ctaText} onPress={() => onCta(item.ctaLink, item.id)} pulse={active} />
      </View>
    </View>
  );
}

export default memo(FeedVideoCard);
