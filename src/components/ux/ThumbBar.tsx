import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom action bar in the thumb zone: the screen's main actions stay reachable with one hand.
 * Place it as the last child of a flex-1 column (after the ScrollView).
 */
export default function ThumbBar({ children, testID }: { children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="gap-2 border-t border-slate-200 bg-white px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }} testID={testID ?? 'thumb-bar'}>
      {children}
    </View>
  );
}
