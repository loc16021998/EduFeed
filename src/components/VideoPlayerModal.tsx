import { Bookmark, BookmarkCheck, ChevronRight, Maximize, Pause, Play, Share2, Volume1, Volume2, VolumeX, X } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildShareUrl, shareMessage } from '@/services/media/shareLinks';
import { useBookmarkStore } from '@/store';
import type { FeedItem } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';
import { isWeb, shareText } from '@/utils/platform';

import VideoPlayer from './media/VideoPlayer';
import type { VideoPlayerHandle } from './media/types';

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// ─── Scrub bar (progress / volume) ──────────────────────────────────────────

interface ScrubBarProps {
  /** 0–1 */
  value: number;
  /** Called continuously while dragging. */
  onScrub?: (v: number) => void;
  /** Called when the finger lifts (or on tap). */
  onCommit: (v: number) => void;
  label: string;
  color?: string;
}

/** Thin track with a large touch area; drag or tap. Runs on the UI thread. */
const ScrubBar = memo(function ScrubBar({ value, onScrub, onCommit, label, color = '#fff' }: ScrubBarProps) {
  const w = useSharedValue(0);
  const v = useSharedValue(value);
  const dragging = useSharedValue(false);
  useEffect(() => {
    if (!dragging.value) v.value = value;
  }, [value, v, dragging]);

  const clamp = (x: number) => {
    'worklet';
    return Math.min(1, Math.max(0, x));
  };
  const scrubJS = useCallback((x: number) => onScrub?.(x), [onScrub]);
  const commitJS = useCallback((x: number) => onCommit(x), [onCommit]);

  const pan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .onBegin((e) => {
      dragging.value = true;
      if (w.value > 0) v.value = clamp(e.x / w.value);
    })
    .onUpdate((e) => {
      if (w.value <= 0) return;
      v.value = clamp(e.x / w.value);
      runOnJS(scrubJS)(v.value);
    })
    .onFinalize(() => {
      dragging.value = false;
      runOnJS(commitJS)(v.value);
    });
  const tap = Gesture.Tap().onEnd((e) => {
    if (w.value <= 0) return;
    v.value = clamp(e.x / w.value);
    runOnJS(commitJS)(v.value);
  });

  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  const thumb = useAnimatedStyle(() => ({ left: v.value * w.value - 7, transform: [{ scale: withTiming(dragging.value ? 1.3 : 1) }] }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        style={styles.scrubHit}
        onLayout={(e: LayoutChangeEvent) => (w.value = e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onCommit(Math.min(1, Math.max(0, value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
      >
        <View style={styles.scrubTrack}>
          <Animated.View style={[styles.scrubFill, { backgroundColor: color }, fill]} />
        </View>
        <Animated.View style={[styles.scrubThumb, { backgroundColor: color }, thumb]} />
      </View>
    </GestureDetector>
  );
});

// ─── Player modal ───────────────────────────────────────────────────────────

interface VideoPlayerModalProps {
  item: FeedItem | null;
  onClose: () => void;
  /** "Đăng ký học thử khóa này". */
  onBook: (item: FeedItem) => void;
}

/**
 * Full-screen lesson player: custom controls (play / pause, seek bar, volume, fullscreen) that hide while
 * playing, plus a sticky action bar — book a trial for this course, save the video, share it.
 */
export default function VideoPlayerModal({ item, onClose, onBook }: VideoPlayerModalProps) {
  const insets = useSafeAreaInsets();
  const player = useRef<VideoPlayerHandle>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [scrub, setScrub] = useState<number | null>(null);
  const [controls, setControls] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const saved = useBookmarkStore((s) => (item ? s.saved.some((v) => v.id === item.id) : false));
  const toggleSaved = useBookmarkStore((s) => s.toggle);
  const controlsOpacity = useSharedValue(1);

  // New video → fresh state.
  useEffect(() => {
    setPaused(false);
    setBuffering(true);
    setTime({ cur: 0, dur: 0 });
    setControls(true);
    setShareOpen(false);
  }, [item?.id]);

  // Auto-hide the controls 3 s after playback starts / the last interaction.
  useEffect(() => {
    controlsOpacity.value = withTiming(controls ? 1 : 0, { duration: 200 });
    if (!controls || paused || scrub !== null) return undefined;
    const t = setTimeout(() => setControls(false), 3000);
    return () => clearTimeout(t);
  }, [controls, paused, scrub, controlsOpacity]);

  const onProgress = useCallback((cur: number, dur: number) => setTime({ cur, dur }), []);
  const seekTo = useCallback(
    (f: number) => {
      setScrub(null);
      if (time.dur > 0) {
        player.current?.seek(f * time.dur);
        setTime((t) => ({ ...t, cur: f * t.dur }));
      }
    },
    [time.dur],
  );
  const onVolume = useCallback((v: number) => {
    setVolume(v);
    setMuted(v === 0);
  }, []);

  const controlsStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));
  if (!item) return null;

  const shareUrl = buildShareUrl(item.shareSlug);
  const message = shareUrl ? shareMessage(item.title, shareUrl) : `${item.title} — video bài học từ TH EDU`;
  const progress = scrub ?? (time.dur > 0 ? time.cur / time.dur : 0);
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const onSave = () => {
    const on = toggleSaved(item);
    haptics.light();
    if (on) haptics.success();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      {/* Modals render outside the app's gesture root on Android. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black" testID="video-player-modal">
          {/* Video + tap-to-toggle controls */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setControls((c) => !c)} accessibilityLabel="Hiện / ẩn điều khiển">
            <VideoPlayer
              ref={player}
              uri={item.videoUrl}
              poster={item.thumbnailUrl}
              paused={paused}
              muted={muted}
              volume={volume}
              resizeMode="contain"
              style={StyleSheet.absoluteFill}
              onBuffering={setBuffering}
              onProgress={onProgress}
              onEnd={() => {
                setPaused(true);
                setControls(true);
              }}
            />
          </Pressable>
          {buffering && !paused && <ActivityIndicator size="large" color="#fff" style={styles.center} />}

          {/* Top bar */}
          <Animated.View pointerEvents={controls ? 'box-none' : 'none'} style={[styles.top, { paddingTop: insets.top + 8 }, controlsStyle]}>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng video" className="h-11 w-11 items-center justify-center rounded-full bg-black/50">
              <X size={22} color="#fff" />
            </Pressable>
            <View className="flex-1 px-3">
              <Text className="text-[15px] font-bold text-white" numberOfLines={2}>
                {item.title}
              </Text>
              <Text className="text-xs font-semibold" style={{ color: CATEGORY_COLORS[item.category] }}>
                {item.teacherName} · {CATEGORY_LABELS[item.category]}
              </Text>
            </View>
          </Animated.View>

          {/* Centre play / pause */}
          <Animated.View pointerEvents={controls ? 'box-none' : 'none'} style={[styles.center, controlsStyle]}>
            <Pressable
              onPress={() => {
                setPaused((p) => !p);
                setControls(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Phát' : 'Tạm dừng'}
              testID="player-toggle"
              className="h-16 w-16 items-center justify-center rounded-full bg-black/55"
            >
              {paused ? <Play size={30} color="#fff" fill="#fff" /> : <Pause size={30} color="#fff" fill="#fff" />}
            </Pressable>
          </Animated.View>

          {/* Bottom: seek bar, volume, fullscreen, then the sticky action bar */}
          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
            <Animated.View pointerEvents={controls ? 'auto' : 'none'} style={[{ gap: 6, paddingHorizontal: 16 }, controlsStyle]}>
              <ScrubBar value={progress} onScrub={(v) => setScrub(v)} onCommit={seekTo} label="Tua video" />
              <View className="flex-row items-center gap-3">
                <Text className="text-xs font-semibold text-white" testID="player-time">
                  {fmt(scrub !== null ? scrub * time.dur : time.cur)} / {fmt(time.dur)}
                </Text>
                <View className="flex-1" />
                <Pressable onPress={() => setMuted((m) => !m)} accessibilityRole="button" accessibilityLabel={muted ? 'Bật tiếng' : 'Tắt tiếng'} hitSlop={8}>
                  <VolumeIcon size={20} color="#fff" />
                </Pressable>
                <View style={{ width: 88 }}>
                  <ScrubBar value={muted ? 0 : volume} onCommit={onVolume} onScrub={onVolume} label="Âm lượng" />
                </View>
                <Pressable onPress={() => player.current?.enterFullscreen()} accessibilityRole="button" accessibilityLabel="Toàn màn hình" hitSlop={8}>
                  <Maximize size={20} color="#fff" />
                </Pressable>
              </View>
            </Animated.View>

            {/* Sticky actions (always visible) */}
            <View className="mx-3 mt-2 gap-2 rounded-3xl bg-white/95 p-2.5" testID="player-actions">
              <Pressable
                onPress={() => onBook(item)}
                accessibilityRole="button"
                className="h-12 flex-row items-center justify-center gap-1 rounded-2xl bg-accent-500 active:bg-accent-600"
              >
                <Text className="text-[15px] font-extrabold text-white">Đăng ký học thử khóa này</Text>
                <ChevronRight size={18} color="#fff" />
              </Pressable>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={onSave}
                  accessibilityRole="button"
                  accessibilityState={{ selected: saved }}
                  className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl ${saved ? 'bg-brand-50' : 'bg-slate-100'}`}
                >
                  {saved ? <BookmarkCheck size={18} color={COLORS.brand} /> : <Bookmark size={18} color={COLORS.ink} />}
                  <Text className={`text-[13px] font-bold ${saved ? 'text-brand-700' : 'text-ink'}`}>{saved ? 'Đã lưu' : 'Lưu video'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShareOpen((o) => !o)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: shareOpen }}
                  className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-slate-100"
                >
                  <Share2 size={18} color={COLORS.ink} />
                  <Text className="text-[13px] font-bold text-ink">Chia sẻ</Text>
                </Pressable>
              </View>
              {shareOpen && (
                <View className="flex-row gap-2" testID="share-options">
                  <Pressable
                    onPress={() => shareText(message)}
                    accessibilityRole="button"
                    className="h-11 flex-1 items-center justify-center rounded-2xl bg-[#0068FF]"
                  >
                    <Text className="text-[13px] font-bold text-white">{isWeb ? 'Sao chép gửi Zalo' : 'Zalo / ứng dụng khác'}</Text>
                  </Pressable>
                  {shareUrl && (
                    <Pressable
                      onPress={() => Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`).catch(() => {})}
                      accessibilityRole="link"
                      className="h-11 flex-1 items-center justify-center rounded-2xl bg-[#1877F2]"
                    >
                      <Text className="text-[13px] font-bold text-white">Facebook</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Saved videos ───────────────────────────────────────────────────────────

/** Bottom sheet listing saved videos; tapping one plays it. */
export function SavedVideosSheet({ visible, onClose, onPlay }: { visible: boolean; onClose: () => void; onPlay: (v: FeedItem) => void }) {
  const insets = useSafeAreaInsets();
  const saved = useBookmarkStore((s) => s.saved);
  const toggle = useBookmarkStore((s) => s.toggle);
  const sheetY = useSharedValue(40);
  useEffect(() => {
    sheetY.value = visible ? withSpring(0, { damping: 18 }) : 40;
  }, [visible, sheetY]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <Animated.View style={[{ maxHeight: '80%' }, sheetStyle]} testID="saved-videos">
          <View className="rounded-t-[28px] bg-surface" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <View className="flex-row items-center px-5 pb-1 pt-4">
            <Text className="flex-1 text-lg font-extrabold text-ink" accessibilityRole="header">
              Video đã lưu ({saved.length})
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200">
              <X size={20} color={COLORS.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-2.5 px-5 pb-2">
            {saved.length === 0 && <Text className="py-6 text-center text-ink-muted">Bấm "Lưu video" khi xem để lưu lại bài học hay.</Text>}
            {saved.map((v) => (
              <Pressable
                key={v.id}
                onPress={() => onPlay({ ...v, teacherAvatar: '', tags: [] })}
                accessibilityRole="button"
                className="flex-row items-center gap-3 rounded-2xl bg-white p-2.5 active:bg-slate-50"
              >
                <Image source={{ uri: v.thumbnailUrl }} style={{ width: 64, height: 80, borderRadius: 12, backgroundColor: '#E2E8F0' }} />
                <View className="flex-1 gap-1">
                  <Text className="text-[14px] font-bold text-ink" numberOfLines={2}>
                    {v.title}
                  </Text>
                  <Text className="text-xs" style={{ color: CATEGORY_COLORS[v.category] }}>
                    {v.teacherName} · {CATEGORY_LABELS[v.category]}
                  </Text>
                </View>
                <Pressable
                  onPress={() => toggle({ ...v, teacherAvatar: '', tags: [] })}
                  accessibilityRole="button"
                  accessibilityLabel="Bỏ lưu"
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full"
                >
                  <BookmarkCheck size={18} color={COLORS.brand} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  scrubHit: { height: 28, justifyContent: 'center' },
  scrubTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  scrubFill: { height: 4, borderRadius: 2 },
  scrubThumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, top: 7 },
});
