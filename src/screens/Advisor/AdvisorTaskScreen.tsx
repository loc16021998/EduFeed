import { CheckCircle2, Clock, MessageCircleMore, Phone, Play, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, HeaderIconButton, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import { createTask, fetchMyKind, listTasks, staffDirectory, updateTask, type StaffKind, type StaffMember, type StaffTask, type TaskType } from '@/services/staffOps';
import { useStaffStore } from '@/store';
import { CAMPUS_LABELS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const TYPE_UI: Record<TaskType, { label: string; cls: string }> = {
  LEAD_FOLLOWUP: { label: 'Gọi khách', cls: 'bg-brand-50 text-brand-700' },
  MAKEUP_CLASS: { label: 'Học bù', cls: 'bg-violet-50 text-violet-700' },
  HOMEWORK_GRADE: { label: 'Chấm bài', cls: 'bg-amber-50 text-amber-800' },
  OTHER: { label: 'Khác', cls: 'bg-slate-100 text-slate-600' },
};
const PRIORITY: Record<1 | 2 | 3, { label: string; dot: string }> = { 1: { label: 'Ưu tiên cao', dot: '#DC2626' }, 2: { label: 'Bình thường', dot: '#F59E0B' }, 3: { label: 'Thấp', dot: '#94A3B8' } };
const pad = (n: number) => String(n).padStart(2, '0');
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function dueText(iso: string, now = new Date()): { text: string; late: boolean } {
  const d = new Date(iso);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d < now) {
    const h = Math.round((now.getTime() - d.getTime()) / 3600_000);
    return { text: h < 1 ? 'Vừa quá hạn' : h < 24 ? `Quá hạn ${h} giờ` : `Quá hạn ${Math.round(h / 24)} ngày`, late: true };
  }
  if (sameDay(d, now)) return { text: `Hạn ${hm} hôm nay`, late: false };
  const tomorrow = new Date(now.getTime() + 86400_000);
  if (sameDay(d, tomorrow)) return { text: `Hạn ${hm} ngày mai`, late: false };
  return { text: `Hạn ${hm} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, late: false };
}

/** Advisors / teachers: today's tasks sorted by urgency, with 1-tap call / Zalo / done. Route /quan-ly/cong-viec. */
export default function AdvisorTaskScreen({ navigation }: RootStackScreenProps<'AdvisorTasks'>) {
  const insets = useSafeAreaInsets();
  const { status: authStatus, isStaff, demo } = useStaffStore();
  const [kind, setKind] = useState<StaffKind | null>(null);
  const [scope, setScope] = useState<'MINE' | 'ALL'>('MINE');
  const [status, setStatus] = useState<'OPEN' | 'DONE'>('OPEN');
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<StaffTask | null>(null);
  const [creating, setCreating] = useState(false);
  const manager = kind === 'ADMIN' || kind === 'MANAGER';

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
  }, [authStatus, isStaff, navigation]);
  useEffect(() => {
    if (isStaff) fetchMyKind().then(setKind, () => setKind(null));
  }, [isStaff]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await listTasks(scope, status));
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [scope, status]);
  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  const groups = useMemo(() => {
    if (status === 'DONE') return [{ title: 'Đã hoàn thành (14 ngày)', items: tasks }];
    const now = new Date();
    const late = tasks.filter((t) => new Date(t.dueDate) < now);
    const today = tasks.filter((t) => new Date(t.dueDate) >= now && sameDay(new Date(t.dueDate), now));
    const later = tasks.filter((t) => new Date(t.dueDate) >= now && !sameDay(new Date(t.dueDate), now));
    return [
      { title: `Quá hạn (${late.length})`, items: late, tone: 'text-red-600' },
      { title: `Hôm nay (${today.length})`, items: today, tone: 'text-ink' },
      { title: `Sắp tới (${later.length})`, items: later, tone: 'text-ink-muted' },
    ].filter((g) => g.items.length > 0);
  }, [tasks, status]);

  const act = async (t: StaffTask, next: 'IN_PROGRESS' | 'COMPLETED', note?: string) => {
    setBusyId(t.id);
    setError(null);
    try {
      await updateTask(t.id, next, note);
      if (next === 'COMPLETED') setNotice(`Đã hoàn thành: ${t.title}`);
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Công việc"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('StaffVideos'))}
        right={
          manager ? (
            <HeaderIconButton label="Giao việc" onPress={() => setCreating(true)}>
              <Plus size={22} color={COLORS.ink} />
            </HeaderIconButton>
          ) : undefined
        }
      />
      <View className="gap-2 px-4 pb-2">
        <View className="flex-row rounded-2xl bg-slate-100 p-1">
          {(
            [
              ['OPEN', 'Đang mở'],
              ['DONE', 'Đã xong'],
            ] as const
          ).map(([id, label]) => (
            <Pressable key={id} onPress={() => setStatus(id)} accessibilityRole="tab" aria-selected={status === id} accessibilityState={{ selected: status === id }} className={`h-10 flex-1 items-center justify-center rounded-xl ${status === id ? 'bg-white' : ''}`}>
              <Text className={`text-[14px] font-bold ${status === id ? 'text-brand-700' : 'text-ink-muted'}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {manager && (
          <View className="flex-row gap-2">
            {(
              [
                ['MINE', 'Việc của tôi'],
                ['ALL', 'Cả trung tâm'],
              ] as const
            ).map(([id, label]) => (
              <Pressable key={id} onPress={() => setScope(id)} accessibilityRole="radio" aria-checked={scope === id} accessibilityState={{ checked: scope === id }} className={`h-9 justify-center rounded-full border px-3.5 ${scope === id ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'}`}>
                <Text className={`text-[13px] font-semibold ${scope === id ? 'text-white' : 'text-ink-muted'}`}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <ScrollView
        contentContainerClassName="gap-3 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={loading && tasks.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
        testID="task-list"
      >
        {(demo || !hasSupabase) && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: công việc chỉ để minh họa.</Text>}
        {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs leading-[18px] text-emerald-800">{notice}</Text>}
        {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
        {loading && tasks.length === 0 && <ActivityIndicator className="mt-8" color={COLORS.brand} />}
        {!loading && tasks.length === 0 && !error && (
          <Text className="mt-8 px-6 text-center text-[14px] text-ink-muted">{status === 'OPEN' ? 'Không còn việc nào. Tuyệt vời! 🎉' : 'Chưa có việc hoàn thành gần đây.'}</Text>
        )}
        {groups.map((g) => (
          <View key={g.title} className="gap-2.5">
            <Text className={`px-1 text-[13px] font-bold uppercase tracking-wide ${'tone' in g ? g.tone : 'text-ink-muted'}`}>{g.title}</Text>
            {g.items.map((t) => (
              <TaskCard key={t.id} t={t} busy={busyId === t.id} showAssignee={scope === 'ALL'} onStart={() => act(t, 'IN_PROGRESS')} onDone={() => setCompleting(t)} />
            ))}
          </View>
        ))}
      </ScrollView>

      <CompleteModal
        task={completing}
        onClose={() => setCompleting(null)}
        onSubmit={async (note) => {
          const t = completing!;
          setCompleting(null);
          await act(t, 'COMPLETED', note);
        }}
      />
      {manager && (
        <CreateTaskModal
          visible={creating}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            setNotice('Đã giao việc.');
            await load();
          }}
        />
      )}
    </View>
  );
}

function TaskCard({ t, busy, showAssignee, onStart, onDone }: { t: StaffTask; busy: boolean; showAssignee: boolean; onStart: () => void; onDone: () => void }) {
  const due = dueText(t.dueDate);
  const phone = t.lead?.phone ?? t.request?.parentPhone ?? null;
  const done = t.status === 'COMPLETED';
  return (
    <View className={`gap-2.5 rounded-3xl bg-white p-4 ${due.late && !done ? 'border border-red-200' : ''}`} testID="task-card">
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRIORITY[t.priority].dot }} accessibilityLabel={PRIORITY[t.priority].label} />
        <Text className={`overflow-hidden rounded-full px-2 py-0.5 text-[11px] font-bold ${TYPE_UI[t.targetType].cls}`}>{TYPE_UI[t.targetType].label}</Text>
        {t.status === 'IN_PROGRESS' && <Text className="overflow-hidden rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">Đang làm</Text>}
        <View className="flex-1" />
        {!done && (
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={due.late ? '#DC2626' : COLORS.subtle} />
            <Text className={`text-[11px] font-semibold ${due.late ? 'text-red-600' : 'text-ink-subtle'}`}>{due.text}</Text>
          </View>
        )}
      </View>
      <Text className="text-[15px] font-bold leading-5 text-ink">{t.title}</Text>
      {!!t.lead && (
        <Text className="text-[13px] leading-5 text-ink-muted">
          {t.lead.studentName} · {CATEGORY_LABELS[t.lead.courseCode]} · {CAMPUS_LABELS[t.lead.branch]}
          {t.lead.appointmentTime ? ` · học thử ${dueText(t.lead.appointmentTime).text.replace('Hạn ', '')}` : ''}
        </Text>
      )}
      {!!t.request && (
        <Text className="text-[13px] leading-5 text-ink-muted">
          {t.request.studentName} · xin học bù · {t.request.reason}
        </Text>
      )}
      {!t.lead && !t.request && !!t.description && <Text className="text-[13px] leading-5 text-ink-muted">{t.description}</Text>}
      {showAssignee && !!t.assignee && <Text className="text-[11px] text-ink-subtle">Giao cho: {t.assignee}{t.auto ? ' · tự động' : ''}</Text>}
      {done && !!t.resultNote && <Text className="rounded-2xl bg-slate-50 p-2.5 text-[13px] text-ink">“{t.resultNote}”</Text>}

      {!done && (
        <View className="gap-2">
          {!!phone && (
            <View className="flex-row gap-2">
              <Pressable onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} accessibilityRole="button" accessibilityLabel={`Gọi ${formatPhone(phone)}`} className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 active:bg-emerald-600">
                <Phone size={16} color="#fff" />
                <Text className="text-[14px] font-bold text-white">Gọi điện ngay</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(`https://zalo.me/${phone}`).catch(() => {})} accessibilityRole="button" accessibilityLabel={`Nhắn Zalo ${formatPhone(phone)}`} className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-[#0068FF] active:opacity-90">
                <MessageCircleMore size={16} color="#fff" />
                <Text className="text-[14px] font-bold text-white">Nhắn Zalo</Text>
              </Pressable>
            </View>
          )}
          <View className="flex-row gap-2">
            {t.status === 'PENDING' && (
              <Pressable onPress={onStart} disabled={busy} accessibilityRole="button" className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white active:bg-slate-50">
                <Play size={14} color={COLORS.ink} />
                <Text className="text-[14px] font-semibold text-ink">Bắt đầu</Text>
              </Pressable>
            )}
            <Pressable onPress={onDone} disabled={busy} accessibilityRole="button" className="h-11 flex-[2] flex-row items-center justify-center gap-1.5 rounded-2xl bg-brand-500 active:bg-brand-600" testID="task-done">
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <CheckCircle2 size={16} color="#fff" />}
              <Text className="text-[14px] font-bold text-white">Hoàn thành</Text>
            </Pressable>
          </View>
          {!!phone && <Text className="text-center text-[11px] text-ink-subtle">{formatPhone(phone)}</Text>}
        </View>
      )}
    </View>
  );
}

function CompleteModal({ task, onClose, onSubmit }: { task: StaffTask | null; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('');
  useEffect(() => setNote(''), [task?.id]);
  return (
    <Modal visible={!!task} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {task && (
          <View className="gap-3 rounded-t-[28px] bg-white p-5" testID="complete-task">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Hoàn thành công việc
            </Text>
            <Text className="text-[13px] text-ink-muted">{task.title}</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              placeholder="Kết quả (không bắt buộc), VD: Đã gọi, mẹ xác nhận đến đúng giờ"
              placeholderTextColor={COLORS.subtle}
              accessibilityLabel="Kết quả công việc"
              className="min-h-[80px] rounded-2xl border border-slate-200 px-4 py-3 text-[15px] text-ink"
              style={{ textAlignVertical: 'top' }}
            />
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} />
              <Button className="flex-[2]" title="Xác nhận hoàn thành" onPress={() => onSubmit(note)} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const DUE_PRESETS: { label: string; at: () => Date }[] = [
  { label: 'Trong 2 giờ', at: () => new Date(Date.now() + 2 * 3600_000) },
  { label: 'Cuối ngày', at: () => { const d = new Date(); d.setHours(18, 0, 0, 0); return d < new Date() ? new Date(Date.now() + 3600_000) : d; } },
  { label: 'Ngày mai', at: () => { const d = new Date(Date.now() + 86400_000); d.setHours(10, 0, 0, 0); return d; } },
  { label: '3 ngày', at: () => { const d = new Date(Date.now() + 3 * 86400_000); d.setHours(10, 0, 0, 0); return d; } },
];

function CreateTaskModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<TaskType>('OTHER');
  const [due, setDue] = useState(0);
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDesc('');
    setType('OTHER');
    setDue(0);
    setPriority(2);
    setError(null);
    staffDirectory().then((s) => setStaff(s.filter((x) => x.role === 'staff')), (e) => setError(msg(e)));
  }, [visible]);

  const submit = async () => {
    if (!assignee) return setError('Chọn người nhận việc');
    setBusy(true);
    setError(null);
    try {
      await createTask({ assignedTo: assignee, title, description: desc, type, due: DUE_PRESETS[due].at().toISOString(), priority });
      onCreated();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} className={`h-9 justify-center rounded-full border px-3 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <Text className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <ScrollView className="max-h-[90%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled" testID="create-task">
          <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
            Giao việc
          </Text>
          <Text className="text-[13px] font-semibold text-ink-muted">Người nhận</Text>
          <View className="flex-row flex-wrap gap-2">
            {staff.map((s) => (
              <Chip key={s.id} on={assignee === s.id} label={`${s.displayName ?? s.email}${s.openTasks ? ` (${s.openTasks})` : ''}`} onPress={() => setAssignee(s.id)} />
            ))}
          </View>
          <FormField label="Việc cần làm" value={title} onChangeText={setTitle} placeholder="VD: Gọi lại cho phụ huynh bé Na" maxLength={120} />
          <View className="flex-row flex-wrap gap-2">
            {(Object.keys(TYPE_UI) as TaskType[]).map((k) => (
              <Chip key={k} on={type === k} label={TYPE_UI[k].label} onPress={() => setType(k)} />
            ))}
          </View>
          <Text className="text-[13px] font-semibold text-ink-muted">Hạn</Text>
          <View className="flex-row flex-wrap gap-2">
            {DUE_PRESETS.map((p, i) => (
              <Chip key={p.label} on={due === i} label={p.label} onPress={() => setDue(i)} />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {([1, 2, 3] as const).map((p) => (
              <Chip key={p} on={priority === p} label={PRIORITY[p].label} onPress={() => setPriority(p)} />
            ))}
          </View>
          <FormField label="Ghi chú (không bắt buộc)" value={desc} onChangeText={setDesc} placeholder="Chi tiết, số điện thoại…" maxLength={1000} />
          {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          <View className="flex-row gap-2.5">
            <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
            <Button className="flex-[2]" title="Giao việc" loading={busy} onPress={submit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
