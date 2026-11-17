import { CheckCircle2, Plus, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Button, HeaderIconButton, ScreenHeader, Select } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import type { ScheduleSlot } from '@/services/parentPortal';
import { classCandidates, listClasses, saveClass, setClassMembers, staffDirectory, type ClassCandidate, type ClassInfo, type StaffMember } from '@/services/staffOps';
import { useStaffStore } from '@/store';
import type { CampusLocation, CourseCategory } from '@/types';
import { CAMPUS_LABELS, CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const COURSES = (Object.keys(CATEGORY_LABELS) as string[]).filter((c) => c !== 'ALL') as CourseCategory[];
const CAMPUSES = Object.keys(CAMPUS_LABELS) as CampusLocation[];
const DAYS = [2, 3, 4, 5, 6, 7, 8];
const dayLabel = (d: number) => (d === 8 ? 'CN' : `T${d}`);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} className={`h-10 justify-center rounded-full border px-3.5 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <Text className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

/** Admin / manager: classes, their teacher and schedule, and which students are in them. Route /quan-tri/lop-hoc. */
export default function ClassesScreen({ navigation }: RootStackScreenProps<'Classes'>) {
  const { status: authStatus, isStaff, isAdmin, demo } = useStaffStore();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClassInfo | 'new' | null>(null);
  const [members, setMembers] = useState<ClassInfo | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('AdminLogin');
    else if (authStatus === 'signedIn' && !isAdmin) navigation.replace('StaffVideos');
  }, [authStatus, isStaff, isAdmin, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClasses(await listClasses());
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Lớp học & phân công"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'))}
        right={
          <HeaderIconButton label="Tạo lớp" onPress={() => setEditing('new')}>
            <Plus size={22} color={COLORS.ink} />
          </HeaderIconButton>
        }
      />
      <FlatList
        data={classes}
        keyExtractor={(c) => c.id}
        contentContainerClassName="gap-3 px-4 pb-10"
        refreshControl={<RefreshControl refreshing={loading && classes.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
        ListHeaderComponent={
          <View className="gap-2 pb-1">
            {(demo || !hasSupabase) && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: lớp học chỉ lưu tạm.</Text>}
            <Text className="text-xs leading-[18px] text-ink-muted">Giáo viên chỉ thấy học viên trong lớp mình dạy. Phân vai trò giáo viên / tư vấn ở Tài khoản nhân viên.</Text>
            {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs leading-[18px] text-emerald-800">{notice}</Text>}
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          </View>
        }
        renderItem={({ item: c }) => (
          <View className={`gap-2 rounded-3xl bg-white p-4 ${c.isActive ? '' : 'opacity-60'}`} testID="class-card">
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.courseCode] }} />
              <Text className="flex-1 text-[15px] font-bold text-ink">{c.name}</Text>
              {!c.isActive && <Text className="text-[11px] font-bold text-ink-subtle">Đã đóng</Text>}
            </View>
            <Text className="text-[13px] text-ink-muted">
              {CATEGORY_LABELS[c.courseCode]}
              {c.level > 1 ? ` cấp ${c.level}` : ''} · {CAMPUS_LABELS[c.campus]}
            </Text>
            <Text className="text-[13px] text-ink-muted">
              {c.teacherName ? `GV: ${c.teacherName}` : 'Chưa có giáo viên'} · {c.schedule.map((s) => `${dayLabel(s.d)} ${s.start}`).join(', ') || 'chưa có lịch'}
            </Text>
            <View className="flex-row gap-2">
              <Button className="flex-1" size="sm" title={`Học viên (${c.members})`} variant="outline" icon={<Users size={14} color={COLORS.brand} />} onPress={() => setMembers(c)} />
              <Button className="flex-1" size="sm" title="Sửa lớp" variant="ghost" onPress={() => setEditing(c)} />
            </View>
          </View>
        )}
        ListEmptyComponent={loading ? <ActivityIndicator className="mt-8" color={COLORS.brand} /> : <Text className="mt-8 px-8 text-center text-ink-muted">Chưa có lớp nào. Bấm + để tạo lớp.</Text>}
      />

      <ClassModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={async (text) => {
          setEditing(null);
          setNotice(text);
          await load();
        }}
      />
      <MembersModal
        cls={members}
        onClose={() => setMembers(null)}
        onSaved={async (text) => {
          setMembers(null);
          setNotice(text);
          await load();
        }}
      />
    </View>
  );
}

function ClassModal({ value, onClose, onSaved }: { value: ClassInfo | 'new' | null; onClose: () => void; onSaved: (notice: string) => void }) {
  const editing = value && value !== 'new' ? value : null;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [name, setName] = useState('');
  const [course, setCourse] = useState<CourseCategory | null>(null);
  const [level, setLevel] = useState(1);
  const [campus, setCampus] = useState<CampusLocation | null>(null);
  const [teacher, setTeacher] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('17:30');
  const [end, setEnd] = useState('19:00');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    setError(null);
    staffDirectory().then(setStaff, () => setStaff([]));
    setName(editing?.name ?? '');
    setCourse(editing?.courseCode ?? null);
    setLevel(editing?.level ?? 1);
    setCampus(editing?.campus ?? null);
    setTeacher(editing?.teacherId ?? null);
    setDays(editing?.schedule.map((s) => s.d) ?? []);
    setStart(editing?.schedule[0]?.start ?? '17:30');
    setEnd(editing?.schedule[0]?.end ?? '19:00');
    setActive(editing?.isActive ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const teachers = staff.filter((s) => s.kind === 'TEACHER' || s.kind === 'MANAGER' || s.kind === 'ADMIN');

  const submit = async () => {
    if (name.trim().length < 2) return setError('Đặt tên lớp, VD: Tiền tiểu học A1');
    if (!course) return setError('Chọn khóa học');
    if (!campus) return setError('Chọn cơ sở');
    if (days.length && (!TIME_RE.test(start) || !TIME_RE.test(end) || end <= start)) return setError('Giờ học dạng HH:MM, giờ kết thúc sau giờ bắt đầu');
    const schedule: ScheduleSlot[] = days.map((d) => ({ d, start, end }));
    setBusy(true);
    setError(null);
    try {
      await saveClass({ id: editing?.id, name, courseCode: course, level, campus, teacherId: teacher, schedule, isActive: active });
      onSaved(editing ? `Đã lưu lớp ${name.trim()}.` : `Đã tạo lớp ${name.trim()}. Bấm "Học viên" để thêm học viên.`);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!value} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <ScrollView className="max-h-[92%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled" testID="class-modal">
          <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
            {editing ? 'Sửa lớp' : 'Tạo lớp mới'}
          </Text>
          <FormField label="Tên lớp" value={name} onChangeText={(t) => { setName(t); setError(null); }} placeholder="VD: Tiền tiểu học A1" maxLength={60} />
          <Select label="Khóa học" value={course} options={COURSES.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))} onChange={setCourse} placeholder="Chọn khóa" />
          <View className="flex-row flex-wrap gap-2">
            {[1, 2, 3].map((l) => (
              <Chip key={l} on={level === l} label={`Cấp ${l}`} onPress={() => setLevel(l)} />
            ))}
          </View>
          <Text className="text-[13px] font-semibold text-ink-muted">Cơ sở</Text>
          <View className="flex-row flex-wrap gap-2">
            {CAMPUSES.map((c) => (
              <Chip key={c} on={campus === c} label={CAMPUS_LABELS[c]} onPress={() => setCampus(c)} />
            ))}
          </View>
          <Text className="text-[13px] font-semibold text-ink-muted">Giáo viên phụ trách</Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip on={teacher === null} label="Chưa phân" onPress={() => setTeacher(null)} />
            {teachers.map((s) => (
              <Chip key={s.id} on={teacher === s.id} label={s.displayName ?? s.email} onPress={() => setTeacher(s.id)} />
            ))}
          </View>
          <Text className="text-[13px] font-semibold text-ink-muted">Lịch học cố định</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <Chip key={d} on={days.includes(d)} label={dayLabel(d)} onPress={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()))} />
            ))}
          </View>
          {days.length > 0 && (
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <FormField label="Từ" value={start} onChangeText={(t) => setStart(t.slice(0, 5))} placeholder="17:30" maxLength={5} />
              </View>
              <View className="flex-1">
                <FormField label="Đến" value={end} onChangeText={(t) => setEnd(t.slice(0, 5))} placeholder="19:00" maxLength={5} />
              </View>
            </View>
          )}
          {editing && (
            <View className="flex-row gap-2">
              <Chip on={active} label="Đang mở" onPress={() => setActive(true)} />
              <Chip on={!active} label="Đã đóng lớp" onPress={() => setActive(false)} />
            </View>
          )}
          {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          <View className="flex-row gap-2.5">
            <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
            <Button className="flex-[2]" title={editing ? 'Lưu lớp' : 'Tạo lớp'} loading={busy} onPress={submit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MembersModal({ cls, onClose, onSaved }: { cls: ClassInfo | null; onClose: () => void; onSaved: (notice: string) => void }) {
  const [list, setList] = useState<ClassCandidate[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!cls) return;
    setList(null);
    setError(null);
    classCandidates(cls.id).then(
      (l) => {
        setList(l);
        setPicked(l.filter((x) => x.inClass).map((x) => x.enrollmentId));
      },
      (e) => setError(msg(e)),
    );
  }, [cls]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = await setClassMembers(cls!.id, picked);
      onSaved(`Lớp ${cls!.name} có ${n} học viên.`);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={!!cls} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {cls && (
          <ScrollView className="max-h-[88%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" testID="members-modal">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Học viên · {cls.name}
            </Text>
            <Text className="text-xs leading-[18px] text-ink-muted">
              Học viên đang học {CATEGORY_LABELS[cls.courseCode]} tại {CAMPUS_LABELS[cls.campus]}.
            </Text>
            {!list && !error && <ActivityIndicator color={COLORS.brand} />}
            {list?.length === 0 && <Text className="text-[13px] text-ink-muted">Chưa có học viên nào đang học khóa này tại cơ sở này.</Text>}
            {list?.map((c) => {
              const on = picked.includes(c.enrollmentId);
              return (
                <Pressable key={c.enrollmentId} onPress={() => setPicked((cur) => (on ? cur.filter((x) => x !== c.enrollmentId) : [...cur, c.enrollmentId]))} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }} className={`min-h-12 flex-row items-center gap-3 rounded-2xl border px-3 py-2 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                  <View className={`h-6 w-6 items-center justify-center rounded-md border-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>{on && <CheckCircle2 size={14} color="#fff" />}</View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-ink">{c.studentName}</Text>
                    {!!c.otherClass && <Text className="text-[11px] text-amber-700">Đang ở lớp {c.otherClass}</Text>}
                  </View>
                </Pressable>
              );
            })}
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
              <Button className="flex-[2]" title={`Lưu (${picked.length})`} loading={busy} onPress={save} disabled={!list} />
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
