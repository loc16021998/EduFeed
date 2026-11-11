import { Pencil, Share2, Trash2, TrendingUp } from 'lucide-react-native';
import { memo } from 'react';
import { Image, Pressable, Switch, Text, View } from 'react-native';

import { Badge } from '@/components';
import type { AdminVideo } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';

interface Props {
  video: AdminVideo;
  onEdit: (v: AdminVideo) => void;
  onShare: (v: AdminVideo) => void;
  onTogglePublished: (v: AdminVideo) => void;
  onDelete: (v: AdminVideo) => void;
}

function AdminVideoRow({ video, onEdit, onShare, onTogglePublished, onDelete }: Props) {
  return (
    <View className="gap-3 rounded-3xl bg-white p-3">
      <View className="flex-row gap-3">
        <Image
          source={{ uri: video.thumbnailUrl }}
          style={{ width: 80, height: 112, borderRadius: 12, backgroundColor: '#E2E8F0' }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <View className="flex-1 gap-1.5">
          <Text className="text-[14px] font-bold leading-5 text-ink" numberOfLines={2}>
            {video.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Badge label={CATEGORY_LABELS[video.category]} color={CATEGORY_COLORS[video.category]} />
            <View className={`rounded-full px-2 py-0.5 ${video.isPublished ? 'bg-emerald-100' : 'bg-slate-200'}`}>
              <Text className={`text-[11px] font-bold ${video.isPublished ? 'text-emerald-700' : 'text-ink-muted'}`}>
                {video.isPublished ? 'Đang hiển thị' : 'Bản nháp'}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <TrendingUp size={13} color={video.leadCount ? '#059669' : COLORS.subtle} />
            <Text className={`text-xs ${video.leadCount ? 'font-bold text-emerald-700' : 'text-ink-subtle'}`}>
              {video.leadCount} lượt đăng ký học thử từ video
            </Text>
          </View>
          <Text className="text-[11px] text-ink-subtle">
            {video.teacherName} · {new Date(video.publishedAt).toLocaleDateString('vi-VN')}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-1 border-t border-slate-100 pt-2">
        <View className="flex-1 flex-row items-center gap-2">
          <Switch
            value={video.isPublished}
            onValueChange={() => onTogglePublished(video)}
            trackColor={{ true: '#86EFAC', false: '#CBD5E1' }}
            thumbColor={video.isPublished ? '#059669' : '#F8FAFC'}
            accessibilityLabel={video.isPublished ? 'Ẩn video khỏi EduFeed' : 'Hiển thị video trên EduFeed'}
          />
          <Text className="text-xs text-ink-muted">{video.isPublished ? 'Hiển thị' : 'Đang ẩn'}</Text>
        </View>
        <RowButton label="Chia sẻ" onPress={() => onShare(video)} disabled={!video.isPublished}>
          <Share2 size={16} color={video.isPublished ? COLORS.brand : COLORS.subtle} />
        </RowButton>
        <RowButton label="Sửa" onPress={() => onEdit(video)}>
          <Pencil size={16} color={COLORS.ink} />
        </RowButton>
        <RowButton label="Xóa" onPress={() => onDelete(video)}>
          <Trash2 size={16} color="#DC2626" />
        </RowButton>
      </View>
    </View>
  );
}

function RowButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-1 rounded-full px-2.5 py-1.5 active:bg-slate-100 ${disabled ? 'opacity-40' : ''}`}
    >
      {children}
      <Text className="text-xs font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export default memo(AdminVideoRow);
