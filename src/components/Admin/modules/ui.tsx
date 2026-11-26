import { ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import Skeleton from '@/components/Skeleton';
import { StatusBanner } from '@/components/ux';
import { useCommandCenterStore } from '@/store/useCommandCenterStore';
import { COLORS } from '@/utils/constants';

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Không tải được dữ liệu, vui lòng thử lại.');

/** Tablet / desktop (≥ 720 px wide): modules lay cards out in two columns. */
export function useWide(): boolean {
  return useWindowDimensions().width >= 720;
}

/**
 * Load data for a module and reload on the global filters / "Làm mới".
 * Keeps the previous data while reloading (no flash), drops stale responses.
 */
export function useModuleData<T>(load: () => Promise<T>, deps: unknown[]) {
  const refreshKey = useCommandCenterStore((s) => s.refreshKey);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    load()
      .then((d) => id === seq.current && setData(d))
      .catch((e) => id === seq.current && setError(errMsg(e)))
      .finally(() => id === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);
  useEffect(run, [run]);
  return { data, setData, loading, error, reload: run };
}

export function Grid({ children, wide }: { children: ReactNode; wide: boolean }) {
  return <View className={wide ? 'flex-row flex-wrap gap-3' : 'gap-3'}>{children}</View>;
}

/** Card: title row (+ optional link), body. On wide screens it takes half the row unless `full`. */
export function ModuleCard({ title, subtitle, action, onAction, children, wide, full, testID }: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  wide?: boolean;
  full?: boolean;
  testID?: string;
}) {
  return (
    <View className="gap-3 rounded-3xl bg-white p-4" style={wide && !full ? { width: '48.8%' } : undefined} testID={testID}>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-ink" accessibilityRole="header">
            {title}
          </Text>
          {!!subtitle && <Text className="text-[12px] leading-[17px] text-ink-muted">{subtitle}</Text>}
        </View>
        {!!action && onAction && (
          <Pressable onPress={onAction} accessibilityRole="link" className="-mr-1 min-h-11 flex-row items-center justify-center px-1" testID={testID ? `${testID}-action` : undefined}>
            <Text className="text-[13px] font-bold text-brand-600">{action}</Text>
            <ChevronRight size={15} color={COLORS.brand} />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

export function Kpi({ label, value, hint, tone = 'default', wide, testID }: { label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'warn'; wide?: boolean; testID?: string }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-ink';
  return (
    <View className={`min-h-[92px] flex-1 gap-1 rounded-2xl bg-slate-50 p-3 ${wide ? 'basis-[31%]' : 'basis-[46%]'}`} testID={testID}>
      <Text className="text-[12px] font-semibold text-ink-muted">{label}</Text>
      <Text className={`text-[22px] font-black ${color}`} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {!!hint && <Text className="text-[11px] leading-[15px] text-ink-subtle">{hint}</Text>}
    </View>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <View className="gap-2.5" testID="module-loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={56} radius={16} />
      ))}
    </View>
  );
}

export function ErrorRow({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <StatusBanner tone="error" text={text} action={onRetry ? { label: 'Thử lại', onPress: onRetry } : undefined} testID="module-error" />;
}

export function Empty({ text }: { text: string }) {
  return <Text className="rounded-2xl bg-slate-50 p-3 text-center text-[13px] leading-[19px] text-ink-muted">{text}</Text>;
}

export function Chip({ label, on, onPress, count, testID }: { label: string; on: boolean; onPress: () => void; count?: number; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={on}
      accessibilityState={{ selected: on }}
      className={`h-11 flex-row items-center gap-1.5 rounded-full border px-3.5 ${on ? 'border-ink bg-ink' : 'border-slate-200 bg-white active:bg-slate-50'}`}
      testID={testID}
    >
      <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-ink'}`}>{label}</Text>
      {count != null && count > 0 && <Text className={`text-[12px] font-black ${on ? 'text-white/80' : 'text-brand-600'}`}>{count}</Text>}
    </Pressable>
  );
}

/** Small row action button (≥ 44 px tall). */
export function RowAction({ label, onPress, tone = 'default', disabled, testID }: { label: string; onPress: () => void; tone?: 'default' | 'primary' | 'danger'; disabled?: boolean; testID?: string }) {
  const cls = tone === 'primary' ? 'bg-brand-500 active:bg-brand-600' : tone === 'danger' ? 'border border-red-200 bg-white active:bg-red-50' : 'border border-slate-200 bg-white active:bg-slate-50';
  const text = tone === 'primary' ? 'text-white' : tone === 'danger' ? 'text-red-600' : 'text-ink';
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" className={`h-11 items-center justify-center rounded-xl px-3 ${cls} ${disabled ? 'opacity-50' : ''}`} testID={testID}>
      <Text className={`text-[13px] font-bold ${text}`}>{label}</Text>
    </Pressable>
  );
}
