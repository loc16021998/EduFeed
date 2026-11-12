import { ArrowDown } from 'lucide-react-native';
import { Fragment } from 'react';
import { Text, View } from 'react-native';

import type { DashboardSummary } from '@/types';
import { COLORS } from '@/utils/constants';

import { formatDayMonth, formatInt, formatPct } from '../format';

interface Props {
  funnel: DashboardSummary['funnel'];
  periodDays: number;
  /** A single campus is selected: visits are not tied to a campus. */
  campusFiltered: boolean;
}

interface Stage {
  key: string;
  label: string;
  value: number | null;
  /** Visits (anonymous) vs bookings (people) — different units, drawn in two tones. */
  unit: 'visit' | 'lead';
}

/**
 * Funnel as horizontal bars with the step conversion between stages. Two groups with different units:
 * anonymous visits (lighter, scaled to the first visit stage) and bookings (scaled to the bookings
 * stage) — so the booking → enrolment part stays readable next to thousands of visits.
 */
export default function ConversionFunnel({ funnel, periodDays, campusFiltered }: Props) {
  const tracking = !!funnel.trackingSince;
  const stages: Stage[] = [
    { key: 'visit', label: 'Lượt vào app / web', value: tracking ? funnel.appSessions : null, unit: 'visit' },
    { key: 'video', label: 'Xem video (≥ 3 giây)', value: tracking ? funnel.videoSessions : null, unit: 'visit' },
    { key: 'lead', label: 'Đăng ký học thử', value: funnel.leads, unit: 'lead' },
    { key: 'trial', label: 'Đã học thử', value: funnel.trialsDone, unit: 'lead' },
    { key: 'enrolled', label: 'Nhập học chính thức', value: funnel.enrolled, unit: 'lead' },
  ];
  const maxOf = (unit: Stage['unit']) => Math.max(1, ...stages.filter((s) => s.unit === unit).map((s) => s.value ?? 0));
  const max = { visit: maxOf('visit'), lead: maxOf('lead') };
  const periodStart = Date.now() - periodDays * 86400_000;
  const partialPeriod = tracking && new Date(funnel.trackingSince!).getTime() > periodStart;

  return (
    <View className="gap-3 rounded-3xl border border-slate-100 bg-white p-4" testID="conversion-funnel">
      <View>
        <Text className="text-base font-bold text-ink" accessibilityRole="header">
          Phễu chuyển đổi
        </Text>
        <Text className="text-xs text-ink-muted">Phụ huynh đăng ký trong {periodDays} ngày qua và họ đã đi tới đâu</Text>
      </View>

      <View>
        {stages.map((s, i) => {
          const prev = stages[i - 1];
          // No step rate across the visit → booking boundary when visits aren't comparable.
          const comparable = prev && prev.value !== null && s.value !== null && !(campusFiltered && prev.unit !== s.unit);
          const step = comparable ? formatPct(s.value!, prev.value!, 1) : null;
          return (
            <Fragment key={s.key}>
              {i > 0 && prev.unit !== s.unit && <View className="mt-2 border-t border-dashed border-slate-200" />}
              {i > 0 && (
                <View className="h-7 flex-row items-center gap-1 pl-1">
                  <ArrowDown size={12} color={COLORS.subtle} />
                  <Text className="text-[11px] text-ink-muted">{step ? `${step} đi tiếp` : ' '}</Text>
                </View>
              )}
              <View className="gap-1" accessible accessibilityLabel={`${s.label}: ${s.value === null ? 'chưa đo' : s.value}`}>
                <View className="flex-row items-baseline justify-between gap-2">
                  <Text className="flex-1 text-[13px] font-semibold text-ink" numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text className="text-[13px] font-bold text-ink">{s.value === null ? 'Chưa đo' : formatInt(s.value)}</Text>
                </View>
                <View className="h-3 overflow-hidden rounded-full bg-slate-100">
                  {!!s.value && (
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(1.5, (s.value / max[s.unit]) * 100)}%`,
                        backgroundColor: s.unit === 'visit' ? '#93B4FF' : COLORS.brand,
                      }}
                    />
                  )}
                </View>
              </View>
            </Fragment>
          );
        })}
      </View>

      {funnel.leads > 0 && (
        <View className="flex-row items-center justify-between rounded-2xl bg-brand-50 px-3 py-2.5">
          <Text className="text-xs font-semibold text-ink">Từ đăng ký → nhập học</Text>
          <Text className="text-sm font-extrabold text-brand-700">{formatPct(funnel.enrolled, funnel.leads, 1)}</Text>
        </View>
      )}

      <View className="gap-1">
        <Legend color="#93B4FF" text="Lượt truy cập ẩn danh (mỗi phiên tính 1 lần, không gắn với phụ huynh cụ thể). Độ dài thanh so với lượt vào app." />
        <Legend color={COLORS.brand} text="Hồ sơ đăng ký, tính theo ngày phụ huynh đăng ký. Độ dài thanh so với số đăng ký." />
        {!tracking && <Note text="Chưa có dữ liệu lượt xem: hệ thống bắt đầu đếm sau khi nâng cấp cơ sở dữ liệu." />}
        {partialPeriod && <Note text={`Lượt xem được đếm từ ${formatDayMonth(funnel.trackingSince!)} — chưa đủ cả kỳ.`} />}
        {campusFiltered && tracking && <Note text="Lượt vào app và xem video là số chung toàn trung tâm (không phân theo cơ sở)." />}
      </View>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="mt-1 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <Text className="flex-1 text-[11px] leading-4 text-ink-muted">{text}</Text>
    </View>
  );
}

function Note({ text }: { text: string }) {
  return <Text className="text-[11px] leading-4 text-amber-800">• {text}</Text>;
}
