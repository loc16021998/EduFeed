import { ChevronDown, Eye, Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { CURRICULUM, type CurriculumPhase } from '@/content/curriculum';
import type { CourseCategory } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS, COURSE_CATEGORIES } from '@/utils/constants';
import { isWeb } from '@/utils/platform';

// Layout transitions misplace rows on react-native-web (rows overlap following content).
const LAYOUT = isWeb ? undefined : LinearTransition.duration(220);

/** Course switcher + week-by-week accordion. One phase open at a time. */
export default function CurriculumAccordion({ initialCourse = 'TIEN_TIEU_HOC' }: { initialCourse?: CourseCategory }) {
  const [course, setCourse] = useState<CourseCategory>(initialCourse);
  const [open, setOpen] = useState<number | null>(0);
  const color = CATEGORY_COLORS[course];

  useEffect(() => setCourse(initialCourse), [initialCourse]);

  return (
    <View className="gap-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {COURSE_CATEGORIES.map((c) => {
          const active = c === course;
          return (
            <Pressable
              key={c}
              onPress={() => {
                setCourse(c);
                setOpen(0);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className="rounded-full border-2 px-3.5 py-1.5"
              style={{ borderColor: active ? CATEGORY_COLORS[c] : '#E2E8F0', backgroundColor: active ? `${CATEGORY_COLORS[c]}14` : '#fff' }}
            >
              <Text className="text-[13px] font-bold" style={{ color: active ? CATEGORY_COLORS[c] : COLORS.muted }}>
                {CATEGORY_LABELS[c]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Animated.View layout={LAYOUT} className="gap-2">
        {CURRICULUM[course].map((phase, i) => (
          <PhaseRow
            key={`${course}-${i}`}
            phase={phase}
            index={i}
            color={color}
            open={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function PhaseRow({
  phase,
  index,
  color,
  open,
  onToggle,
}: {
  phase: CurriculumPhase;
  index: number;
  color: string;
  open: boolean;
  onToggle: () => void;
}) {
  const rot = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    rot.value = withTiming(open ? 1 : 0, { duration: 200 });
  }, [open, rot]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value * 180}deg` }] }));

  return (
    <Animated.View layout={LAYOUT} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${phase.weeks}: ${phase.title}`}
        className="flex-row items-center gap-3 p-3.5 active:bg-slate-50"
      >
        <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1A` }}>
          <Text className="text-[13px] font-extrabold" style={{ color }}>
            {index + 1}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
            {phase.weeks}
          </Text>
          <Text className="text-[14px] font-bold text-ink">{phase.title}</Text>
        </View>
        <Animated.View style={chevron}>
          <ChevronDown size={18} color={COLORS.muted} />
        </Animated.View>
      </Pressable>

      {open && (
        <Animated.View entering={FadeIn.duration(200)} className="gap-3 px-3.5 pb-4">
          <View className="gap-1.5">
            <Text className="text-[12px] font-bold text-ink-muted">Con được học</Text>
            {phase.childLearns.map((l) => (
              <View key={l} className="flex-row gap-2">
                <Text style={{ color }}>•</Text>
                <Text className="flex-1 text-[13px] leading-[19px] text-ink">{l}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row gap-2 rounded-xl bg-brand-50 p-2.5">
            <Eye size={15} color={COLORS.brand} />
            <Text className="flex-1 text-[12px] leading-[18px] text-ink">
              <Text className="font-bold">Ba mẹ sẽ thấy: </Text>
              {phase.parentSees}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Trophy size={15} color="#F59E0B" />
            <Text className="text-[12px] font-semibold text-amber-700">{phase.milestone}</Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}
