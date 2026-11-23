/**
 * One feed video surface, tuned for fast first frame and low data use.
 *
 *  mode        what is mounted                              why
 *  ─────────   ──────────────────────────────────────────   ─────────────────────────────────────────
 *  'idle'      poster <Image> only                          off-screen: zero decoders, zero bytes
 *  'warm'      poster + PAUSED player (invisible)           next card on Wi-Fi: buffers the first
 *                                                           seconds so the swipe starts instantly
 *  'active'    poster + playing player (fades in on the     centred card; the poster stays under the
 *              first frame)                                 player until it is ready → no black flash
 *
 * Data Saver (`autoplay=false`): the active card stays on its poster with a "Chạm để xem" button; the
 * player mounts only after the tap. Leaving the viewport resets it.
 * The player sits at the same place in the tree for 'warm' and 'active', so a warmed player is reused
 * as-is when its card becomes active (no re-download).
 */
import { Play, WifiOff } from 'lucide-react-native';
import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import VideoPlayer from '@/components/media/VideoPlayer';
import { useNetworkStore } from '@/store/networkStore';

export type FeedVideoMode = 'idle' | 'warm' | 'active';

export interface OptimizedVideoFeedItemProps {
  /** Stream to play (already chosen by pickStreamUrl: low-res on slow / metered links when available). */
  uri: string;
  posterUri: string;
  mode: FeedVideoMode;
  muted: boolean;
  /** false = Data Saver: tap to play instead of autoplay. */
  autoplay: boolean;
  /** Double-tap anywhere on the video (♥ like). Single taps then wait ~250 ms to tell the two apart. */
  onDoubleTap?: (x: number, y: number) => void;
  testID?: string;
}

/** Two taps closer than this = a double-tap. */
const DOUBLE_TAP_MS = 260;

/** Delay before showing a spinner — most clips start faster than this, so no flicker. */
const SPINNER_DELAY_MS = 350;

function OptimizedVideoFeedItem({ uri, posterUri, mode, muted, autoplay, onDoubleTap, testID }: OptimizedVideoFeedItemProps) {
  const [userPaused, setUserPaused] = useState(false);
  const [tapToPlay, setTapToPlay] = useState(false); // Data Saver: parent chose to watch this one
  const [ready, setReady] = useState(false); // first frame rendered
  const [buffering, setBuffering] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const counted = useRef(false);

  const active = mode === 'active';
  const wantsPlayer = (active && (autoplay || tapToPlay)) || (mode === 'warm' && autoplay);
  const playing = active && (autoplay || tapToPlay) && !userPaused;

  // Leaving the centre → clean state for the next visit (and stop counting).
  useEffect(() => {
    if (!active) {
      setUserPaused(false);
      setTapToPlay(false);
      setShowSpinner(false);
      counted.current = false;
    }
  }, [active]);
  // A new stream (e.g. switched to low-res) needs a fresh first frame.
  useEffect(() => setReady(false), [uri]);
  useEffect(() => {
    if (!wantsPlayer) setReady(false);
  }, [wantsPlayer]);

  // Data Saver skipped an autoplay → count once per visit (for the "đã tiết kiệm" estimate).
  useEffect(() => {
    if (active && !autoplay && !counted.current) {
      counted.current = true;
      useNetworkStore.getState().countSkippedAutoplay();
    }
  }, [active, autoplay]);

  useEffect(() => {
    if (!(playing && (buffering || !ready))) return setShowSpinner(false);
    const t = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [playing, buffering, ready]);

  const singleTap = () => {
    if (!active) return;
    if (!autoplay && !tapToPlay) return setTapToPlay(true);
    setUserPaused((p) => !p);
  };
  const lastTap = useRef(0);
  const pendingTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pendingTap.current) clearTimeout(pendingTap.current);
  }, []);
  const onPress = (e: GestureResponderEvent) => {
    if (!onDoubleTap) return singleTap();
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (pendingTap.current) clearTimeout(pendingTap.current);
      pendingTap.current = null;
      onDoubleTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
      return;
    }
    lastTap.current = now;
    pendingTap.current = setTimeout(() => {
      pendingTap.current = null;
      singleTap();
    }, DOUBLE_TAP_MS);
  };

  return (
    <Pressable
      onPress={onPress}
      style={StyleSheet.absoluteFill}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Tạm dừng video' : 'Phát video'}
      testID={testID}
    >
      {/* Poster first: cheap, cached, instant. Stays underneath until the player has a frame. */}
      <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} />

      {wantsPlayer && (
        <View style={[StyleSheet.absoluteFill, { opacity: active && ready ? 1 : 0 }]} pointerEvents="none">
          <VideoPlayer
            uri={uri}
            poster={posterUri}
            paused={!playing}
            muted={muted || !active}
            loop
            preload={mode === 'warm' ? 'auto' : undefined}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
            onBuffering={(b) => {
              setBuffering(b);
              if (!b) setReady(true);
            }}
          />
        </View>
      )}

      {active && !autoplay && !tapToPlay ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center gap-2" testID="tap-to-play">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-black/45">
            <Play size={30} color="#fff" fill="#fff" />
          </View>
          <View className="flex-row items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5">
            <WifiOff size={13} color="#fff" />
            <Text className="text-xs font-semibold text-white">Chạm để xem · đang tiết kiệm dữ liệu</Text>
          </View>
        </View>
      ) : (
        (!active || userPaused) && (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-black/40">
              <Play size={30} color="#fff" fill="#fff" />
            </View>
          </View>
        )
      )}
      {showSpinner && (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </Pressable>
  );
}

export default memo(OptimizedVideoFeedItem);
