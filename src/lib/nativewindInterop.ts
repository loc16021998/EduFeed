/**
 * NativeWind only maps `className` → style for React Native's own components. Reanimated's
 * Animated components must be registered, otherwise their `className` is silently dropped
 * (no background, padding, radius…) — e.g. cards using `entering={FadeInDown}`.
 * Imported once from App.tsx, before any screen renders.
 */
import { cssInterop } from 'nativewind';
import Animated from 'react-native-reanimated';

cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.Text, { className: 'style' });
cssInterop(Animated.ScrollView, { className: 'style', contentContainerClassName: 'contentContainerStyle' });
