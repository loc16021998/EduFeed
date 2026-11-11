import { Quote, TrendingUp } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Avatar, Card } from '@/components';
import type { PortfolioItem, SkillAssessment } from '@/types';
import { COLORS } from '@/utils/constants';

const LEVEL_TEXT = ['', 'Cần cố gắng', 'Đang tiến bộ', 'Khá', 'Tốt', 'Xuất sắc'] as const;

export default function TeacherFeedbackCard({ student, accent }: { student: PortfolioItem; accent: string }) {
  return (
    <Card className="gap-4 p-4">
      {/* Teacher */}
      <View className="flex-row items-center gap-3">
        <Avatar uri={student.teacherAvatar} name={student.teacherName} size={44} />
        <View className="flex-1">
          <Text className="text-base font-bold text-ink">{student.teacherName}</Text>
          <Text className="text-xs text-ink-muted">Giáo viên phụ trách · TH EDU</Text>
        </View>
      </View>

      {/* Quote */}
      <View className="flex-row gap-2.5 rounded-2xl bg-brand-50 p-3.5">
        <Quote size={18} color={COLORS.brand} fill={COLORS.brand} />
        <Text className="flex-1 text-[15px] italic leading-[22px] text-ink">{student.teacherNote}</Text>
      </View>

      {/* Qualitative assessment */}
      <View className="gap-3">
        <View className="flex-row items-center gap-1.5">
          <TrendingUp size={16} color={accent} />
          <Text className="text-sm font-bold text-ink">Đánh giá năng lực</Text>
          <Text className="ml-auto text-[11px] text-ink-subtle">Trước → Hiện tại</Text>
        </View>
        {student.assessments.map((a) => (
          <SkillRow key={a.skill} a={a} accent={accent} />
        ))}
      </View>
    </Card>
  );
}

function SkillRow({ a, accent }: { a: SkillAssessment; accent: string }) {
  return (
    <View
      className="gap-1.5"
      accessible
      accessibilityLabel={`${a.skill}: trước ${LEVEL_TEXT[a.before]}, hiện tại ${LEVEL_TEXT[a.after]}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-medium text-ink">{a.skill}</Text>
        <Text className="text-[12px] font-semibold" style={{ color: accent }}>
          {LEVEL_TEXT[a.after]}
        </Text>
      </View>
      {/* 5 segments: grey = before level, accent = gained since */}
      <View className="flex-row gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <View
            key={n}
            className="h-2 flex-1 rounded-full"
            style={{ backgroundColor: n <= a.before ? '#94A3B8' : n <= a.after ? accent : '#E2E8F0' }}
          />
        ))}
      </View>
    </View>
  );
}
