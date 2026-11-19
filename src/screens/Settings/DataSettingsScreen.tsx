import { Check, HardDrive, Signal, Wifi, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader } from '@/components';
import { StatusBanner } from '@/components/ux';
import type { RootStackScreenProps } from '@/navigation/types';
import { useMediaPolicy, useNetworkStore } from '@/store/networkStore';
import { COLORS } from '@/utils/constants';
import { clearMediaCache, formatBytes, getMediaCacheReport, type MediaCacheReport } from '@/utils/mediaCache';
import { EST_VIDEO_MB, type DataSaverMode } from '@/utils/networkPolicy';

const MODES: { id: DataSaverMode; title: string; body: string }[] = [
  { id: 'AUTO', title: 'Tự động (khuyên dùng)', body: 'Tiết kiệm khi dùng 4G/5G, phát video tự động khi có Wi-Fi.' },
  { id: 'ON', title: 'Luôn tiết kiệm', body: 'Không tự phát video, chạm để xem. Ảnh gửi lên được nén nhẹ hơn.' },
  { id: 'OFF', title: 'Tắt', body: 'Luôn tự phát video, kể cả khi dùng dữ liệu di động.' },
];

const KIND_LABEL = { wifi: 'Wi-Fi', cellular: 'Dữ liệu di động', ethernet: 'Mạng có dây', none: 'Không có mạng', unknown: 'Chưa rõ loại mạng' } as const;

/** "Chế độ tiết kiệm dữ liệu" + cache status / clearing. Route /cai-dat/du-lieu. */
export default function DataSettingsScreen({ navigation }: RootStackScreenProps<'DataSettings'>) {
  const insets = useSafeAreaInsets();
  const net = useNetworkStore((s) => s.net);
  const mode = useNetworkStore((s) => s.mode);
  const setMode = useNetworkStore((s) => s.setMode);
  const skipped = useNetworkStore((s) => s.autoplaySkipped);
  const resetStats = useNetworkStore((s) => s.resetStats);
  const policy = useMediaPolicy();
  const [report, setReport] = useState<MediaCacheReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getMediaCacheReport().then(setReport, () => setReport(null));
  }, []);
  useEffect(refresh, [refresh]);

  const onClear = async () => {
    setBusy(true);
    try {
      const n = await clearMediaCache();
      setNotice(n > 0 ? `Đã xoá ${n} mục trong bộ nhớ đệm. Ảnh sẽ được tải lại khi cần.` : 'Bộ nhớ đệm đã trống.');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const cached = report ? report.prefetchedImages + report.caches.reduce((a, c) => a + c.size, 0) : 0;
  const NetIcon = !net.online ? WifiOff : net.kind === 'wifi' ? Wifi : Signal;

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Dữ liệu & bộ nhớ" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Home' }))} />
      <ScrollView contentContainerClassName="gap-4 px-4 pt-1" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} testID="data-settings">
        <View className="flex-row items-center gap-3 rounded-3xl bg-white p-4" testID="net-status">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
            <NetIcon size={22} color={COLORS.brand} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-ink">{KIND_LABEL[net.online ? net.kind : 'none']}</Text>
            <Text className="text-[13px] text-ink-muted">{policy.label}</Text>
          </View>
        </View>

        <View className="gap-2">
          <Text className="px-1 text-[16px] font-extrabold text-ink" accessibilityRole="header">
            Chế độ tiết kiệm dữ liệu
          </Text>
          <View accessibilityRole="radiogroup" className="gap-2">
            {MODES.map((m) => {
              const on = m.id === mode;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setMode(m.id)}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityState={{ checked: on }}
                  className={`min-h-14 flex-row items-center gap-3 rounded-2xl border bg-white px-4 py-3 ${on ? 'border-brand-500' : 'border-slate-200 active:bg-slate-50'}`}
                  testID={`saver-${m.id}`}
                >
                  <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                    {on && <Check size={14} color="#fff" strokeWidth={3} />}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-ink">{m.title}</Text>
                    <Text className="text-[13px] leading-[19px] text-ink-muted">{m.body}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2 rounded-3xl bg-white p-4" testID="policy-summary">
          <Text className="text-[14px] font-bold text-ink">Lúc này ứng dụng sẽ</Text>
          <Row ok={policy.autoplay} text={policy.autoplay ? 'Tự phát video đang ở giữa màn hình' : 'Chỉ phát video khi ba mẹ chạm vào'} />
          <Row ok={policy.warmNextVideo} text={policy.warmNextVideo ? 'Tải trước video kế tiếp để lướt mượt' : 'Không tải trước video kế tiếp'} />
          <Row ok text={`Ảnh gửi lên được thu nhỏ tối đa ${policy.upload.maxSide}px`} />
          {skipped > 0 && (
            <View className="mt-1 flex-row items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5">
              <Text className="flex-1 text-[13px] leading-[19px] text-emerald-900" testID="data-saved">
                Đã không tự phát {skipped} video · tiết kiệm khoảng {skipped * EST_VIDEO_MB} MB (ước tính)
              </Text>
              <Pressable onPress={resetStats} accessibilityRole="button" hitSlop={8} className="min-h-11 justify-center px-1">
                <Text className="text-xs font-bold text-emerald-800 underline">Đặt lại</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View className="gap-3 rounded-3xl bg-white p-4" testID="cache-card">
          <View className="flex-row items-center gap-2">
            <HardDrive size={18} color={COLORS.ink} />
            <Text className="flex-1 text-[14px] font-bold text-ink">Bộ nhớ đệm ảnh & video</Text>
          </View>
          <Text className="text-[13px] leading-[19px] text-ink-muted" testID="cache-summary">
            {report?.storage
              ? `Ứng dụng đang dùng khoảng ${formatBytes(report.storage.usageBytes)} trên trình duyệt này`
              : 'Ảnh đã xem được lưu tạm để mở lại nhanh hơn'}
            {` · ${cached} mục lưu tạm.`}
          </Text>
          {!!notice && <StatusBanner tone="success" text={notice} onDismiss={() => setNotice(null)} testID="cache-cleared" />}
          <Button title="Xoá bộ nhớ đệm" variant="outline" loading={busy} onPress={onClear} testID="clear-cache" />
          <Text className="text-xs leading-[17px] text-ink-subtle">Không ảnh hưởng đăng nhập, lịch hẹn hay sổ liên lạc. Video không được lưu lại trên máy.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-5 w-5 items-center justify-center rounded-full ${ok ? 'bg-emerald-100' : 'bg-slate-100'}`}>
        <Text className={`text-[11px] font-black ${ok ? 'text-emerald-700' : 'text-ink-subtle'}`}>{ok ? '✓' : '–'}</Text>
      </View>
      <Text className="flex-1 text-[13px] leading-[19px] text-ink">{text}</Text>
    </View>
  );
}
