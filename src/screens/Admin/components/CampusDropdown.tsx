import { Check, ChevronDown, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import type { CampusFilter } from '@/types';
import { COLORS } from '@/utils/constants';
import { CAMPUSES } from '@/utils/mockData';

export const CAMPUS_OPTIONS: { value: CampusFilter; label: string; short: string }[] = [
  { value: 'ALL', label: 'Tất cả cơ sở', short: 'Tất cả cơ sở' },
  ...CAMPUSES.map((c) => ({
    value: c.id as CampusFilter,
    label: `Cơ sở ${c.code.replace(/\D/g, '')}: ${c.name.replace(/^Cơ sở\s*/i, '')}`,
    short: c.code,
  })),
];

interface Props {
  value: CampusFilter;
  onChange: (v: CampusFilter) => void;
  /** Show the full label on the button (wide screens). */
  full?: boolean;
}

/** Compact header dropdown for the campus filter. */
export default function CampusDropdown({ value, onChange, full }: Props) {
  const [open, setOpen] = useState(false);
  const current = CAMPUS_OPTIONS.find((o) => o.value === value) ?? CAMPUS_OPTIONS[0];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Cơ sở: ${current.label}`}
        accessibilityHint="Chọn cơ sở để lọc số liệu"
        className="h-10 flex-row items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 active:bg-slate-50"
      >
        <MapPin size={15} color={COLORS.brand} />
        <Text className="text-[13px] font-semibold text-ink" numberOfLines={1}>
          {full || value === 'ALL' ? current.label : current.short}
        </Text>
        <ChevronDown size={15} color={COLORS.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/30 p-6" onPress={() => setOpen(false)} accessibilityLabel="Đóng">
          <View className="w-full max-w-[360px] overflow-hidden rounded-3xl bg-white py-2" accessibilityRole="menu">
            <Text className="px-5 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-ink-subtle">Lọc theo cơ sở</Text>
            {CAMPUS_OPTIONS.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    setOpen(false);
                    onChange(o.value);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  className={`flex-row items-center gap-3 px-5 py-3.5 active:bg-slate-50 ${active ? 'bg-brand-50' : ''}`}
                >
                  <Text className={`flex-1 text-[15px] ${active ? 'font-bold text-brand-700' : 'text-ink'}`}>{o.label}</Text>
                  {active && <Check size={18} color={COLORS.brand} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
