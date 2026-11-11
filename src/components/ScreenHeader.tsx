import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/utils/constants';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  /** Right-side slot, e.g. a share button. */
  right?: ReactNode;
}

/** Centered-title header with optional back button and right action. Handles the top safe area. */
export default function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top }} className="bg-surface">
      <View className="h-14 flex-row items-center px-2">
        <View className="w-12">
          {onBack && (
            <HeaderIconButton label="Quay lại" onPress={onBack}>
              <ChevronLeft size={26} color={COLORS.ink} />
            </HeaderIconButton>
          )}
        </View>
        <Text className="flex-1 text-center text-[17px] font-bold text-ink" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <View className="w-12 items-end">{right}</View>
      </View>
    </View>
  );
}

export function HeaderIconButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-200"
    >
      {children}
    </Pressable>
  );
}
