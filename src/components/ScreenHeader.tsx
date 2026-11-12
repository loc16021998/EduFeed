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
  /** 'dark' for dark pages (admin sign-in). */
  tone?: 'light' | 'dark';
}

/** Centered-title header with optional back button and right action. Handles the top safe area. */
export default function ScreenHeader({ title, onBack, right, tone = 'light' }: ScreenHeaderProps) {
  const dark = tone === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top }} className={dark ? 'bg-ink' : 'bg-surface'}>
      <View className="h-14 flex-row items-center px-2">
        <View className="w-12">
          {onBack && (
            <HeaderIconButton label="Quay lại" onPress={onBack} dark={dark}>
              <ChevronLeft size={26} color={dark ? COLORS.white : COLORS.ink} />
            </HeaderIconButton>
          )}
        </View>
        <Text className={`flex-1 text-center text-[17px] font-bold ${dark ? 'text-white' : 'text-ink'}`} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <View className="w-12 items-end">{right}</View>
      </View>
    </View>
  );
}

export function HeaderIconButton({ label, onPress, children, dark }: { label: string; onPress: () => void; children: ReactNode; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className={`h-11 w-11 items-center justify-center rounded-full ${dark ? 'active:bg-white/10' : 'active:bg-slate-200'}`}
    >
      {children}
    </Pressable>
  );
}
