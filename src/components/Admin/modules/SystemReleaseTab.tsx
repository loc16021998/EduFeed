import { useState } from 'react';
import { Text, View } from 'react-native';

import AppVersionFooter from '@/components/AppVersionFooter';
import { ReleaseConfigSheet } from '@/components/Settings/AdminSheets';
import { fetchSystemHealth } from '@/services/commandCenter';

import { Empty, ErrorRow, Grid, LoadingRows, ModuleCard, useModuleData, useWide } from './ui';

type Level = 'ok' | 'warn' | 'bad' | 'off';
const DOT: Record<Level, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-400', bad: 'bg-red-500', off: 'bg-slate-300' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');

export default function SystemReleaseTab() {
  const wide = useWide();
  const health = useModuleData(() => fetchSystemHealth(), []);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const h = health.data;

  const pushLevel: Level = !h ? 'off' : h.push.failed24h > 0 ? 'bad' : h.push.oldestPendingAt && Date.now() - Date.parse(h.push.oldestPendingAt) > 15 * 60000 ? 'warn' : h.push.devices === 0 ? 'off' : 'ok';
  const zaloRecentError = !!h?.zalo.lastErrorAt && Date.parse(h.zalo.lastErrorAt) > Date.now() - 86400000;
  const zaloExpired = !!h?.zalo.expiresAt && Date.parse(h.zalo.expiresAt) < Date.now();
  const zaloLevel: Level = !h || !h.zalo.connected ? 'off' : zaloRecentError || zaloExpired ? 'warn' : 'ok';

  return (
    <View className="gap-3" testID="system-tab">
      {!h ? (
        health.loading ? <LoadingRows rows={3} /> : <ErrorRow text={health.error ?? ''} onRetry={health.reload} />
      ) : (
        <Grid wide={wide}>
          <ModuleCard title="Thông báo đẩy" subtitle="Hàng đợi push_outbox · 24 giờ qua" wide={wide} testID="push-health">
            <Indicator level={pushLevel} text={pushLevel === 'ok' ? 'Đang gửi bình thường' : pushLevel === 'bad' ? `${h.push.failed24h} thông báo gửi lỗi` : pushLevel === 'warn' ? 'Có thông báo chờ quá 15 phút — kiểm tra lịch cron' : 'Chưa có thiết bị nào đăng ký'} />
            <Row label="Đã gửi" value={String(h.push.sent24h)} />
            <Row label="Đang chờ" value={String(h.push.pending)} />
            <Row label="Lỗi" value={String(h.push.failed24h)} />
            <Row label="Thiết bị nhận thông báo" value={String(h.push.devices)} />
          </ModuleCard>
          <ModuleCard title="Zalo OA / ZNS" subtitle="Nhắc lịch, xác nhận, báo cáo tuần" wide={wide} testID="zalo-health">
            <Indicator level={zaloLevel} text={!h.zalo.connected ? 'Chưa kết nối Zalo OA' : zaloLevel === 'ok' ? 'Đã kết nối' : 'Cần kiểm tra kết nối'} />
            <Row label="Token hết hạn" value={fmt(h.zalo.expiresAt)} />
            {!!h.zalo.lastError && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[17px] text-amber-800">Lỗi gần nhất ({fmt(h.zalo.lastErrorAt)}): {h.zalo.lastError.slice(0, 160)}</Text>}
            <Row label="Báo cáo tuần đã gửi Zalo" value={String(h.weeklyDigest.zaloSent)} />
          </ModuleCard>
        </Grid>
      )}

      <ModuleCard title="Phiên bản trên cửa hàng" subtitle="Bản tối thiểu (chặn) · bản mới nhất (mời cập nhật)" action="Chỉnh cấu hình" onAction={() => setReleaseOpen(true)} full testID="release-card">
        {!h ? null : h.release.length === 0 ? (
          <Empty text="Chưa có cấu hình phiên bản." />
        ) : (
          h.release.map((r) => (
            <View key={r.platform} className="min-h-12 flex-row items-center gap-3 border-t border-slate-100 pt-2" testID="release-row">
              <Text className="w-20 text-[14px] font-bold text-ink">{r.platform === 'android' ? 'Android' : 'iPhone'}</Text>
              <Text className="flex-1 text-[13px] text-ink">
                tối thiểu {r.min} · mới nhất {r.latest}
              </Text>
              {r.force && <Text className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">Bắt buộc</Text>}
            </View>
          ))
        )}
      </ModuleCard>

      <AppVersionFooter />
      <ReleaseConfigSheet
        visible={releaseOpen}
        onClose={() => {
          setReleaseOpen(false);
          health.reload();
        }}
      />
    </View>
  );
}

function Indicator({ level, text }: { level: Level; text: string }) {
  return (
    <View className="flex-row items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5" testID={`indicator-${level}`}>
      <View className={`h-2.5 w-2.5 rounded-full ${DOT[level]}`} />
      <Text className="flex-1 text-[13px] font-semibold text-ink">{text}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-[13px] text-ink-muted">{label}</Text>
      <Text className="text-[13px] font-bold text-ink">{value}</Text>
    </View>
  );
}
