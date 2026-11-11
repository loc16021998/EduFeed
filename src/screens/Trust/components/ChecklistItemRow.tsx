import { Check, Lightbulb } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import type { ChecklistItem } from '@/content/checklists';
import { haptics } from '@/utils/haptics';

interface Props {
  item: ChecklistItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

function ChecklistItemRow({ item, checked, onToggle }: Props) {
  const [showTip, setShowTip] = useState(false);
  const scale = useSharedValue(1);
  const fill = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(checked ? 1 : 0, { duration: 180 });
  }, [checked, fill]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: fill.value > 0.5 ? '#10B981' : '#FFFFFF',
    borderColor: fill.value > 0.5 ? '#10B981' : '#CBD5E1',
  }));

  const onPress = () => {
    // Satisfying "pop" on check, subtle on uncheck.
    scale.value = withSequence(withTiming(checked ? 0.9 : 1.25, { duration: 90 }), withSpring(1, { damping: 8 }));
    (checked ? haptics.light : haptics.medium)();
    onToggle(item.id);
  };

  return (
    <View className="gap-2 rounded-2xl bg-white p-3.5">
      <View className="flex-row items-start gap-3">
        <Pressable
          onPress={onPress}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={item.label}
          className="flex-1 flex-row items-start gap-3"
        >
          <Animated.View style={[{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, boxStyle]}>
            {checked && <Check size={15} color="#fff" strokeWidth={3.5} />}
          </Animated.View>
          <Text className={`flex-1 text-[14px] leading-5 ${checked ? 'text-ink-subtle line-through' : 'text-ink'}`}>{item.label}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowTip((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={showTip ? 'Ẩn gợi ý' : 'Xem gợi ý'}
          accessibilityState={{ expanded: showTip }}
          className={`h-7 w-7 items-center justify-center rounded-full ${showTip ? 'bg-amber-100' : ''}`}
        >
          <Lightbulb size={16} color={showTip ? '#D97706' : '#94A3B8'} />
        </Pressable>
      </View>
      {showTip && (
        <Animated.View entering={FadeIn.duration(180)} className="ml-9 rounded-xl bg-amber-50 p-2.5">
          <Text className="text-[12px] leading-[18px] text-amber-900">💡 {item.tip}</Text>
        </Animated.View>
      )}
    </View>
  );
}

export default memo(ChecklistItemRow);
