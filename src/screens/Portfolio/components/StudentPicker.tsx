import { Pressable, ScrollView, Text } from 'react-native';

import { Avatar } from '@/components';
import type { PortfolioItem } from '@/types';

interface StudentPickerProps {
  students: PortfolioItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  accent: string;
}

/** Horizontal list of students within the chosen subject. */
export default function StudentPicker({ students, selectedId, onSelect, accent }: StudentPickerProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {students.map((s) => {
        const active = s.id === selectedId;
        return (
          <Pressable
            key={s.id}
            onPress={() => onSelect(s.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-row items-center gap-2 rounded-full border-2 bg-white py-1 pl-1 pr-3.5"
            style={{ borderColor: active ? accent : '#E2E8F0' }}
          >
            <Avatar name={s.studentName} size={28} />
            <Text className="text-sm font-semibold" style={{ color: active ? accent : '#64748B' }}>
              {s.displayName}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
