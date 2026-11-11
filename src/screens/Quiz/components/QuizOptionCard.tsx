import { Check } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { QuizMode, QuizOption } from '@/types';

interface QuizOptionCardProps {
  option: QuizOption;
  mode: QuizMode;
  selected: boolean;
  onPress: () => void;
}

export default function QuizOptionCard({ option, mode, selected, onPress }: QuizOptionCardProps) {
  const isMulti = mode === 'multi';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={isMulti ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={option.hint ? `${option.label}, ${option.hint}` : option.label}
      className={`flex-row items-center gap-3.5 rounded-2xl border-2 p-3.5 active:opacity-80 ${
        selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'
      }`}
    >
      <View className={`h-12 w-12 items-center justify-center rounded-2xl ${selected ? 'bg-white' : 'bg-slate-100'}`}>
        <Text className="text-2xl">{option.emoji}</Text>
      </View>

      <View className="flex-1">
        <Text className={`text-[15px] font-semibold leading-5 ${selected ? 'text-brand-700' : 'text-ink'}`}>
          {option.label}
        </Text>
        {!!option.hint && <Text className="mt-0.5 text-xs text-ink-muted">{option.hint}</Text>}
      </View>

      {/* Checkbox (square) for multi-select, radio (circle) for single */}
      <View
        className={`h-6 w-6 items-center justify-center border-2 ${isMulti ? 'rounded-md' : 'rounded-full'} ${
          selected ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'
        }`}
      >
        {selected && <Check size={14} color="#fff" strokeWidth={3.5} />}
      </View>
    </Pressable>
  );
}
