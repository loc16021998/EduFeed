import { CalendarCheck2, Flame, Lightbulb, Quote, Share2, Sparkles } from 'lucide-react-native';
import { Image, Pressable, Text, View } from 'react-native';

import { todayIso, type WeeklyReport } from '@/services/weeklyReportService';
import { COLORS } from '@/utils/constants';

import { firstName, skillLabels, skillLevel, weekLabel, type SkillScores } from '../../supabase/functions/_shared/weeklyReport';

const SKILL_ORDER: (keyof SkillScores)[] = ['focus', 'handwritingOrLogic', 'confidence', 'homePractice'];
const BAR: Record<keyof SkillScores, string> = {
  focus: '#1278BE',
  handwritingOrLogic: '#8CC43F',
  confidence: '#8B5CF6',
  homePractice: '#EA580C',
};

interface Props {
  report: WeeklyReport;
  studentName: string;
  /** Signed / full URLs of report.media (resolved by the screen). */
  photos?: string[];
  onPhotoPress?: (index: number) => void;
  /** Hidden when not given (teacher preview). */
  onShare?: () => void;
  /** "Bản nháp" ribbon for the teacher preview. */
  draft?: boolean;
  testID?: string;
}

/**
 * The weekly digest as one card: KPI strip (chuyên cần, chuỗi luyện tập), skill bars in words, highlights,
 * the photo of the week, the teacher's quote and 5-minute home tips. Same card for parents and the teacher preview.
 */
