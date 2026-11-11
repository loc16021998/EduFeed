import { Pressable, Text, View } from 'react-native';

interface StickyCtaProps {
  title: string;
  onPress: () => void;
  subtitle?: string;
}

/** Full-width orange action pinned under a scroll view. Place it as the last child of a flex-1 column. */
export default function StickyCta({ title, onPress, subtitle }: StickyCtaProps) {
  return (
    <View className="border-t border-slate-200 bg-white px-4 pb-3 pt-3">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        className="min-h-[56px] items-center justify-center rounded-2xl bg-accent-500 px-4 py-2.5 shadow-lg shadow-accent-600/30 active:bg-accent-600"
      >
        <Text className="text-center text-[14px] font-extrabold leading-5 text-white" numberOfLines={2}>
          {title}
        </Text>
      </Pressable>
      {!!subtitle && <Text className="mt-1.5 text-center text-[11px] text-ink-subtle">{subtitle}</Text>}
    </View>
  );
}
