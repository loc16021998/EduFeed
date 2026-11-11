import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/** Shared props for VideoPlayer.tsx (react-native-video) and VideoPlayer.web.tsx (<video>). */
export interface VideoPlayerProps {
  uri: string;
  poster?: string;
  paused?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Show the platform's playback controls. */
  controls?: boolean;
  resizeMode?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
  onBuffering?: (isBuffering: boolean) => void;
  onEnd?: () => void;
}

/** Shared props for Gradient.tsx (react-native-linear-gradient) and Gradient.web.tsx (CSS). */
export interface GradientProps {
  colors: string[];
  /** 0–1 coordinates, like react-native-linear-gradient. Default: top → bottom. */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  children?: ReactNode;
}
