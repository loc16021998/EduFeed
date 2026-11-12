import { Award, CheckCircle2, CircleAlert, CircleDashed, MinusCircle, Phone, PhoneCall, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Badge, Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import {
  completeEnrollment,
  dropEnrollment,
  listEnrollments,
  markAdvisorContacted,
  type AutomationStatus,
  type Enrollment,
  type EnrollmentFilter,
  type LifecycleStage,
} from '@/services/enrollments';
import { courseTitle, MAX_LEVEL, recommendNextCourses } from '@/services/recommendationService';
import { useStaffStore } from '@/store';
import { CAMPUS_LABELS, CATEGORY_COLORS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { confirmAsync } from '@/utils/platform';

const FILTERS: { id: EnrollmentFilter; label: string; empty: string }[] = [
  { id: 'ACTIVE', label: 'Đang học', empty: 'Chưa có học viên đang học. Học viên được thêm tự động khi đánh dấu "Đã nhập học" trong Lịch học thử.' },
  { id: 'COMPLETED', label: 'Đã hoàn thành', empty: 'Chưa có học viên hoàn thành khóa.' },
  { id: 'PRIORITY', label: 'Cần gọi tư vấn', empty: 'Không có gia đình nào cần gọi tư vấn. 👏' },
];

const STAGE_LABEL: Record<LifecycleStage, string> = {
  COMPLETION_CERT: 'T+0 · Chứng nhận & cảm ơn',
  TEACHER_REVIEW: 'T+3 · Nhận xét của giáo viên',
  ALUMNI_DISCOUNT: 'T+7 · Ưu đãi học viên cũ',
  FINAL_CALL: 'T+14 · Gọi tư vấn khóa tiếp theo',
};
const AUTO_UI: Record<AutomationStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Chờ gửi', color: '#64748B', icon: CircleDashed },
  SENDING: { label: 'Đang gửi', color: '#2F6BFF', icon: CircleDashed },
  SENT: { label: 'Đã gửi', color: '#059669', icon: CheckCircle2 },
  FAILED: { label: 'Lỗi', color: '#DC2626', icon: CircleAlert },
  SKIPPED: { label: 'Bỏ qua', color: '#B45309', icon: MinusCircle },
  CANCELLED: { label: 'Đã dừng', color: '#94A3B8', icon: XCircle },
};

const pad = (n: number) => String(n).padStart(2, '0');
const dmy = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');

/** Teachers / staff: courses in progress → complete with a final review → automated follow-ups + advisor calls. */
export default function StaffEnrollmentsScreen({ navigation }: RootStackScreenProps<'StaffEnrollments'>) {
  const { status: authStatus, isStaff, demo } = useStaffStore();
  const [filter, setFilter] = useState<EnrollmentFilter>('ACTIVE');
  const [items, setItems] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Enrollment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
  }, [authStatus, isStaff, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listEnrollments(filter));
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  const act = async (e: Enrollment, fn: () => Promise<void>) => {
    setBusyId(e.id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusyId(null);
    }
  };

  const onDrop = async (e: Enrollment) => {
    if (await confirmAsync('Dừng học?', `${e.studentName} sẽ được đánh dấu dừng học khóa ${courseTitle(e.course as never, e.level)}.`, 'Dừng học')) {
      act(e, () => dropEnrollment(e.id));
    }
  };
  const onContacted = async (e: Enrollment) => {
    if (await confirmAsync('Đã gọi tư vấn?', `Ghi nhận đã gọi cho ${e.parentName ?? 'phụ huynh'}. Các tin nhắn tự động còn lại của khóa này sẽ dừng.`, 'Đã gọi')) {
      act(e, () => markAdvisorContacted(e.id));
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Học viên & lộ trình" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('StaffVideos'))} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-3">
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className={`rounded-full px-4 py-2 ${active ? 'bg-brand-500' : 'border border-slate-200 bg-white'}`}
              >
                <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerClassName="gap-3 px-4 pb-10"
        refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
        ListHeaderComponent={
          <View className="gap-2">
            {(demo || !hasSupabase) && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: kết nối Supabase để xem học viên thật.</Text>}
            {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs leading-[18px] text-emerald-800">{notice}</Text>}
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <EnrollmentCard
            e={item}
            busy={busyId === item.id}
            onComplete={() => setCompleting(item)}
            onDrop={() => onDrop(item)}
            onContacted={() => onContacted(item)}
            onCertificate={() => item.certificateCode && navigation.navigate('Certificate', { code: item.certificateCode })}
          />
        )}
        ListEmptyComponent={
          loading ? <ActivityIndicator className="mt-10" color={COLORS.brand} /> : !error ? <Text className="mt-10 px-8 text-center text-ink-muted">{FILTERS.find((f) => f.id === filter)!.empty}</Text> : null
        }
      />
      <CompleteModal
        enrollment={completing}
        onClose={() => setCompleting(null)}
        onSubmit={async (input) => {
          try {
            const res = await completeEnrollment(completing!.id, input);
            setCompleting(null);
            setNotice(`Đã hoàn thành khóa · chứng nhận ${res.certificateCode}. Chứng nhận được gửi cho phụ huynh qua Zalo (nếu đã cấu hình mẫu tin) — xem trạng thái từng tin trong thẻ học viên.`);
            await load();
            return null;
          } catch (e) {
            return msg(e);
          }
        }}
      />
    </View>
  );
}

function EnrollmentCard({ e, busy, onComplete, onDrop, onContacted, onCertificate }: { e: Enrollment; busy: boolean; onComplete: () => void; onDrop: () => void; onContacted: () => void; onCertificate: () => void }) {
  const title = courseTitle(e.course as never, e.level);
  const recs = e.status === 'COMPLETED' ? recommendNextCourses({ courseCode: e.course, level: e.level }) : [];
  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="enrollment-card">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="text-[15px] font-bold text-ink">{e.studentName}</Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Badge label={title} color={CATEGORY_COLORS[e.course]} />
            <Text className="text-xs text-ink-muted">{CAMPUS_LABELS[e.campus]}</Text>
          </View>
          <Text className="text-[11px] text-ink-subtle">
            {dmy(e.startDate)} → {e.endDate ? dmy(e.endDate) : 'đang học'}
          </Text>
        </View>
        {e.advisorPriority && (
          <View className="flex-row items-center gap-1 rounded-full bg-red-50 px-2.5 py-1" testID="priority-badge">
            <PhoneCall size={12} color="#B91C1C" />
            <Text className="text-[11px] font-bold text-red-700">Cần gọi tư vấn</Text>
          </View>
        )}
      </View>

      {!!e.parentName && (
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] text-ink-muted">{e.parentName}</Text>
          {!!e.phone && (
            <Pressable onPress={() => Linking.openURL(`tel:${e.phone}`).catch(() => {})} accessibilityRole="link" className="flex-row items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 active:bg-brand-100">
              <Phone size={13} color={COLORS.brand} />
              <Text className="text-xs font-bold text-brand-700">{formatPhone(e.phone)}</Text>
            </Pressable>
          )}
        </View>
      )}

      {e.status === 'ACTIVE' && (
        <View className="flex-row gap-2.5">
          <Button className="flex-[2]" size="sm" title="Hoàn thành khóa" variant="accent" icon={<Award size={15} color="#fff" />} loading={busy} onPress={onComplete} />
          <Button className="flex-1" size="sm" title="Dừng học" variant="outline" disabled={busy} onPress={onDrop} />
        </View>
      )}

      {e.status === 'COMPLETED' && (
        <>
          {!!e.teacherNote && <Text className="rounded-2xl bg-slate-50 p-3 text-[13px] leading-5 text-ink">“{e.teacherNote}”</Text>}
          <View className="gap-1.5" testID="lifecycle-timeline">
            {e.automations.map((a) => {
              const ui = AUTO_UI[a.status];
              const Icon = ui.icon;
              return (
                <View key={a.stage} className="flex-row items-start gap-2">
                  <Icon size={15} color={ui.color} />
                  <View className="flex-1">
                    <Text className="text-xs text-ink">
                      {STAGE_LABEL[a.stage]} <Text className="text-ink-subtle">· {dayMonth(a.scheduledAt)}</Text>
                    </Text>
                    {!!a.error && (a.status === 'SKIPPED' || a.status === 'FAILED') && <Text className="text-[11px] leading-4 text-ink-subtle">{a.error}</Text>}
                  </View>
                  <Text className="text-[11px] font-bold" style={{ color: ui.color }}>
                    {ui.label}
                  </Text>
                </View>
              );
            })}
          </View>
          {recs.length > 0 && (
            <View className="gap-1 rounded-2xl border border-brand-100 bg-brand-50 p-3">
              <Text className="text-xs font-bold text-brand-700">Gợi ý khóa tiếp theo</Text>
              {recs.map((r) => (
                <Text key={`${r.courseCode}-${r.level}`} className="text-xs leading-[17px] text-ink">
                  • <Text className="font-semibold">{r.title}</Text> — {r.reason}
                </Text>
              ))}
            </View>
          )}
          <View className="flex-row gap-2.5">
            {!!e.certificateCode && <Button className="flex-1" size="sm" title="Xem chứng nhận" variant="outline" onPress={onCertificate} />}
            {e.advisorPriority && <Button className="flex-1" size="sm" title="Đã gọi tư vấn" loading={busy} onPress={onContacted} />}
          </View>
        </>
      )}
    </View>
  );
}

