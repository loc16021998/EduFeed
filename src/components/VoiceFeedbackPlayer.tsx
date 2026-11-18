import { Pause, Play } from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import VideoPlayer from '@/components/media/VideoPlayer';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

const BARS = 32;

interface VoiceFeedbackPlayerProps {
  /** Playable URL; '' = no audio available (demo / failed to sign). */
  url: string;
  /** Seconds (from the database; the player refines it once loaded). */
  duration: number | null;
  /** Seed for the decorative waveform (stable per note). */
  seed: string;
  teacherName?: string;
  /** Reaction bar — omit to hide it. */
  hearted?: boolean;
  clapped?: boolean;
  onHeart?: () => void;
  onClap?: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`;

/**
 * Teacher's voice note on a contact-book entry: play / pause, a waveform that fills as it plays, elapsed / total time,
 * and quick ❤️ / 👏 reactions. Plays through the platform media element (react-native-video / <video>), kept off-screen.
 * The waveform is decorative (derived from the note id), not the real signal.
 */
function VoiceFeedbackPlayer({ url, duration, seed, teacherName, hearted, clapped, onHeart, onClap }: VoiceFeedbackPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(duration ?? 0);
  const [mounted, setMounted] = useState(false);

  const heights = useMemo(() => {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return Array.from({ length: BARS }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      const env = Math.sin((i / (BARS - 1)) * Math.PI) * 0.55 + 0.45; // louder in the middle
      return 0.25 + 0.75 * env * ((h % 1000) / 1000 * 0.7 + 0.3);
    });
  }, [seed]);

  const available = !!url;
  const progress = len > 0 ? Math.min(1, pos / len) : 0;

  const toggle = () => {
    if (!available) return;
    haptics.light();
    if (!mounted) setMounted(true);
    if (!playing && progress >= 0.999) setPos(0);
    setPlaying((p) => !p);
  };

  return (
    <View className="gap-2.5 rounded-2xl bg-brand-50 p-3" testID="voice-player">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={toggle}
          disabled={!available}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Tạm dừng lời nhắn thoại' : `Nghe lời nhắn thoại${teacherName ? ` của ${teacherName}` : ''}`}
          className={`h-12 w-12 items-center justify-center rounded-full ${available ? 'bg-brand-500 active:bg-brand-600' : 'bg-slate-300'}`}
          testID="voice-toggle"
        >
          {playing ? <Pause size={20} color="#fff" fill="#fff" /> : <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />}
        </Pressable>
        <View className="flex-1 gap-1">
          <View className="h-9 flex-row items-center justify-between" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {heights.map((h, i) => (
              <View
                key={i}
                style={{ width: 3, height: `${Math.round(h * 100)}%`, borderRadius: 2, backgroundColor: i / BARS < progress ? COLORS.brand : '#BFD2FF' }}
              />
            ))}
          </View>
          <View className="flex-row justify-between">
            <Text className="text-[11px] font-semibold text-brand-700" testID="voice-time">
              {playing || pos > 0 ? fmt(pos) : 'Lời nhắn thoại'}
            </Text>
            <Text className="text-[11px] text-ink-muted">{len > 0 ? fmt(len) : '—'}</Text>
          </View>
        </View>
      </View>
      {!available && <Text className="text-[11px] text-ink-subtle">Lời nhắn mẫu — bản demo không có âm thanh.</Text>}

      {(onHeart || onClap) && (
        <View className="flex-row gap-2">
          {onHeart && <ReactionChip emoji="❤️" label={hearted ? 'Đã thả tim' : 'Thả tim'} on={!!hearted} onPress={onHeart} testID="voice-heart" />}
          {onClap && <ReactionChip emoji="👏" label={clapped ? 'Đã vỗ tay' : 'Vỗ tay'} on={!!clapped} onPress={onClap} testID="voice-clap" />}
        </View>
      )}

      {mounted && available && (
        <VideoPlayer
          uri={url}
          paused={!playing}
          style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
          onProgress={(cur, total) => {
            setPos(cur);
            if (total > 0 && Number.isFinite(total)) setLen(total);
          }}
          onEnd={() => {
            setPlaying(false);
            setPos(len);
          }}
        />
      )}
    </View>
  );
}

function ReactionChip({ emoji, label, on, onPress, testID }: { emoji: string; label: string; on: boolean; onPress: () => void; testID: string }) {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPress={() => {
        haptics.medium();
        s.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 7 }));
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      aria-pressed={on}
      className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-full ${on ? 'bg-white' : 'bg-white/60 active:bg-white'}`}
      testID={testID}
    >
      <Animated.Text style={[{ fontSize: 16 }, style]}>{emoji}</Animated.Text>
      <Text className={`text-[13px] font-bold ${on ? 'text-brand-700' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

export default memo(VoiceFeedbackPlayer);
