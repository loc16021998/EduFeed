import { Pressable, ScrollView, Text } from 'react-native';

import type { Category } from '@/types';
import { CATEGORY_LABELS } from '@/utils/constants';

interface CategoryChipsProps {
  options: Category[];
  value: Category;
  onChange: (c: Category) => void;
}

export default function CategoryChips({ options, value, onChange }: CategoryChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4 py-3"
    >
      {options.map((c) => {
        const active = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`rounded-full px-4 py-2 ${active ? 'bg-brand-500' : 'bg-white border border-slate-200'}`}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>
              {CATEGORY_LABELS[c]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
