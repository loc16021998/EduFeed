import { RefreshCw } from 'lucide-react-native';
import { Platform, Text, View } from 'react-native';

import { ENV } from '@/config/env';
import { buildLabel, ota } from '@/services/updateService';
import { useUpdateStore } from '@/store/useUpdateStore';
import { COLORS } from '@/utils/constants';

import Button from './Button';

const PLATFORM = { web: 'Web', android: 'Android', ios: 'iOS' } as Record<string, string>;

/**
 * Version info for support calls ("ba mẹ đọc giúp em dòng phiên bản") + manual update check.
 * Shown in "Dữ liệu & bộ nhớ" (parents) and the staff home (teachers).
 */
export default function AppVersionFooter() {
  const checking = useUpdateStore((s) => s.checking);
  const lastCheckAt = useUpdateStore((s) => s.lastCheckAt);
  const otaState = useUpdateStore((s) => s.ota);
  const gate = useUpdateStore((s) => s.gate);
  const check = useUpdateStore((s) => s.check);
  const applyOta = useUpdateStore((s) => s.applyOta);

  const status = checking
    ? 'Đang kiểm tra…'
    : !lastCheckAt
      ? null
      : gate.kind !== 'none'
        ? `Có phiên bản ${gate.latestVersion} trên cửa hàng ứng dụng`
        : otaState?.status === 'ready'
          ? 'Có bản cập nhật mới — bấm "Áp dụng" để khởi động lại'
          : otaState?.status === 'error'
            ? 'Chưa kiểm tra được (mất mạng?). Thử lại sau.'
            : 'Bạn đang dùng phiên bản mới nhất ✓';

  return (
    <View className="gap-2.5 rounded-3xl bg-white p-4" testID="app-version">
      <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Text className="text-[14px] font-bold text-ink">TH EDU Companion</Text>
        <Text selectable className="text-xs text-ink-muted" testID="version-label">
          {buildLabel()}
        </Text>
      </View>
      <Text className="text-xs text-ink-subtle">
        {PLATFORM[Platform.OS] ?? Platform.OS} · kênh {ota.channel}
        {ENV.appEnv !== 'production' ? ' · bản thử nghiệm' : ''}
      </Text>
      {!!status && (
        <Text className="text-[13px] leading-[19px] text-ink" accessibilityLiveRegion="polite" testID="update-status">
          {status}
        </Text>
      )}
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          title="Kiểm tra cập nhật"
          variant="outline"
          size="sm"
          loading={checking}
          icon={<RefreshCw size={15} color={COLORS.brand} />}
          onPress={() => check({ force: true })}
          testID="check-updates"
        />
        {otaState?.status === 'ready' && <Button className="flex-1" title="Áp dụng" size="sm" onPress={applyOta} testID="apply-ota-footer" />}
      </View>
    </View>
  );
}
