import { ChevronDown } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { COLORS } from '@/utils/constants';

export interface DisclosureProps {
  title: string;
  /** Short hint shown next to the title while closed, e.g. "Không bắt buộc". */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  testID?: string;
}

/** Progressive disclosure: optional / advanced fields stay folded behind one large tappable row. */
export default function Disclosure({ title, hint, defaultOpen = false, children, testID }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className="gap-2" testID={testID}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        className="min-h-12 flex-row items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 active:bg-slate-50"
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Text className="flex-1 text-[14px] font-semibold text-brand-600">{title}</Text>
        {!!hint && !open && <Text className="text-xs text-ink-subtle">{hint}</Text>}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={18} color={COLORS.brand} />
        </View>
      </Pressable>
      {open && children}
    </View>
  );
}
