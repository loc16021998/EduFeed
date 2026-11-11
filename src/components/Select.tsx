import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/utils/constants';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Optional colour dot (e.g. subject colour). */
  color?: string;
}

interface SelectProps<T extends string> {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
  /** Small note under the field, e.g. "Đã chọn theo kết quả Quiz". */
  note?: string;
}

/** Dropdown field that opens a bottom-sheet list. */
export default function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Chọn…',
  error,
  note,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.value === value);

  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-ink-muted">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        accessibilityHint="Mở danh sách lựa chọn"
        className={`min-h-[52px] flex-row items-center gap-2.5 rounded-2xl border bg-white px-4 py-2.5 ${
          error ? 'border-red-400' : 'border-slate-200'
        }`}
      >
        {current?.color && <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: current.color }} />}
        <View className="flex-1">
          <Text className={`text-[15px] font-semibold ${current ? 'text-ink' : 'text-ink-subtle'}`}>
            {current?.label ?? placeholder}
          </Text>
          {!!current?.description && (
            <Text className="text-xs text-ink-muted" numberOfLines={1}>
              {current.description}
            </Text>
          )}
        </View>
        <ChevronDown size={20} color={COLORS.muted} />
      </Pressable>
      {!!note && !error && <Text className="text-xs font-medium text-accent-600">{note}</Text>}
      {!!error && <Text className="text-xs text-red-500">{error}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setOpen(false)} accessibilityLabel="Đóng" />
        <View className="rounded-t-3xl bg-white px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-slate-300" />
          <Text className="mb-2 text-lg font-bold text-ink">{label}</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  className={`mb-2 flex-row items-center gap-3 rounded-2xl p-3.5 ${selected ? 'bg-brand-50' : 'active:bg-slate-50'}`}
                >
                  {o.color && <View className="h-3 w-3 rounded-full" style={{ backgroundColor: o.color }} />}
                  <View className="flex-1">
                    <Text className={`text-[15px] font-semibold ${selected ? 'text-brand-700' : 'text-ink'}`}>{o.label}</Text>
                    {!!o.description && <Text className="mt-0.5 text-xs text-ink-muted">{o.description}</Text>}
                  </View>
                  {selected && <Check size={20} color={COLORS.brand} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
