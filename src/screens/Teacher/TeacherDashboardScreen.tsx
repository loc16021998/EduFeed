import { CheckCircle2, CircleAlert, ImagePlus, QrCode, Send, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader } from '@/components';
import QrScanner from '@/components/QrScanner';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { pickImage } from '@/services/media/mediaPicker';
import { checkMedia } from '@/services/media/storageUpload';
import {
  FEEDBACK_TAGS,
  fetchRoster,
  listClasses,
  markAttendance,
  scanAttendance,
  sendBatchReport,
  todayD,
  type AttendanceStatus,
  type ClassInfo,
  type RosterRow,
} from '@/services/staffOps';
import { useStaffStore } from '@/store';
import type { PickedMedia } from '@/types';

import FlashComposer from './components/FlashComposer';
import VoiceNoteField from './components/VoiceNoteField';
import { CAMPUS_LABELS, CATEGORY_COLORS, COLORS } from '@/utils/constants';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const STATUS: { id: AttendanceStatus; label: string; on: string }[] = [
  { id: 'PRESENT', label: 'Có mặt', on: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { id: 'LATE', label: 'Muộn', on: 'border-amber-500 bg-amber-50 text-amber-800' },
  { id: 'ABSENT', label: 'Vắng', on: 'border-red-500 bg-red-50 text-red-700' },
  { id: 'EXCUSED', label: 'Phép', on: 'border-sky-500 bg-sky-50 text-sky-700' },
];
const STATUS_LABEL: Record<AttendanceStatus, string> = { PRESENT: 'Có mặt', LATE: 'Đi muộn', ABSENT: 'Vắng', EXCUSED: 'Nghỉ phép' };
const dayLabel = (d: number) => (d === 8 ? 'CN' : `T${d}`);

/** Teachers: my classes → QR / manual attendance → one contact-book entry for the whole class. Route /quan-ly/lop-hoc. */
export default function TeacherDashboardScreen({ navigation }: RootStackScreenProps<'TeacherDashboard'>) {
  const insets = useSafeAreaInsets();
  const { status: authStatus, isStaff, demo } = useStaffStore();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [tab, setTab] = useState<'attendance' | 'report' | 'flash'>('attendance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
  }, [authStatus, isStaff, navigation]);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = (await listClasses()).filter((c) => c.isActive);
      setClasses(list);
      // Today's class first.
      setClassId((cur) => cur ?? (list.find((c) => c.schedule.some((s) => s.d === todayD())) ?? list[0])?.id ?? null);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  const loadRoster = useCallback(async () => {
    if (!classId) return setRoster([]);
    try {
      setRoster(await fetchRoster(classId));
    } catch (e) {
      setError(msg(e));
    }
  }, [classId]);

  useEffect(() => {
    if (isStaff) loadClasses();
  }, [isStaff, loadClasses]);
  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const cls = classes.find((c) => c.id === classId) ?? null;
  const present = roster.filter((r) => r.attendance?.status === 'PRESENT' || r.attendance?.status === 'LATE').length;

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Lớp của tôi" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('StaffVideos'))} />
      <ScrollView
        contentContainerClassName="gap-3 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={loading && classes.length > 0} onRefresh={() => { loadClasses(); loadRoster(); }} tintColor={COLORS.brand} />}
        keyboardShouldPersistTaps="handled"
        testID="teacher-dashboard"
      >
        {(demo || !hasSupabase) && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: lớp và học viên chỉ để minh họa.</Text>}
        {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
        {loading && classes.length === 0 && <ActivityIndicator className="mt-8" color={COLORS.brand} />}
        {!loading && classes.length === 0 && !error && (
          <View className="items-center gap-2 rounded-3xl bg-white p-6">
            <Text className="text-center text-[15px] font-bold text-ink">Bạn chưa được phân lớp</Text>
            <Text className="text-center text-[13px] leading-5 text-ink-muted">Quản trị viên phân lớp ở Quản trị → Lớp học & phân công.</Text>
          </View>
        )}

        {classes.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" testID="class-switcher">
            {classes.map((c) => {
              const on = c.id === classId;
              const today = c.schedule.some((s) => s.d === todayD());
              return (
                <Pressable key={c.id} onPress={() => setClassId(c.id)} accessibilityRole="tab" aria-selected={on} accessibilityState={{ selected: on }} className={`min-h-11 justify-center rounded-2xl border px-3.5 py-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'}`}>
                  <Text className={`text-[14px] font-bold ${on ? 'text-white' : 'text-ink'}`}>{c.name}</Text>
                  <Text className={`text-[11px] ${on ? 'text-white/80' : 'text-ink-subtle'}`}>
                    {today ? 'Hôm nay · ' : ''}
                    {c.members} học viên
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {cls && (
          <>
            <View className="flex-row items-center gap-2 rounded-2xl bg-white p-3">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cls.courseCode] }} />
              <Text className="flex-1 text-[13px] text-ink-muted">
                {CAMPUS_LABELS[cls.campus]} · {cls.schedule.map((s) => `${dayLabel(s.d)} ${s.start}`).join(', ') || 'chưa có lịch'}
              </Text>
              <Text className="text-[13px] font-extrabold text-emerald-700" testID="present-count">
                {present}/{roster.length} có mặt
              </Text>
            </View>

            <View className="flex-row rounded-2xl bg-slate-100 p-1">
              {(
                [
                  ['attendance', 'Điểm danh'],
                  ['report', 'Sổ liên lạc'],
                  ['flash', 'Khoảnh khắc'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" aria-selected={tab === id} accessibilityState={{ selected: tab === id }} className={`h-10 flex-1 items-center justify-center rounded-xl ${tab === id ? 'bg-white' : ''}`}>
                  <Text className={`text-[14px] font-bold ${tab === id ? 'text-brand-700' : 'text-ink-muted'}`}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {tab === 'attendance' ? (
              <AttendancePanel cls={cls} roster={roster} onChanged={loadRoster} />
            ) : tab === 'report' ? (
              <BatchReportPanel cls={cls} roster={roster} onSent={loadRoster} />
            ) : (
              <FlashComposer key={cls.id} cls={cls} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Attendance ─────────────────────────────────────────────────────────────

function AttendancePanel({ cls, roster, onChanged }: { cls: ClassInfo; roster: RosterRow[]; onChanged: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (r: { ok: boolean; text: string }) => {
    setResult(r);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 3500);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onCode = async (code: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await scanAttendance(cls.id, code);
      show({ ok: true, text: r.already ? `${r.studentName} đã điểm danh rồi` : `✓ ${r.studentName} · ${STATUS_LABEL[r.status]}` });
      onChanged();
    } catch (e) {
      show({ ok: false, text: msg(e) });
    } finally {
      setBusy(false);
    }
  };

  const mark = async (r: RosterRow, s: AttendanceStatus) => {
    if (!r.studentId) return;
    try {
      await markAttendance(cls.id, r.studentId, s);
      onChanged();
    } catch (e) {
      show({ ok: false, text: msg(e) });
    }
  };

  return (
    <View className="gap-3">
      <Button
        title={scanning ? 'Tắt quét QR' : 'Quét QR điểm danh'}
        variant={scanning ? 'outline' : 'primary'}
        icon={scanning ? <X size={18} color={COLORS.brand} /> : <QrCode size={18} color="#fff" />}
        onPress={() => setScanning((v) => !v)}
        testID="toggle-scanner"
      />
      {scanning && <QrScanner onCode={onCode} paused={busy} />}
      {!!result && (
        <View className={`flex-row items-center gap-2 rounded-2xl p-3 ${result.ok ? 'bg-emerald-50' : 'bg-red-50'}`} accessibilityLiveRegion="polite" testID="scan-result">
          {result.ok ? <CheckCircle2 size={18} color="#059669" /> : <CircleAlert size={18} color="#DC2626" />}
          <Text className={`flex-1 text-[14px] font-semibold ${result.ok ? 'text-emerald-800' : 'text-red-700'}`}>{result.text}</Text>
        </View>
      )}

      {roster.length === 0 && <Text className="rounded-3xl bg-white p-5 text-center text-[13px] text-ink-muted">Lớp chưa có học viên.</Text>}
      {roster.map((r) => (
        <View key={r.enrollmentId} className="gap-2 rounded-3xl bg-white p-3.5" testID="roster-row">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-[15px] font-bold text-ink">{r.studentName}</Text>
            <Text className={`text-xs font-semibold ${r.sessionsRemaining !== null && r.sessionsRemaining < 3 ? 'text-red-600' : 'text-ink-subtle'}`}>
              {r.sessionsRemaining === null ? '' : `còn ${r.sessionsRemaining} buổi`}
              {r.attendance?.method === 'QR' ? ' · QR' : ''}
            </Text>
          </View>
          {r.linked ? (
            <View className="flex-row gap-1.5">
              {STATUS.map((s) => {
                const on = r.attendance?.status === s.id;
                return (
                  <Pressable key={s.id} onPress={() => mark(r, s.id)} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={`${s.label} – ${r.studentName}`} className={`h-10 flex-1 items-center justify-center rounded-xl border ${on ? s.on : 'border-slate-200 bg-white'}`}>
                    <Text className={`text-[13px] font-bold ${on ? '' : 'text-ink-muted'}`}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="text-[11px] text-ink-subtle">Chưa liên kết tài khoản phụ huynh — quản trị viên liên kết để điểm danh và gửi sổ liên lạc.</Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Batch contact book ─────────────────────────────────────────────────────

function BatchReportPanel({ cls, roster, onSent }: { cls: ClassInfo; roster: RosterRow[]; onSent: () => void }) {
  const eligible = useMemo(() => roster.filter((r) => r.linked && r.studentId), [roster]);
  const [selected, setSelected] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [photos, setPhotos] = useState<PickedMedia[]>([]);
  const [voice, setVoice] = useState<PickedMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Default: everyone who attended and has no entry yet.
  useEffect(() => {
    setSelected(eligible.filter((r) => !r.reported && r.attendance?.status !== 'ABSENT' && r.attendance?.status !== 'EXCUSED').map((r) => r.studentId!));
  }, [eligible, cls.id]);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const addPhoto = async () => {
    try {
      const p = await pickImage();
      if (!p) return;
      const problem = checkMedia(p, 'image');
      if (problem) return setError(problem);
      setPhotos((cur) => [...cur, p].slice(0, 6));
    } catch (e) {
      setError(msg(e));
    }
  };
  const send = async () => {
    setError(null);
    if (selected.length === 0) return setError('Chọn ít nhất 1 học viên');
    if (!feedback.trim() && tags.length === 0) return setError('Chọn nhận xét nhanh hoặc viết vài dòng cho phụ huynh');
    setBusy(true);
    try {
      const r = await sendBatchReport({ classId: cls.id, studentIds: selected, feedback, tags, photos, voice, onProgress: setProgress });
      setNotice(`Đã gửi sổ liên lạc cho ${r.created} học viên${r.skipped ? ` · ${r.skipped} bé đã có nhận xét buổi này` : ''}.`);
      setFeedback('');
      setTags([]);
      setPhotos([]);
      setVoice(null);
      onSent();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <View className="gap-3" testID="batch-report">
      {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs leading-[18px] text-emerald-800">{notice}</Text>}
      <View className="gap-2 rounded-3xl bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-[15px] font-bold text-ink">Học viên ({selected.length})</Text>
          <Pressable onPress={() => setSelected(selected.length === eligible.length ? [] : eligible.map((r) => r.studentId!))} accessibilityRole="button" className="h-9 justify-center px-2">
            <Text className="text-[13px] font-semibold text-brand-700">{selected.length === eligible.length ? 'Bỏ chọn' : 'Chọn tất cả'}</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {eligible.map((r) => {
            const on = selected.includes(r.studentId!);
            return (
              <Pressable key={r.enrollmentId} onPress={() => toggle(r.studentId!)} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }} className={`h-10 flex-row items-center gap-1.5 rounded-full border px-3 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                {on && <CheckCircle2 size={14} color={COLORS.brand} />}
                <Text className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{r.studentName}</Text>
                {r.reported && <Text className="text-[10px] text-ink-subtle">đã gửi</Text>}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2 rounded-3xl bg-white p-4">
        <Text className="text-[15px] font-bold text-ink">Nhận xét nhanh</Text>
        <View className="flex-row flex-wrap gap-2">
          {FEEDBACK_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <Pressable key={t} onPress={() => setTags((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t].slice(0, 8)))} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }} className={`h-9 justify-center rounded-full border px-3 ${on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <Text className={`text-[13px] font-semibold ${on ? 'text-emerald-700' : 'text-ink-muted'}`}>{t}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={feedback}
          onChangeText={setFeedback}
          multiline
          maxLength={2000}
          placeholder="Nội dung buổi học hôm nay, bài tập về nhà…"
          placeholderTextColor={COLORS.subtle}
          accessibilityLabel="Nhận xét chung cho lớp"
          className="min-h-[96px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-ink"
          style={{ textAlignVertical: 'top' }}
        />
        <View className="flex-row flex-wrap gap-2">
          {photos.map((p, i) => (
            <View key={`${p.uri}-${i}`} className="h-20 w-20 overflow-hidden rounded-xl">
              <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} />
              <Pressable onPress={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} accessibilityLabel={`Bỏ ảnh ${i + 1}`} className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60">
                <X size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {photos.length < 6 && (
            <Pressable onPress={addPhoto} accessibilityRole="button" accessibilityLabel="Thêm ảnh lớp học" className="h-20 w-20 items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 active:bg-slate-50">
              <ImagePlus size={20} color={COLORS.subtle} />
              <Text className="text-[10px] text-ink-subtle">Ảnh lớp</Text>
            </Pressable>
          )}
        </View>
        <VoiceNoteField value={voice} onChange={setVoice} disabled={busy} />
        <Text className="text-[11px] leading-4 text-ink-subtle">Ảnh lớp chỉ phụ huynh của các bé trong lớp này xem được. Bé "Có mặt / Muộn" được trừ 1 buổi.</Text>
      </View>

      {progress !== null && <Text className="text-xs text-brand-700">Đang tải ảnh… {Math.round(progress * 100)}%</Text>}
      {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
      <Button title={`Gửi cho ${selected.length} phụ huynh`} size="lg" loading={busy} icon={<Send size={18} color="#fff" />} onPress={send} testID="send-batch" />
    </View>
  );
}
