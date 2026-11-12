import { ChevronDown, ChevronUp, Info } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ENV } from '@/config/env';
import type { LeadChannel } from '@/types';
import { CHANNEL_LABELS, COLORS } from '@/utils/constants';

import { formatPct } from '../format';

interface Props {
  channels: Partial<Record<LeadChannel, number>>;
  periodDays: number;
}

// The four paid / owned channels are always listed (a 0 is information too).
const ALWAYS: LeadChannel[] = ['FACEBOOK', 'TIKTOK', 'ZALO', 'REFERRAL'];

/**
 * Horizontal bars, one hue: bar length = number of bookings, every row labelled with its count and share.
 * "Chưa gắn nguồn" is grey and always last — it is missing data, not a channel.
 */
export default function ChannelBreakdown({ channels, periodDays }: Props) {
  const [showGuide, setShowGuide] = useState(false);
  const total = Object.values(channels).reduce((n, v) => n + (v ?? 0), 0);
  const rows = (Object.keys(CHANNEL_LABELS) as LeadChannel[])
    .filter((c) => ALWAYS.includes(c) || (channels[c] ?? 0) > 0)
    .map((c) => ({ id: c, n: channels[c] ?? 0 }))
    .sort((a, b) => (a.id === 'UNTRACKED' ? 1 : b.id === 'UNTRACKED' ? -1 : b.n - a.n));
  const max = Math.max(1, ...rows.map((r) => r.n));
  const untracked = channels.UNTRACKED ?? 0;
  const base = ENV.webUrl || 'https://<địa-chỉ-web>';

  return (
    <View className="gap-3 rounded-3xl border border-slate-100 bg-white p-4" testID="channel-breakdown">
      <View>
        <Text className="text-base font-bold text-ink" accessibilityRole="header">
          Nguồn khách hàng
        </Text>
        <Text className="text-xs text-ink-muted">{total} đăng ký trong {periodDays} ngày qua, theo link quảng cáo</Text>
      </View>

      <View className="gap-3">
        {rows.map((r) => {
          const share = formatPct(r.n, total, 0) ?? '0%';
          const grey = r.id === 'UNTRACKED';
          return (
            <View key={r.id} className="gap-1.5" accessible accessibilityLabel={`${CHANNEL_LABELS[r.id]}: ${r.n} đăng ký, ${share}`}>
              <View className="flex-row items-baseline justify-between gap-2">
                <Text className={`flex-1 text-[13px] ${grey ? 'text-ink-muted' : 'font-semibold text-ink'}`} numberOfLines={1}>
                  {CHANNEL_LABELS[r.id]}
                </Text>
                <Text className="text-[13px] font-bold text-ink">{r.n}</Text>
                <Text className="w-10 text-right text-xs text-ink-muted">{share}</Text>
              </View>
              <View className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                {r.n > 0 && (
                  <View
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(2, (r.n / max) * 100)}%`, backgroundColor: grey ? '#94A3B8' : COLORS.brand }}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>

      {total === 0 && <Text className="text-xs text-ink-muted">Chưa có đăng ký nào trong kỳ này.</Text>}

      {total > 0 && untracked / total >= 0.3 && (
        <View className="flex-row gap-2 rounded-2xl bg-amber-50 p-3">
          <Info size={16} color="#92400E" />
          <Text className="flex-1 text-xs leading-[17px] text-amber-900">
            {formatPct(untracked, total, 0)} đăng ký chưa biết đến từ đâu. Gắn UTM vào mọi link quảng cáo để biết kênh nào hiệu quả.
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => setShowGuide((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showGuide }}
        className="flex-row items-center gap-1 self-start py-1"
      >
        <Text className="text-xs font-semibold text-brand-600">Cách gắn nguồn cho link quảng cáo</Text>
        {showGuide ? <ChevronUp size={14} color={COLORS.brand} /> : <ChevronDown size={14} color={COLORS.brand} />}
      </Pressable>
      {showGuide && (
        <View className="gap-1.5 rounded-2xl bg-slate-50 p-3">
          <Text className="text-xs leading-[17px] text-ink-muted">Dùng link có thêm tham số utm_source khi chạy quảng cáo / đăng bài:</Text>
          {[
            ['Facebook Ads', 'facebook&utm_medium=cpc'],
            ['TikTok Ads', 'tiktok&utm_medium=cpc'],
            ['Tin nhắn Zalo OA', 'zalo&utm_medium=oa'],
            ['Phụ huynh giới thiệu', 'referral'],
          ].map(([label, q]) => (
            <View key={label}>
              <Text className="text-[11px] font-semibold text-ink">{label}</Text>
              <Text selectable className="text-[11px] text-ink-muted">
                {base}/feed?utm_source={q}&utm_campaign=ten-chien-dich
              </Text>
            </View>
          ))}
          <Text className="text-[11px] leading-4 text-ink-subtle">
            Link quảng cáo Facebook/TikTok không gắn UTM vẫn được nhận ra nhờ mã fbclid / ttclid.
          </Text>
        </View>
      )}
    </View>
  );
}
