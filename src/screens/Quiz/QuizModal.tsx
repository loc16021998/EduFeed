import { ChevronLeft, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeOut, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components';
import type { RootStackScreenProps } from '@/navigation/types';
import { QUIZ_TOTAL_STEPS, selectCanContinue, useQuizStore } from '@/store/useQuizStore';
import { COLORS } from '@/utils/constants';
import { isWeb } from '@/utils/platform';
import { QUIZ_QUESTIONS } from '@/utils/mockData';

import QuizOptionCard from './components/QuizOptionCard';
import QuizProgress from './components/QuizProgress';
import QuizResultView from './components/QuizResultView';

/** Delay before auto-advancing on single-select, so the parent sees their tap register. */
const AUTO_ADVANCE_MS = 320;

export default function QuizModal({ navigation }: RootStackScreenProps<'QuizModal'>) {
  const insets = useSafeAreaInsets();
  const { step, direction, answers, result, selectOption, next, back, reset } = useQuizStore();
  const canContinue = useQuizStore(selectCanContinue);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const question = QUIZ_QUESTIONS[step];
  const selected = answers[question.id] ?? [];

  const onSelect = (optionId: string) => {
    selectOption(question.id, optionId);
    if (question.mode === 'single') {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(next, AUTO_ADVANCE_MS);
    }
  };

  const onBack = () => {
    clearTimeout(advanceTimer.current);
    back();
  };

  const onBook = () => {
    if (!result) return;
    // Navigating to an existing route below the modal pops the modal.
    navigation.navigate('MainTabs', { screen: 'Booking', params: { course: result.primary, fromQuiz: true } });
  };

  const showBack = !!result || step > 0;
  // Directional slide in; a quick fade out keeps it correct regardless of direction.
  const entering = (direction === 1 ? SlideInRight : SlideInLeft).springify().damping(20).mass(0.7);

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: insets.top || 12, paddingBottom: insets.bottom + 12 }}>
      {/* Top bar */}
      <View className="h-12 flex-row items-center justify-between px-3">
        <IconBtn label="Quay lại" onPress={onBack} hidden={!showBack}>
          <ChevronLeft size={24} color={COLORS.ink} />
        </IconBtn>
        <Text className="text-[15px] font-bold text-ink">Kiểm tra nhanh 30 giây</Text>
        <IconBtn label="Đóng" onPress={() => navigation.goBack()}>
          <X size={22} color={COLORS.ink} />
        </IconBtn>
      </View>

      <View className="flex-1 gap-5 px-5 pt-2">
        <QuizProgress step={step} total={QUIZ_TOTAL_STEPS} done={!!result} />

        <View className="flex-1 overflow-hidden">
          {result ? (
            <Animated.View key="result" entering={entering} exiting={isWeb ? undefined : FadeOut.duration(120)} className="flex-1">
              <QuizResultView result={result} onBook={onBook} onRetake={reset} />
            </Animated.View>
          ) : (
            <Animated.View key={question.id} entering={entering} exiting={isWeb ? undefined : FadeOut.duration(120)} className="flex-1 gap-5">
              <View className="gap-1.5">
                <Text className="text-[22px] font-extrabold leading-8 text-ink">{question.question}</Text>
                <Text className="text-[13px] text-ink-muted">
                  {question.mode === 'multi' ? 'Có thể chọn nhiều đáp án' : 'Chọn 1 đáp án'}
                </Text>
              </View>

              <View className="gap-2.5">
                {question.options.map((o) => (
                  <QuizOptionCard
                    key={o.id}
                    option={o}
                    mode={question.mode}
                    selected={selected.includes(o.id)}
                    onPress={() => onSelect(o.id)}
                  />
                ))}
              </View>

              {/* Multi-select needs an explicit confirm; single-select auto-advances. */}
              {question.mode === 'multi' && (
                <View className="mt-auto">
                  <Button
                    title={canContinue ? `Tiếp tục (${selected.length} đã chọn)` : 'Chọn ít nhất 1 khó khăn'}
                    size="lg"
                    disabled={!canContinue}
                    onPress={next}
                  />
                </View>
              )}
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

function IconBtn({
  label,
  onPress,
  hidden,
  children,
}: {
  label: string;
  onPress: () => void;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={hidden}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      className={`h-10 w-10 items-center justify-center rounded-full active:bg-slate-200 ${hidden ? 'opacity-0' : ''}`}
    >
      {children}
    </Pressable>
  );
}
