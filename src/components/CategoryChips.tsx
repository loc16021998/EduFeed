import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutRectangle } from 'react-native';

import type { Category } from '@/types';
import { CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { isWeb } from '@/utils/platform';

interface CategoryChipsProps {
  options: Category[];
  value: Category;
  onChange: (c: Category) => void;
}

/** Pixels the pointer must travel before a mouse press becomes a drag (so a normal click still selects). */
const DRAG_THRESHOLD = 6;

/**
 * Horizontally scrollable subject chips.
 * - Phone: swipe with a finger (native scrolling).
 * - Web with a mouse: wheel scrolls sideways, press-and-drag slides the row, and arrow buttons appear at
 *   whichever edge still has hidden chips.
 * The selected chip is always scrolled into view.
 */
export default function CategoryChips({ options, value, onChange }: CategoryChipsProps) {
  const scrollRef = useRef<ScrollView>(null);
  const x = useRef(0);
  const viewW = useRef(0);
  const contentW = useRef(0);
  const chipLayout = useRef<Partial<Record<Category, LayoutRectangle>>>({});
  const [edges, setEdges] = useState({ left: false, right: false });
  const [hoverPointer] = useState(
    () => isWeb && typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches,
  );

  const updateEdges = () => {
    const left = x.current > 2;
    const right = x.current + viewW.current < contentW.current - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  };

  const scrollBy = (dx: number) => {
    const max = Math.max(0, contentW.current - viewW.current);
    scrollRef.current?.scrollTo({ x: Math.min(max, Math.max(0, x.current + dx)), animated: true });
  };

  // Keep the selected chip visible (e.g. after picking one near the edge).
  useEffect(() => {
    const l = chipLayout.current[value];
    if (!l || !viewW.current) return;
    if (l.x < x.current + 16) scrollRef.current?.scrollTo({ x: Math.max(0, l.x - 16), animated: true });
    else if (l.x + l.width > x.current + viewW.current - 16) {
      scrollRef.current?.scrollTo({ x: l.x + l.width - viewW.current + 16, animated: true });
    }
  }, [value]);

  // Web: mouse wheel → sideways scroll, and click-and-drag to slide the row.
  useEffect(() => {
    if (!isWeb) return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!node) return;

    const onWheel = (e: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      const max = node.scrollWidth - node.clientWidth;
      const atEnd = (delta < 0 && node.scrollLeft <= 0) || (delta > 0 && node.scrollLeft >= max - 1);
      if (atEnd) return; // let the page / feed scroll once the row has reached its end
      e.preventDefault();
      node.scrollLeft += delta;
    };

    let startX = 0;
    let startScroll = 0;
    let pointerId: number | null = null;
    let dragged = false;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return; // fingers already scroll natively
      pointerId = e.pointerId;
      startX = e.clientX;
      startScroll = node.scrollLeft;
      dragged = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!dragged) {
        dragged = true;
        node.style.cursor = 'grabbing';
        node.style.userSelect = 'none';
      }
      node.scrollLeft = startScroll - dx;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      node.style.cursor = '';
      node.style.userSelect = '';
    };
    // A drag must not also select the chip under the mouse when the button is released.
    const onClickCapture = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    };

    node.style.cursor = 'grab';
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    node.addEventListener('click', onClickCapture, true);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      node.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return (
    <View className="relative" testID="category-chips">
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => {
          x.current = e.nativeEvent.contentOffset.x;
          updateEdges();
        }}
        onLayout={(e) => {
          viewW.current = e.nativeEvent.layout.width;
          updateEdges();
        }}
        onContentSizeChange={(w) => {
          contentW.current = w;
          updateEdges();
        }}
        contentContainerClassName="gap-2 px-4 py-3"
      >
        {options.map((c) => {
          const active = c === value;
          return (
            <Pressable
              key={c}
              onPress={() => onChange(c)}
              onLayout={(e) => (chipLayout.current[c] = e.nativeEvent.layout)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`rounded-full px-4 py-2 ${active ? 'bg-brand-500' : 'bg-white border border-slate-200'}`}
            >
              <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>
                {CATEGORY_LABELS[c]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Mouse users: arrows at the edges that still hide chips. Phones swipe instead. */}
      {hoverPointer && edges.left && (
        <EdgeArrow side="left" onPress={() => scrollBy(-Math.max(160, viewW.current * 0.7))} />
      )}
      {hoverPointer && edges.right && (
        <EdgeArrow side="right" onPress={() => scrollBy(Math.max(160, viewW.current * 0.7))} />
      )}
    </View>
  );
}

function EdgeArrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, bottom: 0, [side]: 0, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={side === 'left' ? 'Xem các môn trước' : 'Xem thêm môn học'}
        className="h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-100"
        style={{ shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}
      >
        <Icon size={18} color={COLORS.ink} />
      </Pressable>
    </View>
  );
}
