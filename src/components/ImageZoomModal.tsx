import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ImageZoomModalProps {
  urls: string[];
  /** Index to open at; null = closed. */
  index: number | null;
  onClose: () => void;
  title?: string;
}

const MAX_SCALE = 4;

/** Full-screen photo viewer: pinch / double-tap to zoom, drag to pan, arrows between photos. */
export default function ImageZoomModal({ urls, index, onClose, title }: ImageZoomModalProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(0);
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    saved.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    sx.value = 0;
    sy.value = 0;
  };

  useEffect(() => {
    if (index !== null) setI(index);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.01) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        sx.value = 0;
        sy.value = 0;
      }
    });
  const pan = Gesture.Pan()
    .minDistance(4)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const maxX = ((scale.value - 1) * width) / 2;
      const maxY = ((scale.value - 1) * height) / 2;
      tx.value = Math.min(maxX, Math.max(-maxX, sx.value + e.translationX));
      ty.value = Math.min(maxY, Math.max(-maxY, sy.value + e.translationY));
    })
    .onEnd(() => {
      sx.value = tx.value;
      sy.value = ty.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1 ? 1 : 2.5;
      scale.value = withTiming(next);
      saved.value = next;
      if (next === 1) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        sx.value = 0;
        sy.value = 0;
      }
    });
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  const go = (d: number) => {
    reset();
    setI((v) => (v + d + urls.length) % urls.length);
  };

  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black" testID="image-zoom">
          <GestureDetector gesture={gesture}>
            <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, style]}>
              {!!urls[i] && <Image source={{ uri: urls[i] }} style={{ width, height: height * 0.8 }} resizeMode="contain" accessibilityLabel={title ? `${title} – ảnh ${i + 1}` : `Ảnh ${i + 1}`} />}
            </Animated.View>
          </GestureDetector>
          <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }} className="flex-row items-center justify-between">
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng ảnh" className="h-11 w-11 items-center justify-center rounded-full bg-white/15 active:bg-white/30">
              <X size={22} color="#fff" />
            </Pressable>
            {urls.length > 1 && (
              <Text className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">
                {i + 1}/{urls.length}
              </Text>
            )}
          </View>
          {urls.length > 1 && (
            <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + 20, left: 0, right: 0 }} className="flex-row justify-center gap-6">
              <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Ảnh trước" className="h-11 w-11 items-center justify-center rounded-full bg-white/15 active:bg-white/30">
                <ChevronLeft size={22} color="#fff" />
              </Pressable>
              <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Ảnh sau" className="h-11 w-11 items-center justify-center rounded-full bg-white/15 active:bg-white/30">
                <ChevronRight size={22} color="#fff" />
              </Pressable>
            </View>
          )}
          <Text style={{ position: 'absolute', bottom: insets.bottom + 76, left: 0, right: 0 }} className="text-center text-[11px] text-white/60">
            Chụm hai ngón hoặc chạm đúp để phóng to
          </Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
