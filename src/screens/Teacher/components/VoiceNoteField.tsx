import { Mic, Square, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import VoiceFeedbackPlayer from '@/components/VoiceFeedbackPlayer';
import { canRecordAudio, startAudioRecording, type AudioRecording } from '@/services/media/mediaPicker';
import type { PickedMedia } from '@/types';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

const MAX_SEC = 30;

/** Record a 15–30 s voice note for the contact book (web: microphone via MediaRecorder; hidden where unsupported). */
export default function VoiceNoteField({ value, onChange, disabled }: { value: PickedMedia | null; onChange: (v: PickedMedia | null) => void; disabled?: boolean }) {
  const [rec, setRec] = useState<AudioRecording | null>(null);
  const [sec, setSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (!canRecordAudio) return null;

  const toggle = async () => {
    setError(null);
    if (rec) return rec.stop();
    try {
      const r = await startAudioRecording(MAX_SEC);
      haptics.medium();
      setRec(r);
      setSec(0);
      timer.current = setInterval(() => setSec((s) => Math.min(MAX_SEC, s + 1)), 1000);
      const clip = await r.done;
      if ((clip.durationSec ?? 0) < 3) setError('Lời nhắn hơi ngắn — ghi khoảng 15–30 giây nhé.');
      else onChange(clip);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không ghi âm được');
    } finally {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setRec(null);
    }
  };

  return (
    <View className="gap-2" testID="voice-note-field">
      {value ? (
        <View className="gap-1.5">
          <VoiceFeedbackPlayer url={value.uri} duration={value.durationSec ?? null} seed={value.name} />
          <Pressable onPress={() => onChange(null)} disabled={disabled} accessibilityRole="button" className="h-11 flex-row items-center gap-1.5 self-start rounded-full px-2 active:bg-slate-100">
            <Trash2 size={14} color={COLORS.muted} />
            <Text className="text-xs font-semibold text-ink-muted">Ghi lại</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={toggle}
          disabled={disabled}
          accessibilityRole="button"
          className={`h-12 flex-row items-center justify-center gap-2 rounded-2xl ${rec ? 'bg-red-500' : 'border border-dashed border-slate-300 active:bg-slate-50'}`}
          testID="voice-record"
        >
          {rec ? <Square size={16} color="#fff" fill="#fff" /> : <Mic size={18} color={COLORS.accent} />}
          <Text className={`text-[14px] font-semibold ${rec ? 'text-white' : 'text-ink'}`}>
            {rec ? `Đang ghi ${sec}s / ${MAX_SEC}s — bấm để dừng` : 'Ghi lời nhắn thoại (15–30 giây)'}
          </Text>
        </Pressable>
      )}
      {!!error && <Text className="text-xs text-red-600">{error}</Text>}
    </View>
  );
}
