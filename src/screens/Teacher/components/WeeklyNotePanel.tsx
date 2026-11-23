import { CheckCircle2, ChevronDown, ChevronUp, Eye } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components';
import WeeklyProgressCard from '@/components/WeeklyProgressCard';
import { StatusBanner } from '@/components/ux';
import {
  digestToReport,
  fetchWeeklyOverview,
  fetchWeeklyPreview,
  lastWeekStart,
  saveWeeklyTeacherNote,
  TEACHER_NOTE_MAX,
  thisWeekStart,
  weeklyPhotoUrls,
  type WeeklyOverviewRow,
  type WeeklyReport,
} from '@/services/weeklyReportService';
import type { ClassInfo } from '@/services/staffOps';
import { COLORS } from '@/utils/constants';

import { weekLabel } from '../../../../supabase/functions/_shared/weeklyReport';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');

/**
 * Teachers: the class's weekly reports — preview each child's draft (same rules as Sunday's digest) and add a
 * one-line personal note before it goes out at 19:30 Sunday. Also shows which parents opened last week's report.
 */
export default function WeeklyNotePanel({ cls }: { cls: ClassInfo }) {
  const [week, setWeek] = useState<'this' | 'last'>('this');
  const weekStart = week === 'this' ? thisWeekStart() : lastWeekStart();
  const [rows, setRows] = useState<WeeklyOverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchWeeklyOverview(cls.id, weekStart));
    } catch (e) {
      setError(msg(e));
    }
  }, [cls.id, weekStart]);

  useEffect(() => {
    setRows(null);
    setOpen(null);
    load();
  }, [load]);

  const sent = rows?.filter((r) => r.publishedAt).length ?? 0;
  const seen = rows?.filter((r) => r.parentViewedAt).length ?? 0;

  return (
    <View className="gap-3" testID="weekly-panel">
      <View className="flex-row rounded-2xl bg-slate-100 p-1">
        {(
          [
            ['this', 'Tuần này'],
            ['last', 'Tuần trước'],
          ] as const
        ).map(([id, label]) => (
          <Pressable key={id} onPress={() => setWeek(id)} accessibilityRole="tab" aria-selected={week === id} accessibilityState={{ selected: week === id }} className={`h-11 flex-1 items-center justify-center rounded-xl ${week === id ? 'bg-white' : ''}`} testID={`teacher-week-${id}`}>
            <Text className={`text-[13px] font-bold ${week === id ? 'text-brand-700' : 'text-ink-muted'}`}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text className="text-[13px] leading-[19px] text-ink-muted">
        Tuần {weekLabel(weekStart)} · báo cáo tự gửi phụ huynh lúc 19:30 Chủ nhật. Thêm 1 dòng nhận xét riêng để báo cáo ấm áp hơn.
      </Text>
      {rows && sent > 0 && (
        <View className="flex-row items-center gap-2 rounded-2xl bg-emerald-50 p-3" testID="weekly-engagement">
          <Eye size={16} color="#047857" />
          <Text className="flex-1 text-[13px] font-semibold text-emerald-800">
            {seen}/{sent} phụ huynh đã xem báo cáo
          </Text>
        </View>
      )}
      {!!error && <StatusBanner tone="error" text={error} action={{ label: 'Thử lại', onPress: load }} />}
      {!rows && !error && <ActivityIndicator color={COLORS.brand} />}
      {rows && rows.length === 0 && <Text className="text-center text-[13px] text-ink-muted">Lớp chưa có học viên được liên kết với phụ huynh.</Text>}

      {rows?.map((r) => (
        <StudentRow
          key={`${r.studentId}|${weekStart}`}
          row={r}
          weekStart={weekStart}
          open={open === r.studentId}
          onToggle={() => setOpen((o) => (o === r.studentId ? null : r.studentId))}
          onSaved={(note) => setRows((list) => list?.map((x) => (x.studentId === r.studentId ? { ...x, teacherNote: note || null } : x)) ?? list)}
        />
      ))}
    </View>
  );
}

function StudentRow({ row, weekStart, open, onToggle, onSaved }: { row: WeeklyOverviewRow; weekStart: string; open: boolean; onToggle: () => void; onSaved: (note: string) => void }) {
  const [preview, setPreview] = useState<WeeklyReport | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState(row.teacherNote ?? '');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const loadPreview = useCallback(async () => {
    try {
      const { source, digest } = await fetchWeeklyPreview(row.studentId, weekStart);
      const rep = digestToReport(source, digest);
      setPreview(rep);
      weeklyPhotoUrls(rep.media).then(setPhotos, () => {});
    } catch (e) {
      setFeedback({ ok: false, text: msg(e) });
    }
  }, [row.studentId, weekStart]);

  useEffect(() => {
    if (open && !preview) loadPreview();
  }, [open, preview, loadPreview]);

  const save = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await saveWeeklyTeacherNote(row.studentId, weekStart, note);
      onSaved(note.trim());
      setFeedback({ ok: true, text: note.trim() ? 'Đã lưu ghi chú — phụ huynh sẽ thấy trong báo cáo tuần.' : 'Đã bỏ ghi chú — báo cáo dùng nhận xét tự động.' });
      setPreview(null); // rebuild with the note
    } catch (e) {
      setFeedback({ ok: false, text: msg(e) });
    } finally {
      setBusy(false);
    }
  };

  const status = row.parentViewedAt ? { t: 'Phụ huynh đã xem', c: 'text-emerald-700' } : row.publishedAt ? { t: 'Đã gửi', c: 'text-brand-700' } : { t: 'Bản nháp', c: 'text-amber-700' };

  return (
    <View className="gap-3 rounded-3xl bg-white p-3.5" testID="weekly-row">
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} className="min-h-11 flex-row items-center gap-2">
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-ink">{row.studentName}</Text>
          <View className="flex-row items-center gap-1">
            {!!row.parentViewedAt && <CheckCircle2 size={12} color="#047857" />}
            <Text className={`text-xs font-semibold ${status.c}`}>{status.t}</Text>
            {!!row.teacherNote && <Text className="text-xs text-ink-subtle"> · có ghi chú của bạn</Text>}
          </View>
        </View>
        {open ? <ChevronUp size={20} color={COLORS.muted} /> : <ChevronDown size={20} color={COLORS.muted} />}
      </Pressable>

      {open && (
        <>
          <View className="gap-1.5">
            <Text className="text-[13px] font-semibold text-ink">Ghi chú riêng của bạn (1 dòng)</Text>
            <TextInput
              value={note}
              onChangeText={(t) => setNote(t.replace(/\n/g, ' '))}
              maxLength={TEACHER_NOTE_MAX}
              placeholder="VD: Tuần này con mạnh dạn lên bảng giải bài, cô rất tự hào!"
              placeholderTextColor={COLORS.subtle}
              className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3.5 text-[15px] text-ink"
              accessibilityLabel="Ghi chú cho báo cáo tuần"
              testID="weekly-note-input"
            />
            <Text className="self-end text-[11px] text-ink-subtle">
              {note.length}/{TEACHER_NOTE_MAX}
            </Text>
          </View>
          <Button title="Lưu ghi chú" loading={busy} onPress={save} testID="weekly-note-save" />
          {!!feedback && <StatusBanner tone={feedback.ok ? 'success' : 'error'} text={feedback.text} testID="weekly-note-result" />}
          {preview ? <WeeklyProgressCard report={preview} studentName={row.studentName} photos={photos} draft={!preview.publishedAt} testID="weekly-preview" /> : <ActivityIndicator color={COLORS.brand} />}
        </>
      )}
    </View>
  );
}
