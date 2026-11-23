/**
 * Update host — mount once at the app root. Shows, in priority order:
 *   1. store force update (blocking)          — UpdatePromptModal
 *   2. critical OTA hotfix (asks to reload)    — modal, "Nhắc lại sau 5 phút" lets a parent finish a form
 *   3. store soft update (dismissible)         — UpdatePromptModal
 *   4. regular OTA ready                       — small bottom banner, 1 tap "Cập nhật ngay"
 */
import { RefreshCw, X, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppUpdates } from '@/hooks/useAppUpdates';
import { useUpdateStore } from '@/store/useUpdateStore';
import { COLORS } from '@/utils/constants';

import Button from './Button';
import UpdatePromptModal from './UpdatePromptModal';

const SNOOZE_MS = 5 * 60_000;

export default function AppUpdates() {
  useAppUpdates();
  const insets = useSafeAreaInsets();
  const gate = useUpdateStore((s) => s.gate);
  const otaState = useUpdateStore((s) => s.ota);
  const bannerHidden = useUpdateStore((s) => s.otaBannerHidden);
  const { dismissSoft, hideOtaBanner, applyOta } = useUpdateStore.getState();
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [, tick] = useState(0);

  // Re-show a snoozed critical prompt when the snooze ends.
  useEffect(() => {
    if (!snoozedUntil) return undefined;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(0, snoozedUntil - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [snoozedUntil]);

  if (gate.kind === 'force') return <UpdatePromptModal gate={gate} onLater={() => {}} />;

  const ready = otaState?.status === 'ready' ? otaState : null;
  if (ready?.critical && Date.now() >= snoozedUntil) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}>
        <View className="flex-1 justify-center bg-black/50 px-5">
          <View className="gap-3 rounded-[28px] bg-white p-6" testID="critical-update">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
              <Zap size={28} color="#B45309" />
            </View>
            <Text className="text-[20px] font-extrabold leading-7 text-ink" accessibilityRole="header">
              Bản sửa lỗi quan trọng
            </Text>
            <Text className="text-[15px] leading-[22px] text-ink-muted">
              {ready.notes || 'TH EDU vừa sửa một lỗi quan trọng. Khởi động lại để dùng bản an toàn nhất — chỉ mất vài giây, dữ liệu vẫn được giữ nguyên.'}
            </Text>
            <Button title="Cập nhật ngay" size="lg" icon={<RefreshCw size={18} color="#fff" />} onPress={applyOta} testID="apply-critical" />
            <Button title="Nhắc lại sau 5 phút" variant="ghost" onPress={() => setSnoozedUntil(Date.now() + SNOOZE_MS)} testID="snooze-critical" />
          </View>
        </View>
      </Modal>
    );
  }

  if (gate.kind === 'soft') return <UpdatePromptModal gate={gate} onLater={dismissSoft} />;

  if (ready && !ready.critical && !bannerHidden) {
    return (
      <View pointerEvents="box-none" className="absolute left-0 right-0 px-3" style={{ bottom: insets.bottom + 72 }}>
        <View
          className="flex-row items-center gap-3 rounded-2xl bg-slate-900 py-2 pl-4 pr-2"
          style={{ shadowColor: '#0F172A', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
          accessibilityLiveRegion="polite"
          testID="ota-banner"
        >
          <View className="flex-1">
            <Text className="text-[14px] font-bold leading-5 text-white">Bản cập nhật mới đã sẵn sàng</Text>
            <Text className="text-xs leading-[17px] text-white/75" numberOfLines={2}>
              {ready.notes ? `${ready.notes} · ` : ''}Khởi động lại để áp dụng
            </Text>
          </View>
          <Pressable onPress={applyOta} accessibilityRole="button" className="min-h-12 justify-center rounded-xl bg-brand-500 px-3.5 active:bg-brand-600" testID="apply-ota">
            <Text className="text-[14px] font-extrabold text-white">Cập nhật ngay</Text>
          </Pressable>
          <Pressable onPress={hideOtaBanner} accessibilityRole="button" accessibilityLabel="Ẩn thông báo cập nhật" hitSlop={8} className="h-12 w-8 items-center justify-center" testID="hide-ota">
            <X size={18} color={COLORS.subtle} />
          </Pressable>
        </View>
      </View>
    );
  }
  return null;
}
