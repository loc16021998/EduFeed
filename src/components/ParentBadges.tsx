import { Brain, Gift, HeartHandshake, Lock, Sparkles, Trophy, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { allBadgesUnlocked, badgeProgress, rewardUnlocked, useParentClubStore } from '@/store/useParentClubStore';
import { COLORS } from '@/utils/constants';
import { BADGES, PARENT_CLUB_REWARD, type BadgeDef, type BadgeId } from '@/utils/parentClub';

import Button from './Button';
import Confetti from './Confetti';

const ICONS = { Brain, HeartHandshake, Sparkles } as const;

export function BadgeIcon({ badge, size = 22, locked }: { badge: BadgeDef; size?: number; locked?: boolean }) {
  const Icon = ICONS[badge.icon];
  return <Icon size={size} color={locked ? '#94A3B8' : '#fff'} strokeWidth={2.4} />;
}

/** Gradient progress ring (brand green → blue, the logo colours). */
function ProgressRing({ done, total, size = 132 }: { done: number; total: number; size?: number }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  const pop = useSharedValue(0.85);
  const shine = useSharedValue(0);
  useEffect(() => {
    pop.value = withSpring(1, { damping: 12, stiffness: 140 });
    // A soft "breathing" glow once everything is collected.
    if (done >= total) shine.value = withRepeat(withSequence(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1200 })), -1);
  }, [pop, shine, done, total]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value + shine.value * 0.03 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.15 + shine.value * 0.35 }));

  return (
    <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, popStyle]}>
      {done >= total && (
        <Animated.View style={[{ position: 'absolute', width: size + 18, height: size + 18, borderRadius: (size + 18) / 2, backgroundColor: '#8BC34A' }, glowStyle]} />
      )}
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#8BC34A" />
            <Stop offset="1" stopColor="#1478BE" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#E2E8F0" strokeWidth={stroke} fill="#fff" />
        {frac > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#ring)"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - frac)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {/* Own stacking layer: on web the absolutely-positioned SVG would paint over static content. */}
      <View style={{ position: 'relative', zIndex: 1, alignItems: 'center' }}>
        <Trophy size={26} color={done >= total ? '#F59E0B' : COLORS.subtle} />
        <Text className="mt-0.5 text-xl font-black text-ink">
          {done}/{total}
        </Text>
        <Text className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">huy hiệu</Text>
      </View>
    </Animated.View>
  );
}

interface ParentBadgesProps {
  visible: boolean;
  onClose: () => void;
  /** Go to the booking form (the reward travels with the trial booking). */
  onBook: () => void;
}

/** "CLB Phụ huynh TH EDU" bottom sheet: progress ring, badges, and the reward. */
export default function ParentBadges({ visible, onClose, onBook }: ParentBadgesProps) {
  const insets = useSafeAreaInsets();
  const state = useParentClubStore();
  const done = BADGES.filter((b) => !!state.unlockedAt[b.id]).length;
  const complete = allBadgesUnlocked(state);
  const reward = rewardUnlocked(state) ? PARENT_CLUB_REWARD : null;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [shot, setShot] = useState(0);

  // Celebrate when the sheet opens on a completed collection.
  useEffect(() => {
    if (visible && complete) setShot((n) => n + 1);
  }, [visible, complete]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <View
          className="max-h-[90%] rounded-t-[28px] bg-surface"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          testID="parent-badges"
        >
          <View className="items-center pt-2.5">
            <View className="h-1.5 w-10 rounded-full bg-slate-300" />
          </View>
          <View className="flex-row items-center px-5 pt-2">
            <Text className="flex-1 text-lg font-extrabold text-ink" accessibilityRole="header">
              CLB Phụ huynh TH EDU
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200">
              <X size={20} color={COLORS.ink} />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="gap-4 px-5 pb-2 pt-1">
            <View className="items-center gap-2">
              <ProgressRing done={done} total={BADGES.length} />
              <Text className="text-center text-[13px] leading-5 text-ink-muted">
                {complete
                  ? 'Ba mẹ đã sưu tập đủ huy hiệu. Cảm ơn ba mẹ đã đồng hành cùng con! 🎉'
                  : 'Mỗi huy hiệu là một bước hiểu con hơn. Không giới hạn thời gian.'}
              </Text>
            </View>

            <View className="gap-2.5">
              {BADGES.map((b) => (
                <BadgeRow key={b.id} badge={b} unlockedAt={state.unlockedAt[b.id]} progress={badgeProgress(state, b.id)} />
              ))}
            </View>

            {PARENT_CLUB_REWARD && (
              <View
                className={`gap-2 rounded-3xl border p-4 ${reward ? 'border-amber-300 bg-amber-50' : 'border-dashed border-slate-300 bg-white'}`}
                testID="club-reward"
              >
                <View className="flex-row items-center gap-2.5">
                  <View className={`h-10 w-10 items-center justify-center rounded-2xl ${reward ? 'bg-amber-400' : 'bg-slate-100'}`}>
                    {reward ? <Gift size={20} color="#fff" /> : <Lock size={18} color={COLORS.subtle} />}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-extrabold text-ink">{PARENT_CLUB_REWARD.title}</Text>
                    <Text className="text-xs text-ink-muted">
                      {reward ? 'Đã mở khóa' : `Sưu tập đủ ${BADGES.length} huy hiệu để mở khóa`}
                    </Text>
                  </View>
                </View>
                {reward && (
                  <>
                    <Text className="text-xs leading-[18px] text-amber-900">{PARENT_CLUB_REWARD.detail}</Text>
                    <Button title="Đặt lịch học thử để dùng ưu đãi" variant="accent" onPress={onBook} />
                  </>
                )}
              </View>
            )}
          </ScrollView>
          <Confetti shot={shot} width={box.w} height={box.h} />
        </View>
      </View>
    </Modal>
  );
}

