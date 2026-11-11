// Web gradient — CSS linear-gradient on a View. Native uses Gradient.tsx.
import { View, type ViewStyle } from 'react-native';

import type { GradientProps } from './types';

/** Convert react-native-linear-gradient start/end points to a CSS angle (0deg = to top, clockwise). */
function cssAngle(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export default function Gradient({ colors, start = { x: 0.5, y: 0 }, end = { x: 0.5, y: 1 }, style, pointerEvents, children }: GradientProps) {
  const background = { backgroundImage: `linear-gradient(${cssAngle(start, end)}deg, ${colors.join(', ')})` } as unknown as ViewStyle;
  return (
    <View pointerEvents={pointerEvents} style={[style, background]}>
      {children}
    </View>
  );
}
