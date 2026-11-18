import { Mic, Pause, Play, Send, X } from 'lucide-react-native';
import { memo, useCallback, useEffect, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton } from '@/components';
import VideoPlayer from '@/components/media/VideoPlayer';
import { hasSupabase } from '@/config/env';
import {
  fetchFlashFeed,
  QUICK_REPLIES,
  reactToFlash,
  replyToFlash,
  timeAgo,
  type ClassFlash,
  type FlashReaction,
} from '@/services/engagement';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

const CARD_W = 132;
const CARD_H = 176;

/**
 * "Khoảnh khắc lớp học" — photos and ≤5 s voice notes teachers post during class, newest first (7 days).
 * Fixed height in every state (loading / empty / list) so nothing below it jumps when it loads.
 */
export default function ClassroomFlashFeed() {
  const [items, setItems] = useState<ClassFlash[] | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    fetchFlashFeed().then(
      (f) => {
        setItems(f);
        // Warm the image cache so the viewer opens instantly.
        f.filter((x) => x.kind === 'PHOTO' && x.url).slice(0, 6).forEach((x) => Image.prefetch(x.url).catch(() => {}));
      },
      () => {
        setItems([]);
        setError(true);
      },
    );
  }, []);
  useEffect(load, [load]);

  const update = (f: ClassFlash) => setItems((cur) => cur?.map((x) => (x.id === f.id ? f : x)) ?? null);
  const open = items?.find((x) => x.id === openId) ?? null;

  return (
    <View className="gap-2" testID="flash-feed">
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-[15px] font-bold text-ink">Khoảnh khắc lớp học</Text>
        {!hasSupabase && <Text className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-amber-700">Dữ liệu mẫu</Text>}
      </View>
      <View style={{ height: CARD_H }}>
        {items === null ? (
          <View className="flex-row gap-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width={CARD_W} height={CARD_H} radius={20} />
            ))}
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 items-center justify-center rounded-3xl bg-white px-6">
            <Text className="text-center text-[13px] leading-5 text-ink-muted">
              {error ? 'Chưa tải được khoảnh khắc lớp học.' : 'Thầy cô sẽ chia sẻ ảnh và lời nhắn từ lớp học của bé tại đây.'}
            </Text>
            {error && (
              <Pressable onPress={load} accessibilityRole="button" className="mt-2 h-9 justify-center rounded-full bg-brand-50 px-4">
                <Text className="text-[13px] font-bold text-brand-600">Thử lại</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            horizontal
            data={items}
            keyExtractor={(f) => f.id}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={Gap}
            renderItem={({ item }) => <FlashThumb flash={item} onPress={() => setOpenId(item.id)} />}
            initialNumToRender={4}
            windowSize={3}
          />
        )}
      </View>
      <FlashViewer flash={open} onClose={() => setOpenId(null)} onChange={update} />
    </View>
  );
}

const Gap = () => <View style={{ width: 10 }} />;