function BadgeRow({ badge, unlockedAt, progress }: { badge: BadgeDef; unlockedAt?: string; progress: number }) {
  const locked = !unlockedAt;
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-white p-3.5" testID={`badge-${badge.id}`} accessible accessibilityLabel={`${badge.title}: ${locked ? `chưa đạt, ${progress}/${badge.goal}` : 'đã đạt'}`}>
      <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: locked ? '#F1F5F9' : badge.color }}>
        <BadgeIcon badge={badge} locked={locked} />
      </View>
      <View className="flex-1 gap-1">
        <Text className={`text-[15px] font-bold ${locked ? 'text-ink-muted' : 'text-ink'}`}>{badge.title}</Text>
        <Text className="text-xs leading-4 text-ink-muted">{badge.how}</Text>
        {locked && badge.goal > 1 && (
          <View className="flex-row items-center gap-2">
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <View className="h-full rounded-full" style={{ width: `${(progress / badge.goal) * 100}%`, backgroundColor: badge.color }} />
            </View>
            <Text className="text-[11px] font-semibold text-ink-subtle">
              {progress}/{badge.goal}
            </Text>
          </View>
        )}
      </View>
      {!locked && <Text className="text-[11px] font-bold" style={{ color: badge.color }}>ĐÃ ĐẠT</Text>}
    </View>
  );
}

/**
 * Toast shown when a badge (or the reward) unlocks: slides in at the top with confetti, auto-hides.
 * Tapping it opens the badge sheet.
 */
export function ParentClubToast({ onOpen }: { onOpen: () => void }) {
  const current = useParentClubStore((s) => s.celebrations[0]);
  const shift = useParentClubStore((s) => s.shiftCelebration);
  const insets = useSafeAreaInsets();
  const y = useSharedValue(-160);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [shot, setShot] = useState(0);

  useEffect(() => {
    if (!current) return undefined;
    setShot((n) => n + 1);
    y.value = withSequence(withSpring(0, { damping: 14, stiffness: 160 }), withDelay(3200, withTiming(-160, { duration: 260 })));
    const t = setTimeout(shift, 3600);
    return () => clearTimeout(t);
  }, [current, shift, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  if (!current) return null;

  const badge = current.kind === 'badge' ? BADGES.find((b) => b.id === current.id) : undefined;
  const title = badge ? `Huy hiệu mới: ${badge.title}` : `Đã mở khóa: ${PARENT_CLUB_REWARD?.title ?? ''}`;
  const sub = badge ? 'Chạm để xem bộ sưu tập CLB Phụ huynh' : 'Ưu đãi sẽ được gửi kèm đăng ký học thử';

  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, zIndex: 50 }, style]}>
      <Pressable
        onPress={() => {
          shift();
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        className="flex-row items-center gap-3 rounded-3xl bg-ink p-3.5 shadow-lg shadow-black/30"
        testID="club-toast"
      >
        <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: badge?.color ?? '#F59E0B' }}>
          {badge ? <BadgeIcon badge={badge} /> : <Gift size={22} color="#fff" />}
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-extrabold text-white">{title}</Text>
          <Text className="text-xs text-slate-300">{sub}</Text>
        </View>
        <Confetti shot={shot} width={box.w} height={box.h} count={24} />
      </Pressable>
    </Animated.View>
  );
}

export type { BadgeId };
