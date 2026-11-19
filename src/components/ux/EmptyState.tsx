import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import Button from '../Button';

export interface EmptyStateProps {
  /** A big friendly emoji (or pass `icon`). */
  emoji?: string;
  icon?: ReactNode;
  title: string;
  message?: string;
  /** The single clear next step. */
  action?: { label: string; onPress: () => void; variant?: 'primary' | 'accent' | 'outline'; testID?: string };
  /** Smaller padding for use inside a section. */
  compact?: boolean;
  testID?: string;
}

/** Friendly "nothing here yet" card: what this place is for + exactly one next step. */
export default function EmptyState({ emoji, icon, title, message, action, compact, testID }: EmptyStateProps) {
  return (
    <View className={`items-center rounded-3xl bg-white ${compact ? 'gap-2 p-5' : 'gap-3 px-6 py-8'}`} testID={testID ?? 'empty-state'}>
      {icon ??
        (!!emoji && (
          <Text style={{ fontSize: compact ? 32 : 44, lineHeight: compact ? 40 : 54 }} accessibilityElementsHidden importantForAccessibility="no">
            {emoji}
          </Text>
        ))}
      <Text className="text-center text-[16px] font-bold leading-6 text-ink">{title}</Text>
      {!!message && <Text className="text-center text-[14px] leading-[21px] text-ink-muted">{message}</Text>}
      {!!action && (
        <Button className="mt-1 self-stretch" title={action.label} variant={action.variant ?? 'primary'} onPress={action.onPress} testID={action.testID} />
      )}
    </View>
  );
}
