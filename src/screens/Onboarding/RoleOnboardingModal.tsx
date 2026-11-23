/**
 * Role-aware 3-slide walkthrough, shown full screen after the first sign-in (see OnboardingGate) or from
 * Settings → "Xem lại hướng dẫn sử dụng".
 *
 * Motion runs off the scroll position (Animated, native driver on iOS / Android): dots stretch and fade,
 * the illustration scales — nothing is re-rendered per frame. The JS side only sets the page index when it
 * actually changes (light haptic tick), so swiping stays smooth on low-end phones.
 */
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Modal, Platform, Pressable, Text, View, type LayoutChangeEvent, type ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Button from '@/components/Button';
import { ONBOARDING, type OnboardingRole, type OnboardingSlide } from '@/config/onboardingSlides';
import { useRoleOnboardingStore } from '@/store/onboardingStore';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

const NATIVE = Platform.OS !== 'web';

export default function RoleOnboardingModal() {
  const active = useRoleOnboardingStore((s) => s.active);
  const complete = useRoleOnboardingStore((s) => s.completeOnboarding);
  if (!active) return null;
  const finish = () => complete(active.userId, active.role);
  return <Walkthrough key={`${active.role}-${active.userId ?? 'preview'}`} role={active.role} preview={active.preview} onDone={finish} />;
}

function Walkthrough({ role, preview, onDone }: { role: OnboardingRole; preview: boolean; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const content = ONBOARDING[role];
  const slides = content.slides;
  const [width, setWidth] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: NATIVE,
        listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
          if (!width) return;
          const i = Math.max(0, Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
          if (i !== indexRef.current) {
            indexRef.current = i;
            setIndex(i);
            haptics.light();
          }
        },
      }),
    [scrollX, width, slides.length],
  );

  const goTo = useCallback(
    (i: number) => {
      if (!width) return;
      listRef.current?.scrollToOffset({ offset: i * width, animated: true });
      // Web / reduced motion may not fire scroll events for programmatic scrolls: set the index directly too.
      if (i !== indexRef.current) {
        indexRef.current = i;
        setIndex(i);
        haptics.light();
      }
    },
    [width],
  );

  // Keep the visible page when the window is resized (web, foldables, rotation).
  useEffect(() => {
    if (width) listRef.current?.scrollToOffset({ offset: indexRef.current * width, animated: false });
  }, [width]);

  const last = index === slides.length - 1;
  const slide = slides[index];

  const renderItem = useCallback(
    ({ item, index: i }: ListRenderItemInfo<OnboardingSlide>) => (
      <SlideView slide={item} index={i} total={slides.length} width={width} height={pagerHeight} scrollX={scrollX} audience={content.audience} />
    ),
    [width, pagerHeight, scrollX, slides.length, content.audience],
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onDone} statusBarTranslucent>
      <View className="flex-1 bg-surface" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }} onLayout={onLayout} testID="role-onboarding">
        {/* Top bar: step + skip (top-right, as on most phones) */}
        <View className="h-14 flex-row items-center justify-between px-4">
          <Text className="text-[13px] font-semibold text-ink-subtle" testID="onboarding-step">
            {preview ? 'Xem lại · ' : ''}
            {index + 1}/{slides.length}
          </Text>
          {!last ? (
            <Pressable onPress={onDone} accessibilityRole="button" hitSlop={8} className="min-h-12 flex-row items-center gap-1 rounded-full px-3 active:bg-slate-200" testID="onboarding-skip">
              <Text className="text-[15px] font-semibold text-ink-muted">Bỏ qua</Text>
              <X size={16} color={COLORS.muted} />
            </Pressable>
          ) : (
            <View className="h-12" />
          )}
        </View>

        <View className="flex-1" onLayout={(e) => setPagerHeight(Math.round(e.nativeEvent.layout.height))}>
          {width > 0 && pagerHeight > 0 && (
            <Animated.FlatList
              ref={listRef as never}
              data={slides}
              keyExtractor={(s) => s.key}
              renderItem={renderItem}
              horizontal
              pagingEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              initialNumToRender={3}
              style={{ flex: 1 }}
              testID="onboarding-pager"
            />
          )}
        </View>

        {/* Dots: fixed-size slots, scaled by scroll position (native driver friendly). */}
        <View className="flex-row items-center justify-center gap-1.5 py-4" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slides.map((s, i) => {
            const range = [(i - 1) * width, i * width, (i + 1) * width];
            const scaleX = width ? scrollX.interpolate({ inputRange: range, outputRange: [0.36, 1, 0.36], extrapolate: 'clamp' }) : i === 0 ? 1 : 0.36;
            const opacity = width ? scrollX.interpolate({ inputRange: range, outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' }) : i === 0 ? 1 : 0.35;
            return <Animated.View key={s.key} style={{ width: 22, height: 8, borderRadius: 4, backgroundColor: slide.tint, opacity, transform: [{ scaleX }] }} />;
          })}
        </View>

        <View className="px-5">
          <Button
            title={slide.primaryActionLabel}
            size="lg"
            onPress={() => (last ? onDone() : goTo(index + 1))}
            accessibilityHint={last ? 'Đóng hướng dẫn và bắt đầu dùng ứng dụng' : `Sang trang ${index + 2}`}
            testID="onboarding-next"
          />
        </View>
      </View>
    </Modal>
  );
}

function SlideView({
  slide,
  index,
  total,
  width,
  height,
  scrollX,
  audience,
}: {
  slide: OnboardingSlide;
  index: number;
  total: number;
  width: number;
  height: number;
  scrollX: Animated.Value;
  audience: string;
}) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  const scale = scrollX.interpolate({ inputRange: range, outputRange: [0.82, 1, 0.82], extrapolate: 'clamp' });
  const shift = scrollX.interpolate({ inputRange: range, outputRange: [24, 0, -24], extrapolate: 'clamp' });
  const Icon = slide.icon;
  return (
    <View
      style={{ width, height }}
      className="justify-center px-6"
      accessible
      accessibilityLabel={`Trang ${index + 1} trên ${total}: ${slide.title}. ${slide.subtitle}`}
      testID={`onboarding-slide-${index}`}
    >
      <Animated.View style={{ alignSelf: 'center', transform: [{ scale }] }}>
        <View className="h-44 w-44 items-center justify-center rounded-full" style={{ backgroundColor: `${slide.tint}1A` }}>
          <View className="h-32 w-32 items-center justify-center rounded-full" style={{ backgroundColor: `${slide.tint}26` }}>
            <Text style={{ fontSize: 64, lineHeight: 76 }}>{slide.emoji}</Text>
          </View>
          <View className="absolute bottom-3 right-3 h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: slide.tint }}>
            <Icon size={24} color="#fff" />
          </View>
        </View>
      </Animated.View>
      <Animated.View className="mt-8 gap-3" style={{ transform: [{ translateX: shift }] }}>
        <Text className="text-center text-xs font-bold uppercase tracking-widest" style={{ color: slide.tint }}>
          {audience}
        </Text>
        <Text className="text-center text-[24px] font-extrabold leading-[31px] text-ink" accessibilityRole="header">
          {slide.title}
        </Text>
        <Text className="text-center text-[16px] leading-[24px] text-ink-muted">{slide.subtitle}</Text>
        <View className="mt-2 flex-row items-start gap-2 rounded-2xl bg-white p-3.5">
          <Text style={{ fontSize: 16 }}>💡</Text>
          <Text className="flex-1 text-[14px] leading-[21px] text-ink">{slide.tip}</Text>
        </View>
      </Animated.View>
    </View>
  );
}
