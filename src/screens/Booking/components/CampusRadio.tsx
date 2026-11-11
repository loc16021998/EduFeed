import { MapPin } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { CampusLocation, CourseCategory } from '@/types';
import { CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { CAMPUSES, COURSES } from '@/utils/mockData';

interface CampusRadioProps {
  course: CourseCategory;
  value: CampusLocation;
  onChange: (c: CampusLocation) => void;
  error?: string;
}

export default function CampusRadio({ course, value, onChange, error }: CampusRadioProps) {
  const offered = COURSES.find((c) => c.id === course)?.campuses ?? [];

  return (
    <View className="gap-2" accessibilityRole="radiogroup">
      <Text className="text-[13px] font-semibold text-ink-muted">Cơ sở học</Text>
      {CAMPUSES.map((c) => {
        const available = offered.includes(c.id);
        const selected = available && c.id === value;
        return (
          <Pressable
            key={c.id}
            disabled={!available}
            onPress={() => onChange(c.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: !available }}
            accessibilityLabel={`${c.code}: ${c.shortAddress}${available ? '' : ', chưa mở lớp'}`}
            className={`flex-row items-center gap-3 rounded-2xl border-2 p-3.5 ${
              selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
            } ${available ? '' : 'opacity-50'}`}
          >
            {/* Radio dot */}
            <View
              className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                selected ? 'border-brand-500' : 'border-slate-300'
              }`}
            >
              {selected && <View className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
            </View>
            <View className="flex-1">
              <Text className={`text-[14px] font-bold ${selected ? 'text-brand-700' : 'text-ink'}`}>
                {c.code}: {c.shortAddress}
              </Text>
              {!available && (
                <Text className="mt-0.5 text-xs text-ink-muted">
                  Chưa mở lớp {CATEGORY_LABELS[course]} tại cơ sở này
                </Text>
              )}
            </View>
            <MapPin size={16} color={selected ? COLORS.brand : COLORS.subtle} />
          </Pressable>
        );
      })}
      {!!error && <Text className="text-xs text-red-500">{error}</Text>}
    </View>
  );
}
