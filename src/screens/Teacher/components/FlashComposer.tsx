import { ImagePlus, Mic, Square, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components';
import { fetchClassFlashes, postFlash, timeAgo, type ClassFlash } from '@/services/engagement';
import { canRecordAudio, pickImage, startAudioRecording, type AudioRecording } from '@/services/media/mediaPicker';
import { checkMedia } from '@/services/media/storageUpload';
import type { ClassInfo } from '@/services/staffOps';
import type { PickedMedia } from '@/types';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

const MAX_SEC = 5;

/**
 * Teacher: share a class moment — one photo or a ≤5 s voice note — with the parents of this class.
 * Below: this week's moments with ❤️ / 🌟 counts and parents' replies.
 */
export default function FlashComposer({ cls }: { cls: Pick<ClassInfo, 'id' | 'name'> }) {
  const [media, setMedia] = useState<{ kind: 'PHOTO' | 'AUDIO'; m: PickedMedia } | null>(null);
  const [caption, setCaption] = useState('');
  const [rec, setRec] = useState<AudioRecording | null>(null);
  const [left, setLeft] = useState(MAX_SEC);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [list, setList] = useState<ClassFlash[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    fetchClassFlashes(cls.id).then(setList, () => setList([]));
  }, [cls.id]);
  useEffect(load, [load]);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const addPhoto = async () => {
    setError(null);
    try {
      const p = await pickImage();
      if (!p) return;
      const problem = checkMedia(p, 'image');
      if (problem) return setError(problem);
      setMedia({ kind: 'PHOTO', m: p });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không chọn được ảnh');
    }
  };

  const record = async () => {
    setError(null);
    if (rec) {
      rec.stop();
      return;
    }
    try {
      const r = await startAudioRecording(MAX_SEC);
      haptics.medium();
      setRec(r);
      setLeft(MAX_SEC);
      timer.current = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
      const clip = await r.done;
      setMedia({ kind: 'AUDIO', m: clip });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không ghi âm được');
    } finally {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setRec(null);
    }
  };

  const send = async () => {
    if (!media) return setError('Chọn ảnh hoặc ghi một lời nhắn thoại');
    setBusy(true);
    setError(null);
    try {
      await postFlash({ classId: cls.id, kind: media.kind, media: media.m, caption });
      haptics.success();
      setNotice('Đã chia sẻ với phụ huynh lớp ' + cls.name);
      setMedia(null);
      setCaption('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa gửi được');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3" testID="flash-composer">
      {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs leading-[18px] text-emerald-800">{notice}</Text>}
      <View className="gap-3 rounded-3xl bg-white p-4">
        <Text className="text-[15px] font-bold text-ink">Chia sẻ khoảnh khắc lớp học</Text>
        <Text className="text-xs leading-[18px] text-ink-muted">Một tấm ảnh hoặc lời nhắn thoại 5 giây — phụ huynh lớp này nhận ngay trong mục “Con tôi”, hiển thị 7 ngày.</Text>

        {media ? (
          <View className="flex-row items-center gap-3 rounded-2xl bg-slate-50 p-2">
            {media.kind === 'PHOTO' ? (
              <Image source={{ uri: media.m.uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
            ) : (
              <View className="h-[72px] w-[72px] items-center justify-center rounded-xl bg-brand-500">
                <Mic size={26} color="#fff" />
              </View>
            )}
            <Text className="flex-1 text-[13px] text-ink">{media.kind === 'PHOTO' ? 'Ảnh đã chọn' : `Lời nhắn thoại ${Math.round(media.m.durationSec ?? 0)} giây`}</Text>
            <Pressable onPress={() => setMedia(null)} accessibilityRole="button" accessibilityLabel="Bỏ" className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200">
              <Trash2 size={18} color={COLORS.muted} />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-2.5">
            <Pressable onPress={addPhoto} disabled={!!rec} accessibilityRole="button" className="h-20 flex-1 items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 active:bg-slate-50" testID="flash-photo">
              <ImagePlus size={22} color={COLORS.brand} />
              <Text className="text-[13px] font-semibold text-ink">Chọn ảnh</Text>
            </Pressable>
            {canRecordAudio && (
              <Pressable
                onPress={record}
                accessibilityRole="button"
                className={`h-20 flex-1 items-center justify-center gap-1 rounded-2xl ${rec ? 'bg-red-500' : 'border border-dashed border-slate-300 active:bg-slate-50'}`}
                testID="flash-record"
              >
                {rec ? <Square size={20} color="#fff" fill="#fff" /> : <Mic size={22} color={COLORS.accent} />}
                <Text className={`text-[13px] font-semibold ${rec ? 'text-white' : 'text-ink'}`}>{rec ? `Đang ghi… ${left}s` : 'Ghi âm 5 giây'}</Text>
              </Pressable>
            )}
          </View>
        )}

        <TextInput
          value={caption}
          onChangeText={setCaption}
          maxLength={120}
          placeholder="Chú thích ngắn (không bắt buộc)"
          placeholderTextColor={COLORS.subtle}
          accessibilityLabel="Chú thích"
          className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-ink"
        />
        {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
        <Button title="Chia sẻ với phụ huynh" loading={busy} disabled={!media || !!rec} onPress={send} testID="flash-send" />
      </View>

      <View className="gap-2 rounded-3xl bg-white p-4">
        <Text className="text-[15px] font-bold text-ink">Đã chia sẻ tuần này</Text>
        {list === null ? (
          <Text className="text-xs text-ink-subtle">Đang tải…</Text>
        ) : list.length === 0 ? (
          <Text className="text-xs text-ink-subtle">Chưa có khoảnh khắc nào.</Text>
        ) : (
          list.map((f) => (
            <View key={f.id} className="gap-1 border-t border-slate-100 pt-2">
              <View className="flex-row items-center gap-2">
                <Text className="text-[13px] font-semibold text-ink">{f.kind === 'AUDIO' ? '🎙️ Lời nhắn thoại' : '📷 Ảnh'}</Text>
                <Text className="flex-1 text-xs text-ink-subtle">{timeAgo(f.createdAt)}</Text>
                <Text className="text-xs font-bold text-ink">❤️ {f.hearts}  🌟 {f.prouds}</Text>
              </View>
              {!!f.caption && <Text className="text-xs text-ink-muted">{f.caption}</Text>}
              {f.replies.map((r, i) => (
                <Text key={i} className="text-xs text-ink">
                  💬 <Text className="font-semibold">{r.parentName ?? 'Phụ huynh'}:</Text> {r.body}
                </Text>
              ))}
            </View>
          ))
        )}
      </View>
    </View>
  );
}
