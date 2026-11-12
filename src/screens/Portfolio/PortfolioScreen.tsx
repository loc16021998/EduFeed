import { useIsFocused } from '@react-navigation/native';
import { ChevronRight, Share2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { HeaderIconButton, InteractiveSlider, PortfolioSkeleton, ScreenHeader, StickyCta, TrustBadges } from '@/components';
import { hasSupabase } from '@/config/env';
import type { TabScreenProps } from '@/navigation/types';
import { fetchPortfolios } from '@/services/portfolio';
import { useParentClubStore } from '@/store';
import type { AsyncStatus, CourseCategory, PortfolioItem } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { CAMPUSES } from '@/utils/mockData';
import { shareText, useAppWidth } from '@/utils/platform';

import StudentInfoCard from './components/StudentInfoCard';
import StudentPicker from './components/StudentPicker';
import SubjectFilter from './components/SubjectFilter';
import TeacherFeedbackCard from './components/TeacherFeedbackCard';

const SUBJECTS: CourseCategory[] = ['LUYEN_CHU_DEP', 'TOAN_TU_DUY', 'TIEN_TIEU_HOC'];

const CTA_TITLE = '📅 ĐẶT LỊCH ĐÁNH GIÁ NÉT CHỮ / NĂNG LỰC CHO CON (MIỄN PHÍ)';

export default function PortfolioScreen({ navigation, route }: TabScreenProps<'Portfolio'>) {
  const isFocused = useIsFocused();
  const deepLinkId = route.params?.itemId;

  const width = useAppWidth();
  const [subject, setSubject] = useState<CourseCategory>('LUYEN_CHU_DEP');
  // Published + parent-consented portfolios from the server; sample data only without Supabase (labelled).
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const load = useCallback(() => {
    setStatus('loading');
    fetchPortfolios().then(
      (list) => {
        setItems(list);
        setStatus('success');
      },
      () => setStatus('error'),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const students = useMemo(() => items.filter((p) => p.course === subject), [items, subject]);
  const [studentId, setStudentId] = useState('');

  // Deep link (thedu://portfolio/p-003) → jump to that student's subject + profile.
  useEffect(() => {
    const target = items.find((p) => p.id === deepLinkId);
    if (target) {
      setSubject(target.course);
      setStudentId(target.id);
    }
  }, [deepLinkId, items]);

  const onChangeSubject = (c: CourseCategory) => {
    setSubject(c);
    setStudentId(items.find((p) => p.course === c)?.id ?? '');
  };

  // CLB Phụ huynh: dragging all the way to the "after" image earns "Nhìn Thấy Tiến Bộ".
  const markRevealed = useParentClubStore((s) => s.markProgressRevealed);

  const student = students.find((s) => s.id === studentId) ?? students[0];
  const campus = CAMPUSES.find((c) => c.id === student?.campusLocation);
  const accent = student ? CATEGORY_COLORS[student.course] : COLORS.brand;

  const onShare = () => {
    if (!student) return;
    shareText(
        `✨ ${student.displayName} đã tiến bộ vượt bậc sau ${student.duration} học ` +
        `${CATEGORY_LABELS[student.course]} tại TH EDU (${campus?.name ?? ''})!\n` +
        `"${student.teacherNote}" – ${student.teacherName}\n` +
        `Đặt lịch đánh giá miễn phí cho con: thedu://booking?course=${student.course}`,
    );
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'));

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Nhật ký Tiến bộ Học sinh"
        onBack={goBack}
        right={
          <HeaderIconButton label="Chia sẻ" onPress={onShare}>
            <Share2 size={22} color={COLORS.ink} />
          </HeaderIconButton>
        }
      />

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-6 pt-1">
        <SubjectFilter options={SUBJECTS} value={subject} onChange={onChangeSubject} />

        {!hasSupabase && status === 'success' && items.length > 0 && (
          <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
            Dữ liệu mẫu (chưa kết nối Supabase): học sinh minh họa, không phải học sinh thật.
          </Text>
        )}

        {status === 'loading' || status === 'idle' ? (
          <PortfolioSkeleton imageHeight={Math.round((width - 32) * (4 / 3))} />
        ) : status === 'error' ? (
          <View className="mt-8 items-center gap-3">
            <Text className="text-center text-ink-muted">Không tải được nhật ký tiến bộ. Kiểm tra mạng rồi thử lại.</Text>
            <Pressable onPress={load} accessibilityRole="button" className="rounded-full border border-slate-200 bg-white px-5 py-2">
              <Text className="font-semibold text-ink">Thử lại</Text>
            </Pressable>
          </View>
        ) : student ? (
          <>
            {students.length > 1 && (
              <StudentPicker students={students} selectedId={student.id} onSelect={setStudentId} accent={accent} />
            )}

            <StudentInfoCard student={student} campus={campus} />

            <View className="gap-2">
              <InteractiveSlider
                beforeUri={student.beforeImageUrl}
                afterUri={student.afterImageUrl}
                beforeLabel={student.beforeLabel}
                afterLabel={student.afterLabel}
                beforeCaption="TRƯỚC KHI HỌC · Ngày 1"
                afterCaption={`SAU ${student.duration.toUpperCase()} · Hiện tại`}
                showHint={isFocused}
                onFullReveal={() => markRevealed(student.id)}
              />
              <Text className="text-center text-xs text-ink-subtle">
                ◀ Kéo hết sang trái để xem trọn tiến bộ của con ▶
              </Text>
            </View>

            <TeacherFeedbackCard student={student} accent={accent} />

            <TrustBadges />

            <Pressable
              onPress={() => navigation.navigate('Testimonials', { course: student.course })}
              accessibilityRole="link"
              className="flex-row items-center gap-3 rounded-3xl border border-pink-100 bg-pink-50 p-4 active:opacity-90"
            >
              <Text className="text-2xl">💌</Text>
              <View className="flex-1">
                <Text className="text-[14px] font-bold text-ink">Thư cảm ơn & video của phụ huynh</Text>
                <Text className="text-[12px] text-ink-muted">Cùng lộ trình học minh bạch từng tuần</Text>
              </View>
              <ChevronRight size={18} color={COLORS.muted} />
            </Pressable>
          </>
        ) : (
          <Text className="mt-10 px-6 text-center text-ink-muted">
            {items.length
              ? 'Chưa có nhật ký cho môn học này.'
              : 'Trung tâm đang cập nhật nhật ký tiến bộ (chỉ đăng khi phụ huynh đồng ý).'}
          </Text>
        )}
      </ScrollView>

      <StickyCta
        title={CTA_TITLE}
        subtitle="Giáo viên đánh giá 1:1 trong 30 phút · Không ràng buộc đăng ký"
        onPress={() => navigation.navigate('Booking', { course: student?.course ?? subject, source: 'PORTFOLIO' })}
      />
    </View>
  );
}
