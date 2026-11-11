import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface QuizProgressProps {
  /** 0-based current step. */
  step: number;
  total: number;
  /** All steps finished (result screen). */
  done?: boolean;
}

const ENCOURAGEMENT = ['Bắt đầu thôi! ⏱ chỉ 30 giây', 'Tuyệt vời! Sắp xong rồi 💪', 'Câu cuối cùng! 🎯'];

export default function QuizProgress({ step, total, done = false }: QuizProgressProps) {
  return (
    <View className="gap-2" accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step + 1 }}>
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[15px] font-extrabold text-brand-600">
          {done ? 'Hoàn thành!' : `Bước ${step + 1}/${total}`}
        </Text>
        <Text className="text-xs font-medium text-ink-muted">
          {done ? 'Kết quả đã sẵn sàng 🎉' : ENCOURAGEMENT[Math.min(step, ENCOURAGEMENT.length - 1)]}
        </Text>
      </View>
      <View className="flex-row gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <Segment key={i} filled={done || i <= step} />
        ))}
      </View>
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const p = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    p.value = withTiming(filled ? 1 : 0, { duration: 350 });
  }, [filled, p]);

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  return (
    <View className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
      <Animated.View style={[{ height: '100%', borderRadius: 999, backgroundColor: '#2F6BFF' }, fill]} />
    </View>
  );
}
