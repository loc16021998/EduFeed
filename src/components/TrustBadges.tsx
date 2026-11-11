import { ChevronRight, Info } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTrustStore } from '@/store/useTrustStore';
import { COLORS } from '@/utils/constants';

import SampleDataTag from './SampleDataTag';

interface TrustBadgesProps {
  /** Show a "Góc phụ huynh →" link at the end. */
  onSeeAll?: () => void;
  className?: string;
}

/**
 * Verified stats row. Tapping a badge reveals its source — claims are always checkable.
 * Hidden entirely when no verified stats are published.
 */
export default function TrustBadges({ onSeeAll, className = '' }: TrustBadgesProps) {
  const { data: stats, origin } = useTrustStore((s) => s.stats);
  const loadStats = useTrustStore((s) => s.loadStats);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (stats.length === 0) return null;
  const open = stats.find((s) => s.id === openId);

  return (
    <View className={`gap-2 ${className}`}>
      <View className="flex-row items-center gap-2">
        <Text className="text-[13px] font-bold text-ink">Vì sao phụ huynh tin chọn TH EDU</Text>
        <SampleDataTag origin={origin} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-2">
        {stats.map((s) => {
          const selected = s.id === openId;
          return (
            <Pressable
              key={s.id}
              onPress={() => setOpenId(selected ? null : s.id)}
              accessibilityRole="button"
              accessibilityLabel={`${s.headline ?? ''} ${s.label}. Nhấn để xem nguồn số liệu`}
              accessibilityState={{ expanded: selected }}
              className={`max-w-[230px] flex-row items-center gap-2.5 rounded-2xl border px-3 py-2.5 ${
                selected ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'
              }`}
            >
              <Text className="text-xl">{s.icon}</Text>
              <View className="flex-shrink">
                {!!s.headline && <Text className="text-[16px] font-extrabold leading-5 text-brand-600">{s.headline}</Text>}
                <Text className="text-[12px] leading-4 text-ink" numberOfLines={2}>
                  {s.label}
                </Text>
              </View>
              <Info size={12} color={COLORS.subtle} />
            </Pressable>
          );
        })}
        {onSeeAll && (
          <Pressable
            onPress={onSeeAll}
            accessibilityRole="link"
            className="flex-row items-center gap-1 rounded-2xl border border-dashed border-brand-200 px-3.5"
          >
            <Text className="text-[12px] font-bold text-brand-600">Góc phụ huynh</Text>
            <ChevronRight size={14} color={COLORS.brand} />
          </Pressable>
        )}
      </ScrollView>

      {open && (
        <Text className="text-[11px] italic text-ink-muted" accessibilityLiveRegion="polite">
          Nguồn: {open.sourceNote}
        </Text>
      )}
    </View>
  );
}
