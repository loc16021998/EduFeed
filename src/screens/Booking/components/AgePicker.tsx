import { Pressable, Text, View } from 'react-native';

import { CHILD_AGE_OPTIONS } from '@/utils/validation';

interface AgePickerProps {
  value: number | null;
  onChange: (age: number) => void;
  error?: string;
}

export default function AgePicker({ value, onChange, error }: AgePickerProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-ink-muted">Tuổi của bé</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {CHILD_AGE_OPTIONS.map((age) => {
          const selected = age === value;
          return (
            <Pressable
              key={age}
              onPress={() => onChange(age)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${age} tuổi`}
              className={`h-11 min-w-[56px] items-center justify-center rounded-xl border-2 px-2 ${
                selected ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'
              }`}
            >
              <Text className={`text-[14px] font-bold ${selected ? 'text-white' : 'text-ink'}`}>{age} tuổi</Text>
            </Pressable>
          );
        })}
      </View>
      {!!error && <Text className="text-xs text-red-500">{error}</Text>}
    </View>
  );
}
