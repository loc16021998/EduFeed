import type { ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

interface FormSectionProps {
  step: number;
  title: string;
  right?: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}

export default function FormSection({ step, title, right, onLayout, children }: FormSectionProps) {
  return (
    <View onLayout={onLayout} className="gap-3.5 rounded-3xl bg-white p-4">
      <View className="flex-row items-center gap-2.5">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-brand-500">
          <Text className="text-[13px] font-extrabold text-white">{step}</Text>
        </View>
        <Text className="flex-1 text-base font-bold text-ink" accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}