export default function WeeklyProgressCard({ report, studentName, photos = [], onPhotoPress, onShare, draft, testID = 'weekly-card' }: Props) {
  const name = firstName(studentName);
  const a = report.attendance;
  const labels = skillLabels(report.courses);
  const skills = SKILL_ORDER.filter((k) => report.skills[k] !== null);
  const noClass = a.totalSessions === 0;
  // Teacher preview mid-week: no sessions YET is not a holiday.
  const inProgress = !report.publishedAt && todayIso() < report.weekEnd;

  return (
    <View className="gap-4 overflow-hidden rounded-3xl bg-white p-4" testID={testID}>
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-wide text-brand-600">Tuần {weekLabel(report.weekStart)}</Text>
          <Text className="text-[18px] font-extrabold leading-6 text-ink">Tuần học của {name}</Text>
        </View>
        {draft && (
          <View className="rounded-full bg-amber-100 px-2.5 py-1">
            <Text className="text-[11px] font-bold text-amber-800">Bản nháp</Text>
          </View>
        )}
      </View>

      {/* KPI strip */}
      <View className="flex-row gap-2.5" testID="weekly-kpis">
        <View className="flex-1 gap-1 rounded-2xl bg-brand-50 p-3">
          <View className="flex-row items-center gap-1.5">
            <CalendarCheck2 size={16} color={COLORS.brand} />
            <Text className="text-xs font-semibold text-brand-700">Chuyên cần</Text>
          </View>
          <Text className="text-[20px] font-extrabold text-ink" testID="weekly-attendance">
            {noClass ? (inProgress ? 'Chưa có buổi' : 'Lớp nghỉ') : `${a.attendedCount}/${a.totalSessions} buổi`}
          </Text>
          <Text className="text-[11px] leading-4 text-ink-muted">
            {noClass ? (inProgress ? 'Tuần học đang diễn ra' : 'Tuần này không có buổi học') : a.onTimeCount === a.attendedCount && a.attendedCount > 0 ? 'Đúng giờ tất cả các buổi' : a.excusedCount > 0 ? `${a.excusedCount} buổi nghỉ có phép` : `${a.onTimeCount} buổi đúng giờ`}
          </Text>
        </View>
        <View className="flex-1 gap-1 rounded-2xl bg-orange-50 p-3">
          <View className="flex-row items-center gap-1.5">
            <Flame size={16} color="#EA580C" />
            <Text className="text-xs font-semibold text-orange-700">Luyện tập tại nhà</Text>
          </View>
          <Text className="text-[20px] font-extrabold text-ink" testID="weekly-streak">
            {report.habit.streak >= 2 ? `${report.habit.streak} ngày` : `${report.habit.daysPracticed}/7 ngày`}
          </Text>
          <Text className="text-[11px] leading-4 text-ink-muted">
            {report.habit.streak >= 2 ? 'liên tiếp — giỏi lắm!' : report.habit.daysPracticed > 0 ? 'đã luyện trong tuần' : 'Cùng con bắt đầu thử thách nhé'}
          </Text>
        </View>
      </View>

      {/* Skills, in words */}
      {skills.length > 0 && (
        <View className="gap-2.5" testID="weekly-skills">
          {skills.map((k) => {
            const v = report.skills[k] as number;
            return (
              <View key={k} className="gap-1" testID={`skill-${k}`}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-semibold text-ink">{labels[k]}</Text>
                  <Text className="text-xs font-bold text-ink-muted">{skillLevel(v)}</Text>
                </View>
                <View className="h-2.5 overflow-hidden rounded-full bg-slate-100" accessibilityRole="progressbar" accessibilityLabel={`${labels[k]}: ${skillLevel(v)}`}>
                  <View className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: BAR[k] }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Highlights */}
      {report.highlights.length > 0 && (
        <View className="gap-2 rounded-2xl bg-emerald-50 p-3" testID="weekly-highlights">
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={16} color="#047857" />
            <Text className="text-[13px] font-bold text-emerald-800">Điểm sáng của {name}</Text>
          </View>
          {report.highlights.map((h, i) => (
            <Text key={i} className="text-[14px] leading-5 text-ink">
              ✨ {h}
            </Text>
          ))}
        </View>
      )}

      {/* Notebook snapshot */}
      {photos.length > 0 && (
        <View className="gap-1.5" testID="weekly-photos">
          <Text className="text-[13px] font-bold text-ink">Trang vở của tuần</Text>
          <View className="flex-row gap-2">
            {photos.slice(0, 2).map((u, i) => (
              <Pressable key={u} onPress={() => onPhotoPress?.(i)} accessibilityRole="imagebutton" accessibilityLabel={`Ảnh bài vở ${i + 1}`} className="flex-1 overflow-hidden rounded-2xl bg-slate-100">
                <Image source={{ uri: u }} style={{ width: '100%', aspectRatio: photos.length > 1 ? 3 / 4 : 4 / 3 }} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Teacher quote */}
      {!!report.teacherNote && (
        <View className="flex-row gap-2.5 rounded-2xl bg-slate-50 p-3" testID="weekly-teacher-note">
          <Quote size={18} color={COLORS.brand} />
          <View className="flex-1 gap-1">
            <Text className="text-[14px] italic leading-5 text-ink">{report.teacherNote}</Text>
            {!!report.teacherName && <Text className="text-xs font-bold text-brand-700">— {report.teacherName}</Text>}
          </View>
        </View>
      )}

      {/* 5-minute tips */}
      {report.tips.length > 0 && (
        <View className="gap-2" testID="weekly-tips">
          <View className="flex-row items-center gap-1.5">
            <Lightbulb size={16} color="#B45309" />
            <Text className="text-[13px] font-bold text-ink">5 phút luyện cùng con ở nhà</Text>
          </View>
          {report.tips.map((t, i) => (
            <View key={i} className="flex-row gap-2">
              <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-amber-100">
                <Text className="text-[11px] font-extrabold text-amber-800">{i + 1}</Text>
              </View>
              <Text className="flex-1 text-[14px] leading-5 text-ink">{t}</Text>
            </View>
          ))}
        </View>
      )}

      {!!onShare && (
        <Pressable onPress={onShare} accessibilityRole="button" className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-accent-500 px-4 active:bg-accent-600" testID="share-weekly">
          <Share2 size={18} color="#fff" />
          <Text className="text-[15px] font-bold text-white">Chia sẻ thành tích của con</Text>
        </Pressable>
      )}
    </View>
  );
}
