// Web video — plain HTML <video>. Native uses VideoPlayer.tsx (react-native-video).
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';

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
}, handle) {
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

  // `muted` must be set as a property for autoplay policies; React only sets the attribute once.
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => onBuffering?.(false)); // autoplay blocked → show controls state, not a spinner
  }, [paused, uri, onBuffering]);

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
        autoPlay={!paused}
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
