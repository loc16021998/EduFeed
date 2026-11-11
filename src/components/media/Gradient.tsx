// Native gradient — react-native-linear-gradient. Web uses Gradient.web.tsx (CSS).
import LinearGradient from 'react-native-linear-gradient';

import type { GradientProps } from './types';

export default function Gradient({ colors, start = { x: 0.5, y: 0 }, end = { x: 0.5, y: 1 }, style, pointerEvents, children }: GradientProps) {
  return (
    <LinearGradient colors={colors} start={start} end={end} style={style} pointerEvents={pointerEvents}>
      {children}
    </LinearGradient>
  );
}
