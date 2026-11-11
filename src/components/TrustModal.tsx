import { CheckCircle2, ShieldCheck } from 'lucide-react-native';
import { useEffect } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { haptics } from '@/utils/haptics';

import Button from './Button';

interface TrustModalProps {
  visible: boolean;
  onClaim: () => void;
  onDismiss: () => void;
  title?: string;
  description?: string;
  /** What's inside the offer — must match what the centre actually sends. */
  highlights?: string[];
  claimLabel?: string;
}

const DEFAULTS = {
  title: 'Tặng ngay Bộ tài liệu "5 Bí quyết giúp con vững bước vào lớp 1" khi đặt lịch hôm nay!',
  description: 'Gửi qua Zalo ngay khi trung tâm xác nhận lịch. Ba mẹ chỉ cần hoàn tất vài thông tin còn lại.',
  highlights: [
    'Lịch sinh hoạt mẫu 2 tuần trước khai giảng',
    'Bài tập luyện cầm bút & nét cơ bản in sẵn',
    'Cách trò chuyện giúp con hết sợ đi học',
  ],
  claimLabel: 'Nhận quà & hoàn tất đăng ký',
};

/**
 * Gentle, one-time incentive modal. Guardrails: no countdown, no guilt-trip copy,
 * "Để sau" is always available and continues whatever the parent was doing.
 */
export default function TrustModal({
  visible,
  onClaim,
  onDismiss,
  title = DEFAULTS.title,
  description = DEFAULTS.description,
  highlights = DEFAULTS.highlights,
  claimLabel = DEFAULTS.claimLabel,
}: TrustModalProps) {
  useEffect(() => {
    if (visible) haptics.success();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} className="flex-1 items-center justify-center bg-black/45 px-6">
        <Pressable className="absolute inset-0" onPress={onDismiss} accessibilityLabel="Đóng" />
        {visible && (
          <Animated.View
            entering={ZoomIn.springify().damping(16)}
            className="w-full max-w-[380px] gap-4 rounded-3xl bg-white p-5"
            accessibilityViewIsModal
          >
            <View className="h-16 w-16 items-center justify-center self-center rounded-2xl bg-accent-100">
              <Text className="text-4xl">📘</Text>
            </View>

            <Text className="text-center text-[18px] font-extrabold leading-6 text-ink" accessibilityRole="header">
              🎁 {title}
            </Text>
            <Text className="text-center text-[13px] leading-5 text-ink-muted">{description}</Text>

            <View className="gap-2 rounded-2xl bg-surface p-3.5">
              {highlights.map((h) => (
                <View key={h} className="flex-row items-start gap-2">
                  <CheckCircle2 size={16} color="#10B981" />
                  <Text className="flex-1 text-[13px] leading-[18px] text-ink">{h}</Text>
                </View>
              ))}
            </View>

            <View className="gap-2">
              <Button title={claimLabel} variant="accent" size="lg" onPress={onClaim} />
              <Button title="Để sau" variant="ghost" onPress={onDismiss} />
            </View>

            <View className="flex-row items-center justify-center gap-1.5">
              <ShieldCheck size={12} color="#94A3B8" />
              <Text className="text-[11px] text-ink-subtle">Miễn phí · Không ràng buộc đăng ký khóa học</Text>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </Modal>
  );
}
