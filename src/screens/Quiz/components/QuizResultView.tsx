import Gradient from '@/components/media/Gradient';
import { CalendarCheck, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Avatar, Button } from '@/components';
import type { QuizResult } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { COURSES } from '@/utils/mockData';
import { FORMAT_INFO, teacherFor } from '@/utils/quiz';
import { nativeOnly } from '@/utils/platform';

interface QuizResultViewProps {
  result: QuizResult;
  onBook: () => void;
  onRetake: () => void;
}

export default function QuizResultView({ result, onBook, onRetake }: QuizResultViewProps) {
  const course = COURSES.find((c) => c.id === result.primary);
  const teacher = teacherFor(result.primary);
  const courses = [result.primary, result.secondary].filter(Boolean) as QuizResult['primary'][];
  const { summary } = result;

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
        {/* Recommendation card */}
        <Animated.View entering={nativeOnly(ZoomIn.springify().damping(14))}>
          <Gradient
            colors={['#2F6BFF', '#1A44B3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 20, gap: 12 }}
          >
            <View className="flex-row items-center gap-2">
              <Sparkles size={18} color="#FDE68A" />
              <Text className="text-xs font-bold uppercase tracking-widest text-brand-100">Gợi ý dành cho bé</Text>
              <View className="ml-auto rounded-full bg-white/20 px-2.5 py-1">
                <Text className="text-xs font-extrabold text-white">Phù hợp nhất</Text>
              </View>
            </View>

            <Text className="text-[22px] font-extrabold leading-7 text-white">Gợi ý: {result.title}</Text>
            <Text className="text-[13px] text-brand-100">{FORMAT_INFO[result.format].description}</Text>

            <View className="flex-row flex-wrap gap-1.5">
              {courses.map((c) => (
                <View key={c} className="rounded-full bg-white px-2.5 py-1">
                  <Text className="text-xs font-bold" style={{ color: CATEGORY_COLORS[c] }}>
                    {CATEGORY_LABELS[c]}
                  </Text>
                </View>
              ))}
            </View>

            {teacher && (
              <View className="flex-row items-center gap-2.5 rounded-2xl bg-white/10 p-2.5">
                <Avatar uri={teacher.avatarUrl} name={teacher.name} size={34} />
                <View className="flex-1">
                  <Text className="text-[13px] font-bold text-white">{teacher.name} phụ trách</Text>
                  <Text className="text-[11px] text-brand-100" numberOfLines={1}>
                    {course?.schedule}
                  </Text>
                </View>
              </View>
            )}
          </Gradient>
        </Animated.View>

        {/* Why */}
        <Animated.View entering={nativeOnly(FadeInDown.delay(150))} className="gap-2.5 rounded-3xl bg-white p-4">
          <Text className="text-[15px] font-bold text-ink">Vì sao phù hợp với bé?</Text>
          {result.reasons.map((r) => (
            <View key={r} className="flex-row gap-2">
              <CheckCircle2 size={18} color="#10B981" />
              <Text className="flex-1 text-[14px] leading-5 text-ink">{r}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Answer summary (this is what gets attached to the booking) */}
        <Animated.View entering={nativeOnly(FadeInDown.delay(260))} className="gap-2 rounded-3xl bg-white p-4">
          <View className="flex-row items-center">
            <Text className="text-[15px] font-bold text-ink">Tóm tắt chẩn đoán</Text>
            <Pressable onPress={onRetake} hitSlop={8} className="ml-auto flex-row items-center gap-1" accessibilityRole="button">
              <RotateCcw size={13} color={COLORS.brand} />
              <Text className="text-xs font-semibold text-brand-600">Làm lại</Text>
            </Pressable>
          </View>
          <SummaryRow k="Độ tuổi" v={summary.ageGroup} />
          <SummaryRow k="Khó khăn" v={summary.painPoints.join(' · ')} />
          <SummaryRow k="Mong muốn" v={summary.goal} />
        </Animated.View>
      </ScrollView>

      <Animated.View entering={nativeOnly(FadeInDown.delay(380))} className="gap-1.5 pt-2">
        <Button
          title="Đặt lịch học thử lớp này"
          variant="accent"
          size="lg"
          icon={<CalendarCheck size={20} color="#fff" />}
          onPress={onBook}
        />
        <Text className="text-center text-[11px] text-ink-subtle">
          Kết quả chẩn đoán sẽ được gửi kèm để giáo viên chuẩn bị buổi học thử
        </Text>
      </Animated.View>
    </View>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row gap-3">
      <Text className="w-20 text-[13px] text-ink-muted">{k}</Text>
      <Text className="flex-1 text-[13px] font-semibold text-ink">{v || '—'}</Text>
    </View>
  );
}
