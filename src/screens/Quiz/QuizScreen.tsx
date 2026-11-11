import { ArrowRight, Clock, Gift, Sparkles } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import { Button, Card } from '@/components';
import ChecklistEntryCard from '@/screens/Trust/components/ChecklistEntryCard';
import type { TabScreenProps } from '@/navigation/types';
import { useQuizStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { QUIZ_QUESTIONS } from '@/utils/mockData';

/** Quiz tab landing — the actual quiz runs in QuizModal. */
export default function QuizScreen({ navigation }: TabScreenProps<'Quiz'>) {
  const result = useQuizStore((s) => s.result);
  const reset = useQuizStore((s) => s.reset);

  const start = () => {
    reset();
    navigation.navigate('QuizModal');
  };

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerClassName="gap-5 p-5">
      <View className="items-center gap-3 rounded-3xl bg-brand-500 px-6 py-8">
        <Text className="text-5xl">🧩</Text>
        <Text className="text-center text-2xl font-extrabold text-white">Hiểu con trong 30 giây</Text>
        <Text className="text-center text-[14px] leading-5 text-brand-100">
          Trả lời 3 câu hỏi nhanh để nhận gợi ý khóa học phù hợp nhất với độ tuổi & khó khăn của bé.
        </Text>
        <View className="flex-row gap-4">
          <Meta icon={<Clock size={14} color="#DCE7FF" />} text="30 giây" />
          <Meta icon={<Sparkles size={14} color="#DCE7FF" />} text="3 bước" />
          <Meta icon={<Gift size={14} color="#DCE7FF" />} text="Miễn phí" />
        </View>
      </View>

      <View className="gap-2.5">
        {QUIZ_QUESTIONS.map((q, i) => (
          <View key={q.id} className="flex-row items-center gap-3">
            <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-100">
              <Text className="font-extrabold text-brand-700">{i + 1}</Text>
            </View>
            <Text className="flex-1 text-[14px] text-ink">{q.question}</Text>
          </View>
        ))}
      </View>

      {result && (
        <Card className="gap-2 p-4" onPress={() => navigation.navigate('QuizModal')}>
          <Text className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">Kết quả gần nhất</Text>
          <Text className="text-[16px] font-bold text-ink">{result.title}</Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-[13px] font-semibold text-brand-600">Xem lại kết quả</Text>
            <ArrowRight size={14} color={COLORS.brand} />
          </View>
        </Card>
      )}

      <View className="gap-2.5">
        <Text className="text-[13px] font-bold uppercase tracking-wider text-ink-subtle">Công cụ cho ba mẹ</Text>
        <ChecklistEntryCard checklistId="vao-lop-1" />
        <Card className="flex-row items-center gap-3 p-4" onPress={() => navigation.navigate('Testimonials')}>
          <Text className="text-2xl">💬</Text>
          <View className="flex-1">
            <Text className="text-[14px] font-bold text-ink">Góc Phụ huynh</Text>
            <Text className="text-[12px] text-ink-muted">Cảm nhận phụ huynh & lộ trình học từng tuần</Text>
          </View>
          <ArrowRight size={16} color={COLORS.brand} />
        </Card>
      </View>

      <Button title={result ? 'Làm lại bài kiểm tra' : 'Bắt đầu ngay'} variant="accent" size="lg" onPress={start} />
    </ScrollView>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="flex-row items-center gap-1">
      {icon}
      <Text className="text-xs font-semibold text-brand-100">{text}</Text>
    </View>
  );
}
