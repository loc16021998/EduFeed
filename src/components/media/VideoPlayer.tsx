// Native (Android / iOS) video — react-native-video. Web uses VideoPlayer.web.tsx.
import Video, { ResizeMode } from 'react-native-video';

import type { VideoPlayerProps } from './types';

export default function VideoPlayer({
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
}: VideoPlayerProps) {
  const mode = resizeMode === 'contain' ? ResizeMode.CONTAIN : ResizeMode.COVER;
  return (
    <Video
      source={{ uri }}
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
}
