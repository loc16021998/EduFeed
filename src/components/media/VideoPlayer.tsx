// Native (Android / iOS) video — react-native-video. Web uses VideoPlayer.web.tsx.
import { forwardRef, useImperativeHandle, useRef } from 'react';
import Video, { ResizeMode, type VideoRef } from 'react-native-video';

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
}, ref) {
  const video = useRef<VideoRef>(null);
  useImperativeHandle(ref, () => ({
    seek: (s) => video.current?.seek(s),
    enterFullscreen: () => video.current?.presentFullscreenPlayer(),
  }));
  const mode = resizeMode === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;
  return (
    <Video
      ref={video}
      source={{ uri }}
      volume={volume}
      progressUpdateInterval={250}
      onProgress={onProgress ? (p) => onProgress(p.currentTime, p.seekableDuration || p.playableDuration) : undefined}
      poster={poster}
      posterResizeMode={mode}
      paused={paused}
      muted={muted}
      repeat={loop}
      controls={controls}
      resizeMode={mode}
      style={style}
      onLoadStart={() => onBuffering?.(true)}
      onReadyForDisplay={() => onBuffering?.(false)}
      onBuffer={({ isBuffering }) => onBuffering?.(isBuffering)}
      onEnd={onEnd}
      ignoreSilentSwitch="obey"
      playInBackground={false}
    />
  );
});

export default VideoPlayer;
