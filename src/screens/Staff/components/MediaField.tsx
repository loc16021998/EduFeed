import { Film, ImagePlus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import VideoPlayer from '@/components/media/VideoPlayer';
import type { PickedMedia } from '@/types';
import { COLORS } from '@/utils/constants';

interface MediaFieldProps {
  kind: 'video' | 'image';
  /** Text of the empty picker (default: "Chọn video" / "Chọn ảnh bìa"). */
  pickLabel?: string;
  label: string;
  hint: string;
  /** Newly picked file (takes precedence over `existingUri`). */
  media?: PickedMedia;
  /** Already-published file when editing. */
  existingUri?: string;
  onPick: () => void;
  error?: string;
  /** Extra action next to the pick button, e.g. "Lấy ảnh từ video". */
  extra?: ReactNode;
}

const mb = (bytes: number) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');
const duration = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

export default function MediaField({ kind, pickLabel, label, hint, media, existingUri, onPick, error, extra }: MediaFieldProps) {
  const uri = media?.uri ?? existingUri;
  const Icon = kind === 'video' ? Film : ImagePlus;

  return (
    <View className="gap-2">
      <Text className="text-[13px] font-semibold text-ink-muted">{label}</Text>

      {uri ? (
        <View className="overflow-hidden rounded-2xl bg-slate-900" style={{ height: kind === 'video' ? 220 : 180 }}>
          {kind === 'video' ? (
            <VideoPlayer uri={uri} paused controls resizeMode="contain" style={{ flex: 1 }} />
          ) : (
            <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel="Ảnh bìa" />
          )}
        </View>
      ) : (
        <Pressable
          onPress={onPick}
          accessibilityRole="button"
          className={`items-center gap-2 rounded-2xl border-2 border-dashed bg-white py-8 active:bg-slate-50 ${
            error ? 'border-red-300' : 'border-slate-300'
          }`}
        >
          <Icon size={30} color={COLORS.brand} />
          <Text className="text-[14px] font-bold text-brand-600">{pickLabel ?? (kind === 'video' ? 'Chọn video' : 'Chọn ảnh bìa')}</Text>
          <Text className="px-6 text-center text-xs text-ink-subtle">{hint}</Text>
        </Pressable>
      )}

      {(uri || extra) && (
        <View className="flex-row flex-wrap items-center gap-2">
          {uri && (
            <Pressable onPress={onPick} accessibilityRole="button" className="rounded-full border border-slate-300 px-3 py-1.5 active:bg-slate-100">
              <Text className="text-xs font-semibold text-ink">{kind === 'video' ? 'Đổi video' : 'Đổi ảnh'}</Text>
            </Pressable>
          )}
          {extra}
          {media && (
            <Text className="text-xs text-ink-subtle" numberOfLines={1}>
              {[media.name, mb(media.size), duration(media.durationSec)].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      )}
      {!!error && <Text className="text-xs text-red-500">{error}</Text>}
    </View>
  );
}
