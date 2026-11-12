import { Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatPct } from '../format';

interface Props {
  icon: ReactNode;
  label: string;
  /** Headline value; "—" when it cannot be computed yet. */
  value: string;
  /** Relative change vs the previous period (0.25 = +25 %), or null when not comparable. */
  change?: number | null;
  changeLabel?: string;
  /** One line of context under the value. */
  detail?: string;
  /** Optional action (e.g. "Nhập học phí"). */
  footer?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Stat tile: one headline number, its context, and (optionally) the change vs the previous period. */
export default function KpiCard({ icon, label, value, change, changeLabel, detail, footer, onPress, accessibilityHint, style, testID }: Props) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      testID={testID}
      style={style}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={accessibilityHint}
      className="min-h-[148px] gap-2 rounded-3xl border border-slate-100 bg-white p-4 active:opacity-90"
    >
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-brand-50">{icon}</View>
        <Text className="flex-1 text-[13px] font-semibold text-ink-muted" numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text className="text-[28px] font-extrabold leading-[34px] text-ink" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {change !== undefined && <ChangePill change={change} label={changeLabel} />}
      {!!detail && <Text className="text-xs leading-[17px] text-ink-muted">{detail}</Text>}
      {footer}
    </Wrapper>
  );
}

/** Up / down / flat with an icon + sign, so the direction never depends on colour alone. */
function ChangePill({ change, label }: { change: number | null; label?: string }) {
  if (change === null) {
    return <Text className="text-xs text-ink-subtle">Chưa có kỳ trước để so sánh</Text>;
  }
  const flat = Math.abs(change) < 0.005;
  const up = change > 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const fg = flat ? '#475569' : up ? '#047857' : '#B91C1C';
  const bg = flat ? '#F1F5F9' : up ? '#ECFDF5' : '#FEF2F2';
  const pct = formatPct(Math.abs(change), 1, Math.abs(change) >= 0.1 ? 0 : 1);
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: bg }}>
        <Icon size={13} color={fg} strokeWidth={2.5} />
        <Text className="text-xs font-bold" style={{ color: fg }}>
          {flat ? '0%' : `${up ? '+' : '−'}${pct}`}
        </Text>
      </View>
      {!!label && <Text className="text-xs text-ink-subtle">{label}</Text>}
    </View>
  );
}
