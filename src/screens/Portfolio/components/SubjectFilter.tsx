import { Pressable, Text, View } from 'react-native';

import type { CourseCategory } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/utils/constants';

interface SubjectFilterProps {
  options: CourseCategory[];
  value: CourseCategory;
  onChange: (c: CourseCategory) => void;
}

/** Segmented subject switcher; the active segment takes the subject's colour. */
export default function SubjectFilter({ options, value, onChange }: SubjectFilterProps) {
  return (
    <View className="flex-row gap-1 rounded-2xl bg-slate-200/70 p-1" accessibilityRole="tablist">
      {options.map((c) => {
        const active = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`flex-1 items-center justify-center rounded-xl px-1 py-2.5 ${active ? 'bg-white shadow-sm shadow-black/10' : ''}`}
          >
            <Text
              className="text-center text-[13px] font-bold"
              style={{ color: active ? CATEGORY_COLORS[c] : '#64748B' }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {CATEGORY_LABELS[c]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
