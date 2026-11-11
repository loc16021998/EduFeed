import { ChevronRight } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';

interface CtaBarProps {
  text: string;
  onPress: () => void;
  /** Gentle pulse to draw the eye — only run on the active card. */
  pulse?: boolean;
}

export default function CtaBar({ text, onPress, pulse = false }: CtaBarProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.03, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.delay(1200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={text}
        className="h-12 flex-row items-center justify-center gap-1 rounded-2xl bg-accent-500 px-3 shadow-lg shadow-accent-600/40 active:bg-accent-600"
      >
        <Text className="flex-shrink text-[13px] font-extrabold tracking-tight text-white" numberOfLines={1} adjustsFontSizeToFit>
          {text}
        </Text>
        <ChevronRight size={18} color="#fff" strokeWidth={3} />
      </Pressable>
    </Animated.View>
  );
}
