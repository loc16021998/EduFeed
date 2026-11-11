import { RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button, HeaderIconButton, ScreenHeader, SuccessBurst } from '@/components';
import { checklistItemCount, getChecklist } from '@/content/checklists';
import type { RootStackScreenProps } from '@/navigation/types';
import { useChecklistStore } from '@/store/useChecklistStore';
import { CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';
import { confirmAsync, nativeOnly } from '@/utils/platform';

import ChecklistItemRow from './components/ChecklistItemRow';

const EMPTY: string[] = [];

export default function ChecklistScreen({ navigation, route }: RootStackScreenProps<'Checklist'>) {
  const checklist = getChecklist(route.params.id);
  const checked = useChecklistStore((s) => s.checked[route.params.id] ?? EMPTY);
  const completedAt = useChecklistStore((s) => s.completedAt[route.params.id]);
  const { toggle, markCompleted, reset } = useChecklistStore();

  const total = checklist ? checklistItemCount(checklist) : 0;
  const done = checked.length;
  const allDone = total > 0 && done >= total;

  // Celebrate only the moment the last box is ticked in this visit (not on every re-open).
  const wasDone = useRef(allDone);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (allDone && !wasDone.current) {
      setJustCompleted(true);
      markCompleted(route.params.id);
      haptics.success();
    }
    if (!allDone) setJustCompleted(false);
    wasDone.current = allDone;
  }, [allDone, markCompleted, route.params.id]);

  const progress = useSharedValue(total ? done / total : 0);
  useEffect(() => {
    progress.value = withTiming(total ? done / total : 0, { duration: 350 });
  }, [done, total, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const onToggle = useCallback((itemId: string) => toggle(route.params.id, itemId), [toggle, route.params.id]);

  if (!checklist) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <Text className="text-ink-muted">Không tìm thấy checklist.</Text>
      </View>
    );
  }

  const confirmReset = async () => {
    if (await confirmAsync('Làm lại checklist?', 'Toàn bộ dấu tích sẽ được xóa.', 'Làm lại')) reset(checklist.id);
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Checklist cho ba mẹ"
        onBack={() => navigation.goBack()}
        right={
          done > 0 ? (
            <HeaderIconButton label="Làm lại" onPress={confirmReset}>
              <RotateCcw size={20} color={COLORS.ink} />
            </HeaderIconButton>
          ) : undefined
        }
      />

      <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-1">
        {/* Progress header */}
        <View className="gap-3 rounded-3xl bg-white p-4">
          <View className="flex-row items-center gap-3">
            <Text className="text-4xl">{checklist.emoji}</Text>
            <Text className="flex-1 text-[17px] font-extrabold leading-6 text-ink">{checklist.title}</Text>
          </View>
          <View className="flex-row items-baseline justify-between">
            <Text className="text-[13px] text-ink-muted">
              Đã chuẩn bị <Text className="font-extrabold text-emerald-600">{done}</Text>/{total} việc
            </Text>
            <Text className="text-[13px] font-bold text-emerald-600">{Math.round((done / total) * 100)}%</Text>
          </View>
          <View
            className="h-3 overflow-hidden rounded-full bg-slate-100"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: total, now: done }}
          >
            <Animated.View style={[{ height: '100%', borderRadius: 999, backgroundColor: '#10B981' }, barStyle]} />
          </View>
          <Text className="text-[12px] text-ink-subtle">Tiến độ được lưu trên máy của ba mẹ.</Text>
        </View>

        {/* Completion */}
        {allDone && (
          <Animated.View entering={nativeOnly(FadeInDown)} className="items-center gap-2 rounded-3xl bg-emerald-50 p-4">
            {justCompleted && <SuccessBurst size={56} />}
            <Text className="text-center text-[16px] font-extrabold text-emerald-800">Tuyệt vời! Con đã sẵn sàng 🎉</Text>
            <Text className="text-center text-[13px] leading-5 text-emerald-900">
              Ba mẹ đã chuẩn bị rất chu đáo. Nếu muốn con làm quen trước với nề nếp lớp học, TH EDU có buổi trải nghiệm miễn phí
              lớp {CATEGORY_LABELS[checklist.relatedCourse]}.
            </Text>
            <Button
              title="Xem buổi trải nghiệm miễn phí"
              variant="outline"
              size="sm"
              onPress={() => navigation.navigate('MainTabs', { screen: 'Booking', params: { course: checklist.relatedCourse } })}
            />
            {!!completedAt && !justCompleted && (
              <Text className="text-[11px] text-emerald-700">Hoàn thành ngày {new Date(completedAt).toLocaleDateString('vi-VN')}</Text>
            )}
          </Animated.View>
        )}

        {checklist.groups.map((g) => {
          const groupDone = g.items.filter((i) => checked.includes(i.id)).length;
          return (
            <View key={g.title} className="gap-2">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg">{g.emoji}</Text>
                <Text className="flex-1 text-[15px] font-bold text-ink" accessibilityRole="header">
                  {g.title}
                </Text>
                <Text className={`text-[12px] font-bold ${groupDone === g.items.length ? 'text-emerald-600' : 'text-ink-subtle'}`}>
                  {groupDone}/{g.items.length}
                </Text>
              </View>
              {g.items.map((item) => (
                <ChecklistItemRow key={item.id} item={item} checked={checked.includes(item.id)} onToggle={onToggle} />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
