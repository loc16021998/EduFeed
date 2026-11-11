import { CalendarClock, GraduationCap, MapPin } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Avatar, Badge, Card } from '@/components';
import type { Campus, PortfolioItem } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';

interface StudentInfoCardProps {
  student: PortfolioItem;
  campus?: Campus;
}

export default function StudentInfoCard({ student, campus }: StudentInfoCardProps) {
  const color = CATEGORY_COLORS[student.course];

  return (
    <Card className="flex-row gap-3.5 p-4">
      <Avatar name={student.studentName} size={56} />
      <View className="flex-1 gap-1.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-shrink text-xl font-extrabold text-ink" numberOfLines={1}>
            {student.displayName}
          </Text>
          <Badge label={CATEGORY_LABELS[student.course]} color={color} />
        </View>

        <InfoRow icon={<GraduationCap size={14} color={COLORS.muted} />} text={student.className} />
        <InfoRow icon={<CalendarClock size={14} color={COLORS.muted} />} text={`Đã học ${student.duration}`} />
        {campus && <InfoRow icon={<MapPin size={14} color={COLORS.muted} />} text={`${campus.name} · ${campus.address}`} />}
      </View>
    </Card>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="flex-row items-start gap-1.5">
      <View className="mt-0.5">{icon}</View>
      <Text className="flex-1 text-[13px] leading-[18px] text-ink-muted">{text}</Text>
    </View>
  );
}
