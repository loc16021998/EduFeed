import { ChevronRight, Flame } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, Skeleton } from '@/components';
import ImageZoomModal from '@/components/ImageZoomModal';
import WeeklyProgressCard from '@/components/WeeklyProgressCard';
import { EmptyState, StatusBanner } from '@/components/ux';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import {
  fetchWeeklyReports,
  lastWeekStart,
  markWeeklyReportViewed,
  thisWeekStart,
  weeklyPhotoUrls,
  type WeeklyReport,
} from '@/services/weeklyReportService';
import { useParentStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { shareText } from '@/utils/platform';

import { addDays, weekLabel, weeklyShareText } from '../../../supabase/functions/_shared/weeklyReport';

type Tab = 'this' | 'last' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'this', label: 'Tuần này' },
  { id: 'last', label: 'Tuần trước' },
  { id: 'history', label: 'Lịch sử các tuần' },
];
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra, vui lòng thử lại.');
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Parents: the automatic weekly digest (published every Sunday 19:30), per child, with history and sharing. */
export default function WeeklyReportScreen({ navigation, route }: RootStackScreenProps<'WeeklyReport'>) {
  const insets = useSafeAreaInsets();
  const { status, portal, loading: portalLoading, selectedStudentId, load, selectStudent } = useParentStore();
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [historyPick, setHistoryPick] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    if (status === 'signedOut') navigation.replace('ParentAuth');
    else if (status === 'signedIn' && !portal && !portalLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Opened from a notification: show that child.
  const wanted = route.params?.studentId;
  useEffect(() => {
    if (wanted && portal?.students.some((s) => s.id === wanted)) selectStudent(wanted);
  }, [wanted, portal, selectStudent]);

  const student = portal?.students.find((s) => s.id === selectedStudentId) ?? portal?.students[0] ?? null;

  const fetchList = useCallback(async () => {
    if (!student) return;
    setLoading(true);
    setError(null);
    try {
      setReports(await fetchWeeklyReports(student.id));
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    setReports(null);
    setTab(null);
    setHistoryPick(null);
    fetchList();
  }, [fetchList]);

  const thisW = thisWeekStart();
  const lastW = lastWeekStart();
  const byWeek = useMemo(() => new Map((reports ?? []).map((r) => [r.weekStart, r])), [reports]);
  // Default: the newest report there is (this week's appears on Sunday evening).
  const current: Tab = tab ?? (byWeek.has(thisW) ? 'this' : byWeek.has(lastW) ? 'last' : 'history');
  const shown = current === 'this' ? byWeek.get(thisW) : current === 'last' ? byWeek.get(lastW) : historyPick ? (reports ?? []).find((r) => r.id === historyPick) : undefined;

  // Photos + "đã xem" whenever a report is on screen.
  useEffect(() => {
    setPhotos([]);
    if (!shown) return;
    let alive = true;
    weeklyPhotoUrls(shown.media).then((u) => alive && setPhotos(u), () => {});
    if (!shown.viewedAt) {
      markWeeklyReportViewed(shown.id).then((at) => {
        if (alive && at) setReports((list) => list?.map((r) => (r.id === shown.id ? { ...r, viewedAt: at } : r)) ?? list);
      });
    }
    return () => {
      alive = false;
    };
  }, [shown?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onShare = () => {
    if (!shown || !student) return;
    shareText(
      weeklyShareText({
        studentName: student.fullName,
        weekStart: shown.weekStart,
        attendance: shown.attendance,
        streak: shown.habit.streak,
        highlights: shown.highlights,
        teacherName: shown.teacherName,
        teacherNote: shown.teacherNote,
      }),
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Báo cáo tuần" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ParentPortal'))} />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={loading && !!reports} onRefresh={fetchList} tintColor={COLORS.brand} />}
        testID="weekly-report-screen"
      >
        {!hasSupabase && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: báo cáo bên dưới chỉ để minh họa.</Text>}
        {!!error && <StatusBanner tone="error" text={error} action={{ label: 'Thử lại', onPress: fetchList }} />}

        {portal && portal.students.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" testID="weekly-child-switcher">
            {portal.students.map((s) => {
              const on = s.id === student?.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => selectStudent(s.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  aria-selected={on}
                  className={`min-h-11 justify-center rounded-full border px-4 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'}`}
                >
                  <Text className={`text-[14px] font-bold ${on ? 'text-white' : 'text-ink'}`}>{s.fullName}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {portal && portal.students.length === 0 && (
          <EmptyState emoji="🎒" title="Chưa có hồ sơ học viên" message="Khi bé nhập học, báo cáo tuần sẽ được gửi vào đây mỗi tối Chủ nhật." />
        )}

        {student && (
          <View className="flex-row rounded-2xl bg-slate-100 p-1" testID="week-pills">
            {TABS.map((t) => {
              const on = current === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setTab(t.id);
                    setHistoryPick(null);
                  }}
                  accessibilityRole="tab"
                  aria-selected={on}
                  accessibilityState={{ selected: on }}
                  className={`min-h-11 flex-1 items-center justify-center rounded-xl px-1 ${on ? 'bg-white' : ''}`}
                  testID={`week-tab-${t.id}`}
                >
                  <Text className={`text-center text-[13px] font-bold ${on ? 'text-brand-700' : 'text-ink-muted'}`}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {student && !reports && (loading || portalLoading) && (
          <View className="gap-3">
            <Skeleton height={120} radius={24} />
            <Skeleton height={260} radius={24} />
          </View>
        )}

        {student && reports && (
          <>
            {shown ? (
              <>
                {current === 'history' && (
                  <Pressable onPress={() => setHistoryPick(null)} accessibilityRole="button" className="min-h-11 justify-center" testID="history-back">
                    <Text className="text-[14px] font-bold text-brand-700">‹ Tất cả các tuần</Text>
                  </Pressable>
                )}
                <WeeklyProgressCard report={shown} studentName={student.fullName} photos={photos} onPhotoPress={setZoom} onShare={onShare} />
              </>
            ) : current === 'this' ? (
              <EmptyState
                emoji="🗓️"
                title="Báo cáo tuần này chưa có"
                message={`Báo cáo tuần ${weekLabel(thisW)} sẽ được gửi lúc 19:30 Chủ nhật (${dm(addDays(thisW, 6))}). Trong tuần, ba mẹ xem nhận xét từng buổi ở Sổ liên lạc nhé.`}
                action={byWeek.has(lastW) ? { label: 'Xem tuần trước', variant: 'outline', onPress: () => setTab('last'), testID: 'goto-last-week' } : undefined}
              />
            ) : current === 'last' ? (
              <EmptyState emoji="🗓️" title="Chưa có báo cáo tuần trước" message="Báo cáo được gửi tự động mỗi tối Chủ nhật khi bé đang theo học tại trung tâm." />
            ) : reports.length === 0 ? (
              <EmptyState emoji="📭" title="Chưa có báo cáo nào" message="Báo cáo đầu tiên sẽ đến vào tối Chủ nhật tuần này." />
            ) : (
              <View className="gap-2" testID="weekly-history">
                {reports.map((r) => (
                  <Pressable key={r.id} onPress={() => setHistoryPick(r.id)} accessibilityRole="button" className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-white px-4 py-3 active:bg-slate-50" testID="history-row">
                    <View className="flex-1 gap-0.5">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-[14px] font-bold text-ink">Tuần {weekLabel(r.weekStart)}</Text>
                        {!r.viewedAt && (
                          <View className="rounded-full bg-accent-100 px-2 py-0.5">
                            <Text className="text-[10px] font-extrabold text-accent-600">MỚI</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-xs text-ink-muted">
                        {r.attendance.totalSessions > 0 ? `Đi học ${r.attendance.attendedCount}/${r.attendance.totalSessions} buổi` : 'Lớp nghỉ'}
                      </Text>
                    </View>
                    {r.habit.streak > 0 && (
                      <View className="flex-row items-center gap-1 rounded-full bg-orange-50 px-2 py-1">
                        <Flame size={12} color="#EA580C" />
                        <Text className="text-[11px] font-bold text-orange-700">{r.habit.streak}</Text>
                      </View>
                    )}
                    <ChevronRight size={18} color={COLORS.subtle} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <ImageZoomModal urls={photos} index={zoom} onClose={() => setZoom(null)} title="Trang vở của tuần" />
    </View>
  );
}
