import { LIST_PERF } from '@/utils/listPerf';
import { EmptyState } from '@/components/ux';
import { useFocusEffect } from '@react-navigation/native';
import { Award, BookOpenCheck, CheckCircle2, CircleAlert, CircleDashed, ImagePlus, MinusCircle, Phone, PhoneCall, Receipt, Send, Wallet, X, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

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
import { checkMedia } from '@/services/media/storageUpload';
import { pickImage } from '@/services/media/mediaPicker';
import { createDailyReport, type Attendance } from '@/services/parentPortal';
import type { PickedMedia } from '@/types';
import { redeemVoucher } from '@/services/referrals';
import { cancelInvoice, confirmInvoiceManually, createInvoice, getInvoiceDraft, invoiceInputProblem, paymentLink, type InvoiceDraft } from '@/services/paymentService';
import { courseTitle, MAX_LEVEL, recommendNextCourses } from '@/services/recommendationService';
import { useStaffStore } from '@/store';
import { CAMPUS_LABELS, CATEGORY_COLORS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { confirmAsync, shareText } from '@/utils/platform';

import { formatVnd } from '../../../supabase/functions/_shared/payments';

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
  SENDING: { label: 'Đang gửi', color: '#1278BE', icon: CircleDashed },
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
  const { status: authStatus, isStaff, isAdmin, demo } = useStaffStore();
  const [filter, setFilter] = useState<EnrollmentFilter>('ACTIVE');
  const [items, setItems] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Enrollment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState<Enrollment | null>(null);
  const [confirming, setConfirming] = useState<Enrollment | null>(null);
  const [reporting, setReporting] = useState<Enrollment | null>(null);

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

  // Also on coming back to this screen (e.g. from the payment page), so payment status is never stale.
  useFocusEffect(
    useCallback(() => {
      if (isStaff) load();
    }, [isStaff, load]),
  );

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
  const onShareLink = (e: Enrollment) => {
    if (!e.invoice) return;
    shareText(invoiceShareText(e.studentName, e.invoice.amountVnd, e.invoice.id)).catch(() => {});
  };
  const onCancelInvoice = async (e: Enrollment) => {
    if (e.invoice && (await confirmAsync('Hủy hóa đơn?', `Hóa đơn ${e.invoice.ref} (${formatVnd(e.invoice.amountVnd)}) sẽ không còn thanh toán được.`, 'Hủy hóa đơn'))) {
      act(e, () => cancelInvoice(e.invoice!.id));
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
                className={`min-h-11 justify-center rounded-full px-4 py-2 ${active ? 'bg-brand-500' : 'border border-slate-200 bg-white'}`}
              >
                <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        {...LIST_PERF}
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
            onReport={() => setReporting(item)}
            payment={
              <PaymentSection
                e={item}
                isAdmin={isAdmin}
                busy={busyId === item.id}
                onCreate={() => setInvoicing(item)}
                onShare={() => onShareLink(item)}
                onOpen={() => item.invoice && navigation.navigate('Payment', { id: item.invoice.id })}
                onCancel={() => onCancelInvoice(item)}
                onConfirm={() => setConfirming(item)}
              />
            }
          />
        )}
        ListEmptyComponent={
          loading ? <ActivityIndicator className="mt-10" color={COLORS.brand} /> : !error ? <View className="mt-6"><EmptyState compact emoji="🎒" title={FILTERS.find((f) => f.id === filter)!.empty} /></View> : null
        }
      />
      <ReportModal
        enrollment={reporting}
        onClose={() => setReporting(null)}
        onDone={async (text) => {
          setReporting(null);
          setNotice(text);
          await load();
        }}
      />
      <InvoiceModal
        enrollment={invoicing}
        onClose={() => {
          setInvoicing(null);
          load();
        }}
        onOpenPayment={(id) => {
          setInvoicing(null);
          navigation.navigate('Payment', { id });
        }}
      />
      <ConfirmPaidModal
        enrollment={confirming}
        onClose={() => setConfirming(null)}
        onSubmit={async (note) => {
          try {
            await confirmInvoiceManually(confirming!.invoice!.id, note);
            setNotice(`Đã xác nhận học phí của ${confirming!.studentName}. Biên lai đã được lập.`);
            setConfirming(null);
            await load();
            return null;
          } catch (e) {
            return msg(e);
          }
        }}
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

function EnrollmentCard({ e, busy, onComplete, onDrop, onContacted, onCertificate, onReport, payment }: { e: Enrollment; busy: boolean; onComplete: () => void; onDrop: () => void; onContacted: () => void; onCertificate: () => void; onReport: () => void; payment: ReactNode }) {
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
            <Pressable onPress={() => Linking.openURL(`tel:${e.phone}`).catch(() => {})} accessibilityRole="link" className="h-11 flex-row items-center gap-1 rounded-full bg-brand-50 px-3 active:bg-brand-100">
              <Phone size={13} color={COLORS.brand} />
              <Text className="text-xs font-bold text-brand-700">{formatPhone(e.phone)}</Text>
            </Pressable>
          )}
        </View>
      )}

      {payment}

      {e.status === 'ACTIVE' &&
        (e.studentId ? (
          <Button size="sm" title={`Ghi sổ liên lạc${e.sessionsRemaining !== null ? ` · còn ${e.sessionsRemaining} buổi` : ''}`} variant="outline" icon={<BookOpenCheck size={14} color={COLORS.brand} />} onPress={onReport} />
        ) : (
          <Text className="text-[11px] leading-4 text-ink-subtle">Chưa liên kết tài khoản phụ huynh — quản trị viên liên kết ở "Phụ huynh & học viên" để ghi sổ liên lạc.</Text>
        ))}

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
                  <Pressable key={l} onPress={() => setLevel(l)} accessibilityRole="radio" accessibilityState={{ checked: l === level }} className={`min-h-11 justify-center rounded-full border px-4 py-2 ${l === level ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
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

// ─── Tuition ────────────────────────────────────────────────────────────────

const invoiceShareText = (student: string, amountVnd: number, id: string) =>
  `TH EDU gửi ba mẹ hóa đơn học phí của bé ${student} (${formatVnd(amountVnd)}). Ba mẹ thanh toán bằng VietQR hoặc VNPay tại: ${paymentLink(id)}`;

function PaymentSection({ e, isAdmin, busy, onCreate, onShare, onOpen, onCancel, onConfirm }: { e: Enrollment; isAdmin: boolean; busy: boolean; onCreate: () => void; onShare: () => void; onOpen: () => void; onCancel: () => void; onConfirm: () => void }) {
  const inv = e.invoice;
  const pending = inv?.status === 'PENDING_PAYMENT';
  const paid = inv?.status === 'PAID';
  if (!isAdmin && !inv) return null;
  return (
    <View className="gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3" testID="payment-section">
      <View className="flex-row items-center gap-2">
        <Wallet size={15} color={paid ? '#059669' : pending ? '#B45309' : COLORS.subtle} />
        <Text className={`flex-1 text-xs font-semibold ${paid ? 'text-emerald-700' : pending ? 'text-amber-700' : 'text-ink-muted'}`} testID="payment-status">
          {paid
            ? `Đã đóng học phí ${formatVnd(inv!.amountVnd)} · ${inv!.receiptNo ?? ''}`
            : pending
              ? `Chờ thanh toán ${formatVnd(inv!.amountVnd)} · ${inv!.ref}`
              : inv?.status === 'CANCELLED'
                ? 'Hóa đơn gần nhất đã hủy'
                : 'Chưa lập hóa đơn học phí'}
        </Text>
      </View>
      {pending && (
        <View className="flex-row gap-2">
          <Button className="flex-1" size="sm" title="Gửi link thanh toán" icon={<Send size={14} color="#fff" />} onPress={onShare} />
          <Button size="sm" title="Mở" variant="outline" onPress={onOpen} />
        </View>
      )}
      {pending && isAdmin && (
        <View className="flex-row gap-2">
          <Button className="flex-1" size="sm" title="Đã nhận tiền" variant="outline" disabled={busy} onPress={onConfirm} />
          <Button className="flex-1" size="sm" title="Hủy hóa đơn" variant="ghost" loading={busy} onPress={onCancel} />
        </View>
      )}
      {paid && <Button size="sm" title="Xem biên lai" variant="outline" icon={<Receipt size={14} color={COLORS.brand} />} onPress={onOpen} />}
      {isAdmin && !pending && !paid && <Button size="sm" title="Lập hóa đơn học phí" variant="outline" icon={<Wallet size={14} color={COLORS.brand} />} onPress={onCreate} />}
    </View>
  );
}

const digits = (t: string) => t.replace(/\D/g, '').slice(0, 9);
const vndInput = (n: number) => (n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');

function InvoiceModal({ enrollment, onClose, onOpenPayment }: { enrollment: Enrollment | null; onClose: () => void; onOpenPayment: (id: string) => void }) {
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [base, setBase] = useState('');
  const [withDiscount, setWithDiscount] = useState(false);
  const [discount, setDiscount] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; ref: string; amountVnd: number } | null>(null);
  const [voucherId, setVoucherId] = useState<string | null>(null);

  useEffect(() => {
    if (!enrollment) return;
    setVoucherId(null);
    setDraft(null);
    setCreated(null);
    setError(null);
    setDiscount('');
    setNote('');
    setWithDiscount(false);
    setLabel('');
    getInvoiceDraft(enrollment.id).then(
      (d) => {
        setDraft(d);
        setBase(d.baseAmountVnd ? String(d.baseAmountVnd) : '');
        // Only the label is suggested; the amount of a real offer is always typed by the admin.
        if (d.isAlumni) setLabel('Ưu đãi học viên cũ');
        // Referred new family: the discount promised when they booked with a friend's code.
        if (d.referral) {
          setWithDiscount(true);
          setDiscount(String(d.referral.discountVnd));
          setLabel('Ưu đãi mã giới thiệu');
        }
      },
      (e) => setError(msg(e)),
    );
  }, [enrollment?.id]);

  const baseN = Number(digits(base)) || 0;
  const voucher = draft?.vouchers.find((v) => v.id === voucherId) ?? null;
  const discN = (withDiscount ? Number(digits(discount)) || 0 : 0) + (voucher?.amountVnd ?? 0);
  const discLabel = [withDiscount ? label.trim() : '', voucher ? `Voucher giới thiệu ${voucher.code}` : ''].filter(Boolean).join(' + ').slice(0, 80);
  const total = Math.max(baseN - discN, 0);

  const submit = async () => {
    const input = { enrollmentId: enrollment!.id, baseAmountVnd: baseN, discountVnd: discN, discountLabel: discN > 0 ? discLabel : undefined, note };
    const p = invoiceInputProblem(input);
    if (p) return setError(p.message);
    setBusy(true);
    setError(null);
    try {
      const inv = await createInvoice(input);
      setCreated(inv);
      if (voucher) {
        try {
          await redeemVoucher(voucher.id, inv.id);
        } catch (e) {
          setError(`Đã lập hóa đơn nhưng chưa trừ được voucher ${voucher.code}: ${msg(e)}`);
        }
      }
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!enrollment} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {enrollment && (
          <ScrollView className="max-h-[90%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled" testID="invoice-modal">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              {created ? 'Đã lập hóa đơn' : `Lập hóa đơn học phí · ${enrollment.studentName}`}
            </Text>
            {created ? (
              <>
                <View className="gap-1 rounded-2xl bg-emerald-50 p-3">
                  <Text className="text-[13px] font-bold text-emerald-800">
                    {created.ref} · {formatVnd(created.amountVnd)}
                  </Text>
                  <Text selectable className="text-xs leading-[18px] text-emerald-800" testID="invoice-link">
                    {paymentLink(created.id)}
                  </Text>
                </View>
                <Text className="text-[13px] leading-5 text-ink-muted">
                  Gửi link cho phụ huynh qua Zalo. Khi ba mẹ thanh toán, trạng thái tự chuyển sang "Đã đóng học phí" và biên lai được gửi qua Zalo (nếu đã cấu hình mẫu tin).
                </Text>
                <Button
                  title="Gửi link cho phụ huynh"
                  icon={<Send size={16} color="#fff" />}
                  onPress={() => shareText(invoiceShareText(enrollment.studentName, created.amountVnd, created.id)).catch(() => {})}
                />
                <View className="flex-row gap-2.5">
                  <Button className="flex-1" title="Mở trang thanh toán" variant="outline" onPress={() => onOpenPayment(created.id)} />
                  <Button className="flex-1" title="Xong" variant="ghost" onPress={onClose} />
                </View>
              </>
            ) : !draft && !error ? (
              <ActivityIndicator className="my-6" color={COLORS.brand} />
            ) : (
              <>
                <Text className="text-[13px] leading-5 text-ink-muted">
                  {courseTitle(enrollment.course as never, enrollment.level)} · {CAMPUS_LABELS[enrollment.campus]}
                  {draft && !draft.baseAmountVnd ? ' · Khóa này chưa có học phí mặc định — nhập số tiền.' : ''}
                </Text>
                <FormField label="Học phí (đồng)" value={vndInput(baseN)} onChangeText={(t) => { setBase(digits(t)); setError(null); }} placeholder="VD: 1.500.000" keyboardType="number-pad" />
                <Pressable
                  onPress={() => setWithDiscount((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: withDiscount }}
                  className="flex-row items-center gap-2.5 py-1"
                  testID="discount-toggle"
                >
                  <View className={`h-5 w-5 items-center justify-center rounded-md border-2 ${withDiscount ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                    {withDiscount && <CheckCircle2 size={14} color="#fff" />}
                  </View>
                  <Text className="flex-1 text-[14px] text-ink">Áp dụng ưu đãi</Text>
                  {draft?.isAlumni && (
                    <View className="rounded-full bg-emerald-50 px-2 py-0.5">
                      <Text className="text-[11px] font-bold text-emerald-700">Học viên cũ</Text>
                    </View>
                  )}
                </Pressable>
                {draft?.referral && <Text className="-mt-1 text-xs text-emerald-700">Gia đình mới đăng ký bằng mã giới thiệu — ưu đãi đã được điền sẵn.</Text>}
                {!!draft?.vouchers.length && (
                  <View className="gap-1.5" testID="voucher-picker">
                    <Text className="text-[13px] font-semibold text-ink-muted">Voucher giới thiệu của gia đình</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {draft.vouchers.map((v) => {
                        const on = v.id === voucherId;
                        return (
                          <Pressable key={v.id} onPress={() => setVoucherId(on ? null : v.id)} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }} className={`min-h-11 justify-center rounded-full border px-3 py-2 ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                            <Text className={`text-[13px] font-semibold ${on ? 'text-emerald-700' : 'text-ink'}`}>
                              {on ? '✓ ' : ''}
                              {v.code} · {formatVnd(v.amountVnd)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
                {withDiscount && (
                  <>
                    <FormField label="Số tiền ưu đãi (đồng)" value={vndInput(discN)} onChangeText={(t) => { setDiscount(digits(t)); setError(null); }} placeholder="VD: 200.000" keyboardType="number-pad" />
                    <FormField label="Tên ưu đãi (phụ huynh nhìn thấy)" value={label} onChangeText={(t) => { setLabel(t); setError(null); }} placeholder="VD: Ưu đãi học viên cũ" maxLength={80} />
                  </>
                )}
                <FormField label="Ghi chú (không bắt buộc)" value={note} onChangeText={(t) => { setNote(t); setError(null); }} placeholder="VD: Học phí tháng 12/2026" maxLength={200} />
                <View className="flex-row items-end justify-between rounded-2xl bg-slate-50 p-3">
                  <Text className="text-[13px] font-semibold text-ink">Phụ huynh thanh toán{discN > 0 ? ` (đã trừ ${formatVnd(discN)})` : ''}</Text>
                  <Text className="text-xl font-black text-accent-600" testID="invoice-modal-total">
                    {formatVnd(total)}
                  </Text>
                </View>
                {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
                <View className="flex-row gap-2.5">
                  <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
                  <Button className="flex-[2]" title="Lập hóa đơn" variant="accent" loading={busy} disabled={!draft} onPress={submit} />
                </View>
              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ConfirmPaidModal({ enrollment, onClose, onSubmit }: { enrollment: Enrollment | null; onClose: () => void; onSubmit: (note: string) => Promise<string | null> }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote('');
    setError(null);
  }, [enrollment?.id]);
  const submit = async () => {
    if (note.trim().length < 5) return setError('Ghi rõ cách nhận tiền (ít nhất 5 ký tự)');
    setBusy(true);
    const err = await onSubmit(note.trim());
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <Modal visible={!!enrollment} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {enrollment?.invoice && (
          <View className="gap-3 rounded-t-[28px] bg-white p-5" testID="confirm-paid-modal">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Xác nhận đã nhận học phí
            </Text>
            <Text className="text-[13px] leading-5 text-ink-muted">
              {enrollment.studentName} · {formatVnd(enrollment.invoice.amountVnd)} · {enrollment.invoice.ref}. Dùng khi phụ huynh nộp tiền mặt hoặc chuyển khoản sai nội dung. Thao tác được lưu lại cùng người xác nhận.
            </Text>
            <FormField label="Cách nhận tiền" value={note} onChangeText={(t) => { setNote(t); setError(null); }} placeholder="VD: Tiền mặt tại quầy Xa La" maxLength={200} />
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
              <Button className="flex-[2]" title="Xác nhận đã nhận" loading={busy} onPress={submit} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Contact book (parent portal) ───────────────────────────────────────────

const ATTENDANCE_OPTIONS: { id: Attendance; label: string }[] = [
  { id: 'PRESENT', label: 'Có mặt' },
  { id: 'ABSENT', label: 'Vắng' },
  { id: 'EXCUSED', label: 'Nghỉ có phép' },
];

function ReportModal({ enrollment, onClose, onDone }: { enrollment: Enrollment | null; onClose: () => void; onDone: (notice: string) => void }) {
  const [date, setDate] = useState('');
  const [attendance, setAttendance] = useState<Attendance>('PRESENT');
  const [feedback, setFeedback] = useState('');
  const [photos, setPhotos] = useState<PickedMedia[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new Date();
    setDate(`${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`);
    setAttendance('PRESENT');
    setFeedback('');
    setPhotos([]);
    setProgress(null);
    setError(null);
  }, [enrollment?.id]);

  const addPhoto = async () => {
    try {
      const p = await pickImage();
      if (!p) return;
      const problem = checkMedia(p, 'image');
      if (problem) return setError(problem);
      setPhotos((cur) => [...cur, p].slice(0, 6));
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  };

  const submit = async () => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
    if (!m) return setError('Ngày học dạng dd/mm/yyyy');
    const iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    if (attendance === 'PRESENT' && feedback.trim().length < 10) return setError('Viết nhận xét cho phụ huynh (ít nhất 10 ký tự)');
    setBusy(true);
    setError(null);
    try {
      const r = await createDailyReport({ enrollmentId: enrollment!.id, studentId: enrollment!.studentId!, sessionDate: iso, attendance, feedback, photos, onProgress: setProgress });
      onDone(`Đã ghi sổ liên lạc của ${enrollment!.studentName} ngày ${date}${r.sessionsRemaining !== null ? ` · còn ${r.sessionsRemaining} buổi` : ''}. Phụ huynh xem trong mục "Sổ liên lạc".`);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Modal visible={!!enrollment} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {enrollment && (
          <ScrollView className="max-h-[90%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled" testID="report-modal">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Sổ liên lạc · {enrollment.studentName}
            </Text>
            <FormField label="Ngày học" value={date} onChangeText={(t) => { setDate(t); setError(null); }} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" />
            <View className="flex-row gap-2">
              {ATTENDANCE_OPTIONS.map((o) => {
                const on = attendance === o.id;
                return (
                  <Pressable key={o.id} onPress={() => setAttendance(o.id)} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} className={`min-h-11 flex-1 items-center justify-center rounded-2xl border py-2.5 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                    <Text className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {attendance === 'PRESENT' && <Text className="-mt-1 text-[11px] text-ink-subtle">"Có mặt" trừ 1 buổi trong số buổi còn lại của khóa.</Text>}
            <View className="gap-1.5">
              <Text className="text-[13px] font-semibold text-ink-muted">Nhận xét gửi phụ huynh</Text>
              <TextInput
                value={feedback}
                onChangeText={(t) => { setFeedback(t); setError(null); }}
                multiline
                maxLength={2000}
                placeholder="VD: Hôm nay con viết nét khuyết đều, ngồi đúng tư thế; cần luyện thêm chữ hoa."
                placeholderTextColor={COLORS.subtle}
                accessibilityLabel="Nhận xét gửi phụ huynh"
                className="min-h-[100px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-ink"
                style={{ textAlignVertical: 'top' }}
              />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {photos.map((p, i) => (
                <View key={`${p.uri}-${i}`} className="h-20 w-20 overflow-hidden rounded-xl">
                  <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} />
                  <Pressable onPress={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} accessibilityLabel={`Bỏ ảnh ${i + 1}`} className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60">
                    <X size={13} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < 6 && (
                <Pressable onPress={addPhoto} accessibilityRole="button" accessibilityLabel="Thêm ảnh bài làm" className="h-20 w-20 items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 active:bg-slate-50">
                  <ImagePlus size={20} color={COLORS.subtle} />
                  <Text className="text-[10px] text-ink-subtle">Ảnh bài làm</Text>
                </Pressable>
              )}
            </View>
            <Text className="-mt-1 text-[11px] text-ink-subtle">Ảnh được lưu riêng tư — chỉ phụ huynh của bé và giáo viên xem được.</Text>
            {progress !== null && <Text className="text-xs text-brand-700">Đang tải ảnh… {Math.round(progress * 100)}%</Text>}
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
              <Button className="flex-[2]" title="Lưu & gửi phụ huynh" loading={busy} onPress={submit} />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
