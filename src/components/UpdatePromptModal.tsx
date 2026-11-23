import { Download, ShieldAlert, Sparkles } from 'lucide-react-native';
import { Linking, Modal, Pressable, Text, View } from 'react-native';

import { ENV, hasHotline } from '@/config/env';
import type { StoreGate } from '@/services/updateService';
import { COLORS } from '@/utils/constants';

import Button from './Button';

export interface UpdatePromptModalProps {
  gate: StoreGate;
  /** Soft prompt only. */
  onLater: () => void;
}

const openStore = (url: string) => Linking.openURL(url).catch(() => {});

/**
 * Store version gate UI.
 *  - force: blocking (no close, back button ignored) — the installed version is below the minimum the
 *    server supports. One clear action: open the store. A call button helps when the store will not open.
 *  - soft: release highlights + "Cập nhật trên Store" / "Để sau" (remembered for this version).
 */
export default function UpdatePromptModal({ gate, onLater }: UpdatePromptModalProps) {
  if (gate.kind === 'none') return null;
  const force = gate.kind === 'force';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={force ? () => {} : onLater} statusBarTranslucent>
      <View className={`flex-1 bg-black/50 px-5 ${force ? 'justify-center' : 'justify-end pb-6'}`}>
        <View className="gap-3 rounded-[28px] bg-white p-6" testID={force ? 'force-update' : 'soft-update'} accessibilityViewIsModal>
          <View className={`h-14 w-14 items-center justify-center rounded-2xl ${force ? 'bg-amber-50' : 'bg-brand-50'}`}>
            {force ? <ShieldAlert size={28} color="#B45309" /> : <Sparkles size={28} color={COLORS.brand} />}
          </View>
          <Text className="text-[20px] font-extrabold leading-7 text-ink" accessibilityRole="header">
            {force ? 'Cần cập nhật ứng dụng' : `Đã có phiên bản mới ${gate.latestVersion}`}
          </Text>
          <Text className="text-[15px] leading-[22px] text-ink-muted">
            {force
              ? `Phiên bản ${ENV.appVersion} trên máy đã cũ và không còn tương thích với hệ thống của TH EDU. Ba mẹ / thầy cô vui lòng cập nhật lên ${gate.latestVersion} để tiếp tục dùng sổ liên lạc, lịch học và học phí.`
              : 'Cập nhật để dùng các tính năng mới và chạy mượt hơn. Chỉ mất khoảng 1 phút.'}
          </Text>
          {!!gate.notes && (
            <View className="gap-1 rounded-2xl bg-surface p-3.5" testID="release-notes">
              <Text className="text-xs font-bold uppercase tracking-wide text-leaf-700">Có gì mới</Text>
              <Text className="text-[14px] leading-[21px] text-ink">{gate.notes}</Text>
            </View>
          )}
          <Button
            title={force ? 'Cập nhật ngay' : 'Cập nhật trên Store'}
            size="lg"
            icon={<Download size={18} color="#fff" />}
            onPress={() => openStore(gate.storeUrl)}
            testID="open-store"
          />
          {force ? (
            hasHotline && (
              <Pressable onPress={() => Linking.openURL(`tel:${ENV.hotline}`).catch(() => {})} accessibilityRole="button" className="min-h-12 items-center justify-center">
                <Text className="text-[14px] font-semibold text-brand-600">Không cập nhật được? Gọi trung tâm</Text>
              </Pressable>
            )
          ) : (
            <Button title="Để sau" variant="ghost" onPress={onLater} testID="update-later" />
          )}
        </View>
      </View>
    </Modal>
  );
}
