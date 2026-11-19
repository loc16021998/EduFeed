// Web video — plain HTML <video>. Native uses VideoPlayer.tsx (react-native-video).
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';

import { useAppActive } from '@/hooks/useAppActive';

import type { VideoPlayerHandle, VideoPlayerProps } from './types';

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer({
  uri,
  poster,
  paused = false,
  muted = false,
  loop = false,
  controls = false,
  resizeMode = 'cover',
  style,
  onBuffering,
  onEnd,
  volume = 1,
  onProgress,
  preload,
}, handle) {
  // Every player (feed, full screen, voice notes) stops when the app is backgrounded / the tab is hidden:
  // no audio from a locked phone, no video downloading in the background.
  const appActive = useAppActive();
  const isPaused = paused || !appActive;
  const ref = useRef<HTMLVideoElement>(null);
  useImperativeHandle(handle, () => ({
    seek: (s) => {
      if (ref.current) ref.current.currentTime = s;
    },
    enterFullscreen: () => {
      ref.current?.requestFullscreen?.().catch(() => {});
    },
  }));

  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  // On unmount (card scrolled away, modal closed) a detached <video> can keep downloading until it is
  // garbage-collected. Dropping the source aborts the request and frees the decoder right away.
  useEffect(() => {
    const v = ref.current;
    return () => {
      if (!v) return;
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch {
        /* already gone */
      }
    };
  }, []);

  // `muted` must be set as a property for autoplay policies; React only sets the attribute once.
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isPaused) v.pause();
    else v.play().catch(() => onBuffering?.(false)); // autoplay blocked → show controls state, not a spinner
  }, [isPaused, uri, onBuffering]);

  return (
    <View style={style}>
      <video
        ref={ref}
        src={uri}
        poster={poster}
        loop={loop}
        controls={controls}
        playsInline
        muted={muted}
        autoPlay={!isPaused}
        preload={preload}
        style={{ width: '100%', height: '100%', objectFit: resizeMode, backgroundColor: '#000', display: 'block' }}
        onLoadStart={() => onBuffering?.(true)}
        onWaiting={() => onBuffering?.(true)}
        onPlaying={() => onBuffering?.(false)}
        onCanPlay={() => onBuffering?.(false)}
        onEnded={onEnd}
        onTimeUpdate={onProgress ? (e) => onProgress(e.currentTarget.currentTime, e.currentTarget.duration || 0) : undefined}
      />
    </View>
  );
});

export default VideoPlayer;
