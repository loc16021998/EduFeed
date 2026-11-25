import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

/** A titled white card that groups settings rows. */
export function SettingsSection({ title, hint, children, testID }: { title: string; hint?: string; children: ReactNode; testID?: string }) {
  return (
    <View className="gap-1.5" testID={testID}>
      <Text className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-ink-muted" accessibilityRole="header">
        {title}
      </Text>
      <View className="overflow-hidden rounded-3xl bg-white">{children}</View>
      {!!hint && <Text className="px-1 text-xs leading-[17px] text-ink-subtle">{hint}</Text>}
    </View>
  );
}

interface RowProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Right side (switch, badge…). Rows with onPress and no `right` get a chevron. */
  right?: ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'danger';
  /** First row in a section: no divider above. */
  first?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** 52 px+ row: icon tile, title + helper text, then a chevron / switch / badge. */
export function SettingsRow({ icon: Icon, title, subtitle, right, onPress, tone = 'default', first, disabled, testID }: RowProps) {
  const danger = tone === 'danger';
  const body = (
    <>
      <View className={`h-10 w-10 items-center justify-center rounded-2xl ${danger ? 'bg-red-50' : 'bg-brand-50'}`}>
        <Icon size={19} color={danger ? '#DC2626' : COLORS.brand} />
      </View>
      <View className="flex-1 py-0.5">
        <Text className={`text-[15px] font-semibold ${danger ? 'text-red-600' : 'text-ink'}`}>{title}</Text>
        {!!subtitle && <Text className="text-[13px] leading-[18px] text-ink-muted">{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={COLORS.subtle} /> : null)}
    </>
  );
  const cls = `min-h-[56px] flex-row items-center gap-3 px-4 py-2.5 ${first ? '' : 'border-t border-slate-100'}`;
  if (!onPress) {
    return (
      <View className={cls} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      className={`${cls} active:bg-slate-50 ${disabled ? 'opacity-50' : ''}`}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

/** Bottom sheet used by the settings sub-views (edit profile, privacy, delete account, admin tools). */
export function SettingsSheet({ visible, title, onClose, children, testID }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="max-h-[90%] rounded-t-[28px] bg-white" accessibilityViewIsModal aria-modal testID={testID}>
          <View className="flex-row items-center gap-2 px-5 pb-1 pt-4">
            <Text className="flex-1 text-lg font-extrabold text-ink" accessibilityRole="header">
              {title}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" className="-mr-2 h-11 min-w-[56px] items-center justify-center rounded-full active:bg-slate-100" testID={testID ? `${testID}-close` : undefined}>
              <Text className="text-[14px] font-bold text-brand-600">Đóng</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-3 px-5 pt-2" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
