import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TIME_SLOTS } from '@/utils/mockData';
import { getUpcomingDays, slotsForDate } from '@/utils/schedule';

interface SchedulePickerProps {
  date: string | null;
  slotId: string | null;
  onDate: (iso: string) => void;
  onSlot: (id: string) => void;
  dateError?: string;
  slotError?: string;
}

export default function SchedulePicker({ date, slotId, onDate, onSlot, dateError, slotError }: SchedulePickerProps) {
  const days = useMemo(() => getUpcomingDays(7), []);
  const slots = slotsForDate(date, TIME_SLOTS);

  return (
    <View className="gap-3.5">
      {/* Day */}
      <View className="gap-1.5">
        <Text className="text-[13px] font-semibold text-ink-muted">Ngày học thử</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {days.map((d) => {
            const selected = d.iso === date;
            return (
              <Pressable
                key={d.iso}
                onPress={() => onDate(d.iso)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${d.weekday} ngày ${d.dayMonth}`}
                className={`w-16 items-center gap-0.5 rounded-2xl border-2 py-2.5 ${
                  selected ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'
                }`}
              >
                <Text className={`text-xs font-semibold ${selected ? 'text-brand-100' : d.isWeekend ? 'text-accent-600' : 'text-ink-muted'}`}>
                  {d.isTomorrow ? 'Mai' : d.weekday}
                </Text>
                <Text className={`text-[15px] font-extrabold ${selected ? 'text-white' : 'text-ink'}`}>{d.dayMonth}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {!!dateError && <Text className="text-xs text-red-500">{dateError}</Text>}
      </View>

      {/* Slot */}
      <View className="gap-1.5">
        <Text className="text-[13px] font-semibold text-ink-muted">Khung giờ (90 phút)</Text>
        {date ? (
          <View className="flex-row flex-wrap gap-2">
            {slots.map((s) => {
              const selected = s.id === slotId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => onSlot(s.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  className={`rounded-xl border-2 px-3.5 py-2.5 ${selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
                >
                  <Text className={`text-[14px] font-bold ${selected ? 'text-brand-700' : 'text-ink'}`}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text className="text-[13px] italic text-ink-subtle">Chọn ngày để xem khung giờ còn trống</Text>
        )}
        {!!slotError && <Text className="text-xs text-red-500">{slotError}</Text>}
      </View>
    </View>
  );
}
