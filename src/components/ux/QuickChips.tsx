import { Pressable, Text, View } from 'react-native';

import { haptics } from '@/utils/haptics';

export interface QuickChipsProps {
  options: readonly string[];
  value?: string | null;
  onPick: (v: string) => void;
  label?: string;
}

/** One-tap answers (e.g. common leave reasons) so busy parents rarely need the keyboard. 48dp tall. */
export default function QuickChips({ options, value, onPick, label }: QuickChipsProps) {
  return (
    <View className="gap-1.5">
      {!!label && <Text className="text-[13px] font-semibold text-ink-muted">{label}</Text>}
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const on = o === value;
          return (
            <Pressable
              key={o}
              onPress={() => {
                haptics.light();
                onPick(o);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className={`min-h-12 justify-center rounded-full border px-4 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white active:bg-slate-50'}`}
            >
              <Text className={`text-[14px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
