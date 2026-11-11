import { CloudUpload } from 'lucide-react-native';
import { Modal, Text, View } from 'react-native';

import type { UploadProgress } from '@/services/videoAdmin';
import { COLORS } from '@/utils/constants';

const STAGE_LABEL: Record<UploadProgress['stage'], string> = {
  video: 'Đang tải video lên…',
  thumbnail: 'Đang tải ảnh bìa…',
  saving: 'Đang lưu bài đăng…',
};

/** Blocking progress dialog while files upload — leaving mid-upload would lose the post. */
export default function UploadProgressModal({ visible, progress }: { visible: boolean; progress: UploadProgress | null }) {
  const pct = Math.round((progress?.fraction ?? 0) * 100);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/45 px-8">
        <View className="w-full max-w-[340px] items-center gap-3 rounded-3xl bg-white p-6" accessibilityLiveRegion="polite">
          <CloudUpload size={36} color={COLORS.brand} />
          <Text className="text-[16px] font-bold text-ink">{STAGE_LABEL[progress?.stage ?? 'video']}</Text>
          <View className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          </View>
          <Text className="text-[13px] font-semibold text-brand-600">{pct}%</Text>
          <Text className="text-center text-xs text-ink-subtle">Giữ ứng dụng mở cho đến khi tải xong.</Text>
        </View>
      </View>
    </Modal>
  );
}
