import { Play, Stamp } from 'lucide-react-native';
import { memo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components';
import type { Testimonial } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/utils/constants';

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

export const VideoTestimonialCard = memo(function VideoTestimonialCard({
  item,
  onPress,
}: {
  item: Testimonial;
  onPress: (t: Testimonial) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Xem video cảm nhận của ${item.parentLabel}`}
      className="w-40 overflow-hidden rounded-3xl bg-slate-900 active:opacity-90"
      style={{ aspectRatio: 9 / 15 }}
    >
      {!!item.thumbnailUrl && <Image source={{ uri: item.thumbnailUrl }} className="absolute inset-0" />}
      <View className="absolute inset-0 bg-black/25" />
      <View className="absolute left-0 right-0 top-[38%] items-center">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-white/90">
          <Play size={22} color="#1A44B3" fill="#1A44B3" />
        </View>
      </View>
      {!!item.durationSec && (
        <Text className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {fmtDuration(item.durationSec)}
        </Text>
      )}
      <View className="absolute bottom-0 left-0 right-0 gap-1 p-2.5">
        <Text className="text-[12px] font-bold text-white" numberOfLines={1}>
          {item.parentLabel}
        </Text>
        <Text className="text-[10px] font-semibold" style={{ color: '#FDE68A' }}>
          {CATEGORY_LABELS[item.course]}
        </Text>
      </View>
    </Pressable>
  );
});

export const LetterCard = memo(function LetterCard({ item, onPress }: { item: Testimonial; onPress: (t: Testimonial) => void }) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.kind === 'LETTER' ? 'Thư cảm ơn' : 'Vở của bé'} – ${item.parentLabel}`}
      className="flex-1 overflow-hidden rounded-3xl bg-white active:opacity-90"
    >
      <View>
        <Image source={{ uri: item.thumbnailUrl ?? item.mediaUrl }} className="aspect-[3/4] w-full bg-slate-100" />
        <View className="absolute left-2 top-2 flex-row items-center gap-1 rounded-full bg-white/90 px-2 py-1">
          <Stamp size={11} color="#B91C1C" />
          <Text className="text-[10px] font-bold text-red-700">{item.kind === 'LETTER' ? 'Thư tay' : 'Vở có dấu GV'}</Text>
        </View>
      </View>
      <View className="gap-1 p-2.5">
        <Badge label={CATEGORY_LABELS[item.course]} color={CATEGORY_COLORS[item.course]} />
        <Text className="text-[12px] font-semibold text-ink" numberOfLines={1}>
          {item.parentLabel}
        </Text>
        {!!item.quote && (
          <Text className="text-[11px] italic leading-4 text-ink-muted" numberOfLines={2}>
            “{item.quote}”
          </Text>
        )}
      </View>
    </Pressable>
  );
});