function CompleteModal({ enrollment, onClose, onSubmit }: { enrollment: Enrollment | null; onClose: () => void; onSubmit: (i: { teacherNote: string; endDate?: string; level?: number }) => Promise<string | null> }) {
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [level, setLevel] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new Date();
    setDate(`${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`);
    setNote('');
    setLevel(enrollment?.level ?? 1);
    setError(null);
  }, [enrollment?.id, enrollment?.level]);

  const submit = async () => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
    if (!m) return setError('Ngày kết thúc dạng dd/mm/yyyy');
    const iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    if (Number.isNaN(new Date(`${iso}T00:00:00`).getTime())) return setError('Ngày kết thúc không hợp lệ');
    if (note.trim().length < 20) return setError('Nhận xét cuối khóa cần ít nhất 20 ký tự — phụ huynh sẽ nhận được nhận xét này.');
    setBusy(true);
    const err = await onSubmit({ teacherNote: note.trim(), endDate: iso, level });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Modal visible={!!enrollment} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {enrollment && (
          <ScrollView className="max-h-[88%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled" testID="complete-enrollment">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Hoàn thành khóa · {enrollment.studentName}
            </Text>
            <Text className="text-[13px] leading-5 text-ink-muted">
              Sau khi lưu: tạo chứng nhận điện tử và tự động gửi phụ huynh qua Zalo — chứng nhận (ngay), nhận xét (sau 3 ngày), ưu đãi học viên cũ nếu trung tâm đã cấu hình (7 ngày), và đưa vào danh sách gọi tư vấn (14 ngày).
            </Text>
            <FormField label="Ngày kết thúc khóa" value={date} onChangeText={(t) => { setDate(t); setError(null); }} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" />
            <View className="gap-1.5">
              <Text className="text-[13px] font-semibold text-ink-muted">Cấp độ đã hoàn thành</Text>
              <View className="flex-row gap-2">
                {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
                  <Pressable key={l} onPress={() => setLevel(l)} accessibilityRole="radio" accessibilityState={{ checked: l === level }} className={`rounded-full border px-4 py-2 ${l === level ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                    <Text className={`text-[13px] font-semibold ${l === level ? 'text-brand-700' : 'text-ink'}`}>Cấp {l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="gap-1.5">
              <Text className="text-[13px] font-semibold text-ink-muted">Nhận xét cuối khóa (gửi phụ huynh)</Text>
              <TextInput
                value={note}
                onChangeText={(t) => { setNote(t); setError(null); }}
                multiline
                maxLength={1000}
                placeholder="VD: Gia Bảo đọc trơn, viết đúng độ cao chữ; cần luyện thêm tốc độ viết."
                placeholderTextColor={COLORS.subtle}
                accessibilityLabel="Nhận xét cuối khóa"
                className="min-h-[110px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-ink"
                style={{ textAlignVertical: 'top' }}
              />
              <Text className="self-end text-xs text-ink-subtle">{note.trim().length}/1000</Text>
            </View>
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
              <Button className="flex-[2]" title="Lưu & hoàn thành" variant="accent" loading={busy} onPress={submit} />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
