import { AlertTriangle, CalendarDays, CalendarOff, CheckCircle2, Copy, Gift, Heart, LogOut, MessageCircle, Send, Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, HeaderIconButton, ScreenHeader, Skeleton } from '@/components';
import ImageZoomModal from '@/components/ImageZoomModal';
import { ENV, hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import {
  attendanceRate,
  fetchReports,
  photoUrls,
  reactToReport,
  sendAttendanceRequest,
  type AttendanceRequest,
  type DailyReport,
  type PortalStudent,
  type RequestType,
  type ScheduleSlot,
} from '@/services/parentPortal';
import { useParentStore } from '@/store';
import { CATEGORY_COLORS, COLORS } from '@/utils/constants';
import { confirmAsync, shareText } from '@/utils/platform';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra, vui lòng thử lại.');
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
/** JS getDay (0 = CN) → schedule d (2 … 7, 8 = CN). */
const toD = (day: number) => (day === 0 ? 8 : day + 1);
const DAY_SHORT: Record<number, string> = { 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN' };
const ATTEND: Record<DailyReport['attendance'], { label: string; cls: string }> = {
  PRESENT: { label: 'Có mặt', cls: 'bg-emerald-50 text-emerald-700' },
  ABSENT: { label: 'Vắng', cls: 'bg-red-50 text-red-700' },
  EXCUSED: { label: 'Nghỉ có phép', cls: 'bg-amber-50 text-amber-800' },
};
const REQ_STATUS: Record<AttendanceRequest['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Chờ duyệt', cls: 'text-amber-700' },
  APPROVED: { label: 'Đã duyệt', cls: 'text-emerald-700' },
  REJECTED: { label: 'Không duyệt', cls: 'text-red-700' },
};

/** Parents: the electronic contact book — children, sessions, schedule, teacher reports, leave requests, fees, referral. */
export default function ParentPortalScreen({ navigation }: RootStackScreenProps<'ParentPortal'>) {
  const insets = useSafeAreaInsets();
  const { status, portal, loading, error, selectedStudentId, load, selectStudent, signOut } = useParentStore();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'signedOut') navigation.replace('ParentAuth');
    else if (status === 'signedIn' && !portal && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const student = portal?.students.find((s) => s.id === selectedStudentId) ?? portal?.students[0] ?? null;
  const active = student?.enrollments.filter((e) => e.status === 'ACTIVE') ?? [];
  const openInvoice = active.find((e) => e.openInvoiceId)?.openInvoiceId ?? null;
  const requests = portal?.requests.filter((r) => r.studentId === student?.id).slice(0, 4) ?? [];

  const onSignOut = async () => {
    if (await confirmAsync('Đăng xuất?', 'Lần sau ba mẹ đăng nhập lại bằng mã OTP gửi qua Zalo.', 'Đăng xuất')) {
      await signOut();
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Sổ liên lạc"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Home' }))}
        right={
          <HeaderIconButton label="Đăng xuất" onPress={onSignOut}>
            <LogOut size={20} color={COLORS.ink} />
          </HeaderIconButton>
        }
      />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={loading && !!portal} onRefresh={load} tintColor={COLORS.brand} />}
        testID="parent-portal"
      >
        {!hasSupabase && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: thông tin, nhận xét và ảnh bên dưới chỉ để minh họa.</Text>}
        {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs leading-[18px] text-emerald-800">{notice}</Text>}
        {!!error && (
          <View className="gap-2">
            <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>
            <Button title="Thử lại" variant="outline" size="sm" onPress={load} />
          </View>
        )}

        {!portal && loading && (
          <View className="gap-3">
            <Skeleton height={44} radius={22} />
            <Skeleton height={180} radius={24} />
            <Skeleton height={220} radius={24} />
          </View>
        )}

        {portal && (
          <>
            <Text className="text-[15px] text-ink-muted">
              Xin chào <Text className="font-bold text-ink">{portal.parent.fullName}</Text>
            </Text>

            {portal.students.length === 0 ? (
              <View className="items-center gap-2 rounded-3xl bg-white p-6">
                <Text className="text-center text-[15px] font-bold text-ink">Chưa có hồ sơ học viên</Text>
                <Text className="text-center text-[13px] leading-5 text-ink-muted">Trung tâm sẽ liên kết hồ sơ của bé với số điện thoại này khi bé nhập học.</Text>
              </View>
            ) : (
              <ChildSwitcher students={portal.students} activeId={student!.id} onSelect={selectStudent} />
            )}

            {student && (
              <>
                <Overview student={student} />

                <View className="flex-row gap-2.5">
                  <Button className="flex-1" title="Báo nghỉ phép" variant="outline" icon={<CalendarOff size={16} color={COLORS.brand} />} onPress={() => setLeaveOpen(true)} disabled={active.length === 0} />
                  <Button
                    className="flex-1"
                    title="Đóng học phí"
                    variant={openInvoice ? 'accent' : 'outline'}
                    icon={<Wallet size={16} color={openInvoice ? '#fff' : COLORS.brand} />}
                    disabled={!openInvoice}
                    onPress={() => openInvoice && navigation.navigate('Payment', { id: openInvoice })}
                    testID="pay-tuition"
                  />
                </View>
                {!openInvoice && active.length > 0 && <Text className="-mt-1 px-1 text-[11px] text-ink-subtle">Chưa có hóa đơn học phí cần thanh toán.</Text>}

                <WeeklySchedule student={student} />

                {requests.length > 0 && (
                  <View className="gap-2 rounded-3xl bg-white p-4">
                    <Text className="text-[15px] font-bold text-ink">Yêu cầu nghỉ / học bù</Text>
                    {requests.map((r) => (
                      <View key={r.id} className="flex-row items-start justify-between gap-2">
                        <View className="flex-1">
                          <Text className="text-[13px] text-ink">
                            {r.type === 'LEAVE' ? 'Báo nghỉ' : 'Xin học bù'} · {dmy(r.requestedDate)}
                          </Text>
                          <Text className="text-xs text-ink-muted" numberOfLines={2}>
                            {r.reason}
                            {r.decisionNote ? ` — ${r.decisionNote}` : ''}
                          </Text>
                        </View>
                        <Text className={`text-xs font-bold ${REQ_STATUS[r.status].cls}`}>{REQ_STATUS[r.status].label}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <ReportFeed key={student.id} studentId={student.id} studentName={student.fullName} />
              </>
            )}

            <ReferralCard code={portal.parent.referralCode} />
          </>
        )}
      </ScrollView>

      {student && (
        <LeaveModal
          visible={leaveOpen}
          student={student}
          onClose={() => setLeaveOpen(false)}
          onSent={async (text) => {
            setLeaveOpen(false);
            setNotice(text);
            await load();
          }}
        />
      )}
    </View>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

function ChildSwitcher({ students, activeId, onSelect }: { students: PortalStudent[]; activeId: string; onSelect: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" testID="child-switcher">
      {students.map((s) => {
        const on = s.id === activeId;
        return (
          <Pressable
            key={s.id}
            onPress={() => onSelect(s.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            className={`flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'}`}
          >
            <View className={`h-8 w-8 items-center justify-center rounded-full ${on ? 'bg-white/25' : 'bg-brand-50'}`}>
              <Text className={`text-xs font-extrabold ${on ? 'text-white' : 'text-brand-700'}`}>{initials(s.fullName)}</Text>
            </View>
            <Text className={`text-[14px] font-bold ${on ? 'text-white' : 'text-ink'}`}>{s.fullName}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Overview({ student }: { student: PortalStudent }) {
  const rate = attendanceRate(student.attendance);
  const active = student.enrollments.filter((e) => e.status === 'ACTIVE');
  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="student-overview">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-[17px] font-extrabold text-ink">{student.fullName}</Text>
          <Text className="text-xs text-ink-muted">
            {student.branchName}
            {student.birthYear ? ` · sinh năm ${student.birthYear}` : ''}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[22px] font-black text-brand-600" testID="attendance-rate">
            {rate === null ? '—' : `${rate}%`}
          </Text>
          <Text className="text-[11px] text-ink-subtle">chuyên cần</Text>
        </View>
      </View>
      {active.length === 0 && <Text className="text-[13px] text-ink-muted">Bé chưa có khóa học đang theo học.</Text>}
      {active.map((e) => {
        const low = e.sessionsRemaining !== null && e.sessionsRemaining < 3;
        const pct = e.sessionsTotal && e.sessionsRemaining !== null ? Math.max(0, Math.min(1, e.sessionsRemaining / e.sessionsTotal)) : null;
        return (
          <View key={e.id} className="gap-1.5 rounded-2xl bg-slate-50 p-3">
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1 flex-row items-center gap-2">
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[e.courseCode] ?? COLORS.brand }} />
                <Text className="flex-1 text-[14px] font-bold text-ink">
                  {e.courseName}
                  {e.level > 1 ? ` · cấp ${e.level}` : ''}
                </Text>
              </View>
              <Text className={`text-[13px] font-extrabold ${low ? 'text-red-600' : 'text-ink'}`} testID="sessions-left">
                {e.sessionsRemaining === null ? '—' : `Còn ${e.sessionsRemaining}${e.sessionsTotal ? `/${e.sessionsTotal}` : ''} buổi`}
              </Text>
            </View>
            {pct !== null && (
              <View className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <View className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct * 100}%` }} />
              </View>
            )}
            {low && (
              <View className="flex-row items-start gap-1.5" testID="low-balance">
                <AlertTriangle size={14} color="#DC2626" />
                <Text className="flex-1 text-xs leading-[17px] text-red-700">
                  Sắp hết buổi học — ba mẹ {e.openInvoiceId ? 'đóng học phí khóa tiếp theo' : 'liên hệ trung tâm để gia hạn'} để bé học liên tục nhé.
                </Text>
              </View>
            )}
            {e.paymentStatus === 'PAID' && !e.openInvoiceId && (
              <View className="flex-row items-center gap-1">
                <CheckCircle2 size={12} color="#059669" />
                <Text className="text-[11px] font-semibold text-emerald-700">Đã đóng học phí</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function WeeklySchedule({ student }: { student: PortalStudent }) {
  const items = useMemo(
    () =>
      student.enrollments
        .filter((e) => e.status === 'ACTIVE')
        .flatMap((e) => e.schedule.map((s) => ({ ...s, course: e.courseName, code: e.courseCode })))
        .sort((a, b) => a.d - b.d || a.start.localeCompare(b.start)),
    [student],
  );
  const today = toD(new Date().getDay());
  return (
    <View className="gap-2.5 rounded-3xl bg-white p-4" testID="weekly-schedule">
      <View className="flex-row items-center gap-2">
        <CalendarDays size={16} color={COLORS.brand} />
        <Text className="text-[15px] font-bold text-ink">Lịch học trong tuần</Text>
      </View>
      {items.length === 0 ? (
        <Text className="text-[13px] text-ink-muted">Trung tâm chưa cập nhật lịch học cố định của bé.</Text>
      ) : (
        <View className="flex-row justify-between">
          {[2, 3, 4, 5, 6, 7, 8].map((d) => {
            const day = items.filter((s) => s.d === d);
            const isToday = d === today;
            return (
              <View key={d} className={`flex-1 items-center gap-1 rounded-xl py-2 ${isToday ? 'bg-brand-50' : ''}`}>
                <Text className={`text-[11px] font-bold ${isToday ? 'text-brand-700' : 'text-ink-subtle'}`}>{DAY_SHORT[d]}</Text>
                {day.length === 0 ? (
                  <View className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                ) : (
                  day.map((s) => (
                    <View key={`${s.code}-${s.start}`} className="items-center rounded-lg px-1 py-0.5" style={{ backgroundColor: `${CATEGORY_COLORS[s.code] ?? COLORS.brand}22` }}>
                      <Text className="text-[10px] font-extrabold text-ink">{s.start}</Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>
      )}
      {items.map((s) => (
        <Text key={`${s.d}-${s.code}-${s.start}`} className="text-xs text-ink-muted">
          {DAY_SHORT[s.d] === 'CN' ? 'Chủ nhật' : `Thứ ${s.d}`} · {s.start}–{s.end} · {s.course}
        </Text>
      ))}
    </View>
  );
}

function ReportFeed({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [items, setItems] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchReports(studentId, before);
        setItems((cur) => (before ? [...cur, ...page] : page));
        setMore(page.length === 10);
      } catch (e) {
        setError(msg(e));
      } finally {
        setLoading(false);
      }
    },
    [studentId],
  );
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  return (
    <View className="gap-3" testID="report-feed">
      <Text className="px-1 text-[16px] font-extrabold text-ink" accessibilityRole="header">
        Nhận xét sau mỗi buổi học
      </Text>
      {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{error}</Text>}
      {!loading && items.length === 0 && !error && (
        <Text className="rounded-3xl bg-white p-5 text-center text-[13px] leading-5 text-ink-muted">Chưa có nhận xét. Sau mỗi buổi học, thầy cô sẽ ghi nhận xét và ảnh bài làm của {studentName} tại đây.</Text>
      )}
      {items.map((r) => (
        <ReportCard key={r.id} report={r} studentName={studentName} onChange={(next) => setItems((cur) => cur.map((x) => (x.id === next.id ? next : x)))} />
      ))}
      {loading && <ActivityIndicator color={COLORS.brand} />}
      {!loading && more && items.length > 0 && <Button title="Xem các buổi trước" variant="ghost" size="sm" onPress={() => loadPage(items[items.length - 1].sessionDate)} />}
    </View>
  );
}

function ReportCard({ report, studentName, onChange }: { report: DailyReport; studentName: string; onChange: (r: DailyReport) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [zoom, setZoom] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (report.media.length) photoUrls(report.media).then((u) => alive && setUrls(u), () => {});
    return () => {
      alive = false;
    };
  }, [report.media]);

  const toggleLike = async () => {
    const next = { ...report, parentLiked: !report.parentLiked };
    onChange(next); // optimistic
    try {
      await reactToReport(report.id, next.parentLiked);
    } catch (e) {
      onChange(report);
      setError(msg(e));
    }
  };
  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await reactToReport(report.id, null, text);
      onChange({ ...report, parentReply: text });
      setReply('');
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const a = ATTEND[report.attendance];
  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="report-card">
      <View className="flex-row items-center gap-2.5">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
          <Text className="text-[13px] font-extrabold text-brand-700">{initials(report.teacherName)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-ink">{report.teacherName}</Text>
          <Text className="text-xs text-ink-muted">
            {report.courseName} · {dmy(report.sessionDate)}
          </Text>
        </View>
        <Text className={`overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-bold ${a.cls}`}>{a.label}</Text>
      </View>
      {!!report.feedbackText && <Text className="text-[14px] leading-[21px] text-ink">{report.feedbackText}</Text>}
      {urls.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {urls.map((u, i) => (
            <Pressable key={u} onPress={() => setZoom(i)} accessibilityRole="imagebutton" accessibilityLabel={`Xem ảnh bài làm ${i + 1} của ${studentName}`} className="overflow-hidden rounded-2xl" style={{ width: urls.length === 1 ? '100%' : '48.5%' }}>
              <Image source={{ uri: u }} style={{ width: '100%', aspectRatio: urls.length === 1 ? 4 / 3 : 3 / 4 }} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      )}
      {report.attendance !== 'EXCUSED' && (
        <>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={toggleLike}
              accessibilityRole="button"
              accessibilityState={{ selected: report.parentLiked }}
              aria-pressed={report.parentLiked}
              testID="thank-teacher"
              className={`h-10 flex-row items-center gap-1.5 rounded-full px-4 ${report.parentLiked ? 'bg-pink-50' : 'bg-slate-100 active:bg-slate-200'}`}
            >
              <Heart size={16} color={report.parentLiked ? '#DB2777' : COLORS.ink} fill={report.parentLiked ? '#DB2777' : 'transparent'} />
              <Text className={`text-[13px] font-bold ${report.parentLiked ? 'text-pink-600' : 'text-ink'}`}>{report.parentLiked ? 'Đã cảm ơn thầy cô' : 'Cảm ơn thầy cô'}</Text>
            </Pressable>
          </View>
          {report.parentReply ? (
            <View className="flex-row items-start gap-2 rounded-2xl bg-brand-50 p-3">
              <MessageCircle size={14} color={COLORS.brand} />
              <Text className="flex-1 text-[13px] leading-5 text-brand-800">{report.parentReply}</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <TextInput
                value={reply}
                onChangeText={setReply}
                placeholder="Nhắn lại thầy cô…"
                placeholderTextColor={COLORS.subtle}
                maxLength={500}
                accessibilityLabel="Nhắn lại thầy cô"
                className="h-11 flex-1 rounded-full border border-slate-200 bg-white px-4 text-[14px] text-ink"
                onSubmitEditing={sendReply}
                returnKeyType="send"
              />
              <Pressable onPress={sendReply} disabled={!reply.trim() || busy} accessibilityRole="button" accessibilityLabel="Gửi lời nhắn" className={`h-11 w-11 items-center justify-center rounded-full ${reply.trim() ? 'bg-brand-500 active:bg-brand-600' : 'bg-slate-200'}`}>
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Send size={17} color="#fff" />}
              </Pressable>
            </View>
          )}
        </>
      )}
      {!!error && <Text className="text-xs text-red-600">{error}</Text>}
      <ImageZoomModal urls={urls} index={zoom} onClose={() => setZoom(null)} title={`Bài làm của ${studentName}`} />
    </View>
  );
}

function ReferralCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${ENV.webUrl || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '')}/booking?utm_source=referral&utm_medium=parent&utm_campaign=${code}`;
  const canCopy = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard;
  const share = () =>
    shareText(`Mình thấy các lớp ở TH EDU rất hợp với bé. Ba mẹ đăng ký học thử miễn phí tại đây nhé (mã giới thiệu ${code}): ${link}`).catch(() => {});
  return (
    <View className="gap-2.5 rounded-3xl border border-amber-200 bg-amber-50 p-4" testID="referral-card">
      <View className="flex-row items-center gap-2">
        <Gift size={18} color="#B45309" />
        <Text className="text-[15px] font-bold text-amber-900">Giới thiệu bạn bè</Text>
      </View>
      <Text className="text-[13px] leading-5 text-amber-900">
        {ENV.referralReward ? ENV.referralReward : 'Chia sẻ mã của ba mẹ để bạn bè đăng ký học thử miễn phí cho bé.'}
      </Text>
      <View className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-3">
        <Text selectable className="text-[20px] font-black tracking-widest text-ink" testID="referral-code">
          {code}
        </Text>
        {canCopy && (
          <Pressable
            onPress={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {})}
            accessibilityRole="button"
            accessibilityLabel="Sao chép mã giới thiệu"
            className="h-9 flex-row items-center gap-1 rounded-full bg-slate-100 px-3 active:bg-slate-200"
          >
            <Copy size={14} color={COLORS.ink} />
            <Text className="text-xs font-bold text-ink">{copied ? 'Đã chép' : 'Chép'}</Text>
          </Pressable>
        )}
      </View>
      <Button title="Chia sẻ qua Zalo" icon={<Send size={16} color="#fff" />} onPress={share} />
    </View>
  );
}

function LeaveModal({ visible, student, onClose, onSent }: { visible: boolean; student: PortalStudent; onClose: () => void; onSent: (notice: string) => void }) {
  const [type, setType] = useState<RequestType>('LEAVE');
  const [date, setDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const classDays = new Set(student.enrollments.filter((e) => e.status === 'ACTIVE').flatMap((e) => e.schedule.map((s: ScheduleSlot) => s.d)));
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(Date.now() + i * 86400_000)), [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) return;
    setType('LEAVE');
    setReason('');
    setError(null);
    // Default: the next class day.
    const next = days.find((d) => classDays.has(toD(d.getDay())));
    setDate(next ? isoOf(next) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = async () => {
    if (!date) return setError('Chọn ngày');
    if (reason.trim().length < 3) return setError('Ba mẹ ghi lý do (ít nhất 3 ký tự)');
    setBusy(true);
    setError(null);
    try {
      await sendAttendanceRequest(student.id, type, date, reason);
      onSent(`Đã gửi ${type === 'LEAVE' ? 'báo nghỉ' : 'yêu cầu học bù'} ngày ${dmy(date)} cho ${student.fullName}. Trung tâm sẽ phản hồi trong sổ liên lạc.`);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <ScrollView className="max-h-[88%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled" testID="leave-modal">
          <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
            Báo nghỉ / xin học bù · {student.fullName}
          </Text>
          <View className="flex-row rounded-2xl bg-slate-100 p-1">
            {(['LEAVE', 'MAKEUP'] as RequestType[]).map((t) => (
              <Pressable key={t} onPress={() => setType(t)} accessibilityRole="radio" aria-checked={type === t} accessibilityState={{ checked: type === t }} className={`flex-1 items-center rounded-xl py-2.5 ${type === t ? 'bg-white' : ''}`}>
                <Text className={`text-[14px] font-bold ${type === t ? 'text-brand-700' : 'text-ink-muted'}`}>{t === 'LEAVE' ? 'Báo nghỉ phép' : 'Xin học bù'}</Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-[13px] font-semibold text-ink-muted">Chọn ngày {classDays.size > 0 ? '(chấm xanh = ngày bé có lớp)' : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {days.map((d) => {
              const iso = isoOf(d);
              const on = iso === date;
              const hasClass = classDays.has(toD(d.getDay()));
              return (
                <Pressable key={iso} onPress={() => setDate(iso)} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={`${DAY_SHORT[toD(d.getDay())]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`} className={`w-14 items-center gap-0.5 rounded-2xl border py-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'}`}>
                  <Text className={`text-[11px] font-bold ${on ? 'text-white' : 'text-ink-subtle'}`}>{DAY_SHORT[toD(d.getDay())]}</Text>
                  <Text className={`text-[15px] font-extrabold ${on ? 'text-white' : 'text-ink'}`}>{pad(d.getDate())}</Text>
                  <View className={`h-1.5 w-1.5 rounded-full ${hasClass ? (on ? 'bg-white' : 'bg-emerald-500') : 'bg-transparent'}`} />
                </Pressable>
              );
            })}
          </ScrollView>
          <View className="gap-1.5">
            <Text className="text-[13px] font-semibold text-ink-muted">Lý do</Text>
            <TextInput
              value={reason}
              onChangeText={(t) => { setReason(t); setError(null); }}
              multiline
              maxLength={300}
              placeholder={type === 'LEAVE' ? 'VD: Bé bị sốt, xin nghỉ buổi này' : 'VD: Xin học bù buổi nghỉ ngày 12/11'}
              placeholderTextColor={COLORS.subtle}
              accessibilityLabel="Lý do"
              className="min-h-[90px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-ink"
              style={{ textAlignVertical: 'top' }}
            />
          </View>
          {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          <View className="flex-row gap-2.5">
            <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
            <Button className="flex-[2]" title="Gửi trung tâm" loading={busy} onPress={submit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