const FlashThumb = memo(function FlashThumb({ flash, onPress }: { flash: ClassFlash; onPress: () => void }) {
  const fresh = Date.now() - Date.parse(flash.createdAt) < 6 * 3600_000;
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${flash.kind === 'AUDIO' ? 'Lời nhắn thoại' : 'Ảnh'} từ ${flash.teacherName}`}
      style={{ width: CARD_W, height: CARD_H }}
      className="overflow-hidden rounded-[20px] bg-brand-100 active:opacity-90"
      testID={`flash-${flash.id}`}
    >
      {flash.kind === 'PHOTO' && flash.url ? (
        <Image source={{ uri: flash.url }} style={{ width: CARD_W, height: CARD_H }} resizeMode="cover" />
      ) : (
        <View className="flex-1 items-center justify-center bg-brand-500">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <Mic size={26} color="#fff" />
          </View>
          <Text className="mt-2 text-xs font-bold text-white">{flash.durationSec ? `${Math.round(flash.durationSec)} giây` : 'Lời nhắn'}</Text>
        </View>
      )}
      {fresh && <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent-500" />}
      <View className="absolute bottom-0 left-0 right-0 bg-black/45 px-2.5 py-2">
        <Text className="text-[11px] font-bold text-white" numberOfLines={1}>
          {flash.teacherName}
        </Text>
        <Text className="text-[10px] text-white/85" numberOfLines={1}>
          {timeAgo(flash.createdAt)}
        </Text>
        <Text className="text-[11px] font-semibold text-white" numberOfLines={1}>
          ❤️ {flash.hearts}  🌟 {flash.prouds}
        </Text>
      </View>
    </Pressable>
  );
});

// ─── Viewer ─────────────────────────────────────────────────────────────────

function FlashViewer({ flash, onClose, onChange }: { flash: ClassFlash | null; onClose: () => void; onChange: (f: ClassFlash) => void }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setText('');
    setNote(null);
  }, [flash?.id]);

  if (!flash) return null;

  const toggle = async (r: FlashReaction) => {
    haptics.medium();
    const had = flash.myReactions.includes(r);
    const optimistic: ClassFlash = {
      ...flash,
      myReactions: had ? flash.myReactions.filter((x) => x !== r) : [...flash.myReactions, r],
      hearts: flash.hearts + (r === 'HEART' ? (had ? -1 : 1) : 0),
      prouds: flash.prouds + (r === 'PROUD' ? (had ? -1 : 1) : 0),
    };
    onChange(optimistic);
    try {
      await reactToFlash(flash.id, r);
    } catch {
      onChange(flash);
      setNote('Chưa gửi được, thử lại nhé.');
    }
  };

  const send = async (body: string) => {
    if (!body.trim() || sending) return;
    setSending(true);
    setNote(null);
    try {
      const reply = await replyToFlash(flash.id, body);
      haptics.success();
      onChange({ ...flash, replies: [...flash.replies, reply] });
      setText('');
      setNote('Đã gửi lời nhắn tới thầy cô ✓');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Chưa gửi được, thử lại nhé.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-slate-950">
        <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-white" numberOfLines={1}>
              {flash.teacherName}
            </Text>
            <Text className="text-xs text-white/70" numberOfLines={1}>
              {flash.className} · {timeAgo(flash.createdAt)}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <X size={20} color="#fff" />
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-4">
          {flash.kind === 'PHOTO' ? (
            flash.url ? (
              <Image source={{ uri: flash.url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel={flash.caption ?? 'Ảnh lớp học'} />
            ) : (
              <Text className="text-white/70">Không tải được ảnh</Text>
            )
          ) : (
            <VoiceNote flash={flash} />
          )}
        </View>

        <View className="gap-3 px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
          {!!flash.caption && <Text className="text-[15px] leading-6 text-white">{flash.caption}</Text>}
          <View className="flex-row gap-2.5">
            <ReactionButton label="Thả tim" emoji="❤️" count={flash.hearts} on={flash.myReactions.includes('HEART')} onPress={() => toggle('HEART')} testID="react-heart" />
            <ReactionButton label="Tự hào quá" emoji="🌟" count={flash.prouds} on={flash.myReactions.includes('PROUD')} onPress={() => toggle('PROUD')} testID="react-proud" />
          </View>
          {flash.replies.length > 0 && (
            <View className="gap-1">
              {flash.replies.slice(-2).map((r, i) => (
                <Text key={i} className="text-[13px] text-white/85" numberOfLines={2}>
                  💬 {r.body}
                </Text>
              ))}
            </View>
          )}
          <View className="flex-row flex-wrap gap-2">
            {QUICK_REPLIES.map((q) => (
              <Pressable key={q} onPress={() => send(q)} disabled={sending} accessibilityRole="button" className="h-9 justify-center rounded-full bg-white/15 px-3.5 active:bg-white/25">
                <Text className="text-[13px] font-semibold text-white">{q}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row items-center gap-2 rounded-full bg-white/10 pl-4 pr-1.5">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Nhắn thầy cô…"
              placeholderTextColor="rgba(255,255,255,0.55)"
              maxLength={300}
              className="h-11 flex-1 text-[15px] text-white"
              style={{ outlineStyle: 'none' } as object}
              onSubmitEditing={() => send(text)}
              returnKeyType="send"
              testID="flash-reply-input"
            />
            <Pressable
              onPress={() => send(text)}
              disabled={!text.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Gửi lời nhắn"
              className={`h-9 w-9 items-center justify-center rounded-full ${text.trim() ? 'bg-accent-500' : 'bg-white/15'}`}
            >
              <Send size={16} color="#fff" />
            </Pressable>
          </View>
          {note && <Text className="text-center text-xs text-white/80">{note}</Text>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReactionButton({ label, emoji, count, on, onPress, testID }: { label: string; emoji: string; count: number; on: boolean; onPress: () => void; testID: string }) {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPress={() => {
        s.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 8 }));
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}, ${count}`}
      className={`h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full ${on ? 'bg-white' : 'bg-white/15'}`}
      testID={testID}
    >
      <Animated.Text style={[{ fontSize: 18 }, style]}>{emoji}</Animated.Text>
      <Text className={`text-[14px] font-bold ${on ? 'text-ink' : 'text-white'}`}>
        {label} · {count}
      </Text>
    </Pressable>
  );
}

/** Voice note: big play button + animated bars; plays through the platform media element (hidden). */
function VoiceNote({ flash }: { flash: ClassFlash }) {
  const [playing, setPlaying] = useState(false);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (playing) pulse.value = withRepeat(withTiming(1, { duration: 420 }), -1, true);
    else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0);
    }
  }, [playing, pulse]);
  const bars = [0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8];
  if (!flash.url) {
    return <Text className="text-center text-[13px] text-white/70">{hasSupabase ? 'Không tải được lời nhắn thoại' : 'Lời nhắn thoại mẫu (bản demo không có âm thanh)'}</Text>;
  }
  return (
    <View className="items-center gap-5">
      <View className="h-16 flex-row items-center gap-1.5">
        {bars.map((b, i) => (
          <Bar key={i} base={b} pulse={pulse} odd={i % 2 === 1} />
        ))}
      </View>
      <Pressable
        onPress={() => {
          haptics.light();
          setPlaying((p) => !p);
        }}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Tạm dừng' : 'Nghe lời nhắn'}
        className="h-20 w-20 items-center justify-center rounded-full bg-accent-500 active:bg-accent-600"
        testID="voice-play"
      >
        {playing ? <Pause size={32} color="#fff" /> : <Play size={32} color="#fff" style={{ marginLeft: 4 }} />}
      </Pressable>
      <Text className="text-[13px] text-white/75">{flash.durationSec ? `${Math.round(flash.durationSec)} giây` : 'Lời nhắn thoại'}</Text>
      {playing && <VideoPlayer uri={flash.url} paused={false} onEnd={() => setPlaying(false)} style={{ width: 1, height: 1, opacity: 0 }} />}
    </View>
  );
}

function Bar({ base, pulse, odd }: { base: number; pulse: { value: number }; odd: boolean }) {
  const style = useAnimatedStyle(() => {
    const k = odd ? 1 - pulse.value : pulse.value;
    return { height: 14 + 46 * base * (0.35 + 0.65 * k) };
  });
  return <Animated.View style={[{ width: 6, borderRadius: 3, backgroundColor: COLORS.accent }, style]} />;
}
