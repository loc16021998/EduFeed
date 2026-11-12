import { BellOff, CalendarCheck, CheckCheck, Gift, Info, X, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectUnreadCount, useNotificationStore, type AppNotification, type NotificationKind, type NotificationLink } from '@/store/useNotificationStore';
import { COLORS } from '@/utils/constants';
import { MAX_APP_WIDTH, isWeb } from '@/utils/platform';

const KIND: Record<NotificationKind, { icon: LucideIcon; color: string; bg: string }> = {
  BOOKING: { icon: CalendarCheck, color: '#1E40AF', bg: '#DBEAFE' },
  REMINDER: { icon: CalendarCheck, color: '#B45309', bg: '#FEF3C7' },
  REWARD: { icon: Gift, color: '#B45309', bg: '#FDE68A' },
  SYSTEM: { icon: Info, color: '#334155', bg: '#E2E8F0' },
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Open the screen a notification points to. */
  onNavigate: (link: NotificationLink) => void;
}

/**
 * Slide-out notification history (right edge). Swipe right or tap outside to close.
 * Opening it does not mark everything read — each item is read when tapped, or via "Đánh dấu đã đọc".
 */
export default function NotificationCenter({ visible, onClose, onNavigate }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const items = useNotificationStore((s) => s.items);
  const unread = useNotificationStore(selectUnreadCount);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const panelW = Math.min((isWeb ? Math.min(width, MAX_APP_WIDTH) : width) * 0.88, 400);
  const x = useSharedValue(panelW);

  useEffect(() => {
    x.value = visible ? withSpring(0, { damping: 20, stiffness: 180 }) : panelW;
  }, [visible, panelW, x]);

  const close = () => {
    x.value = withTiming(panelW, { duration: 180 }, (done) => {
      if (done) runOnJS(onClose)();
    });
  };

  const swipe = Gesture.Pan()
    .activeOffsetX(12)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX > panelW * 0.3 || e.velocityX > 600) {
        x.value = withTiming(panelW, { duration: 160 }, (done) => {
          if (done) runOnJS(onClose)();
        });
      } else x.value = withSpring(0, { damping: 20 });
    });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - x.value / panelW }));

  const open = (n: AppNotification) => {
    markRead(n.id);
    if (n.link) {
      onClose();
      onNavigate(n.link);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Web: stay inside the centred phone-width column (see App.tsx). */}
        <View className="flex-1 flex-row justify-end self-center" style={{ width: isWeb ? Math.min(width, MAX_APP_WIDTH) : '100%' }}>
          <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,23,42,0.45)' }, backdrop]}>
            <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Đóng thông báo" />
          </Animated.View>
          <GestureDetector gesture={swipe}>
            {/* Animated wrapper: style only (NativeWind className on Animated.View can drop the width on web). */}
            <Animated.View style={[{ width: panelW, maxWidth: '100%', height: '100%' }, panel]} testID="notification-center">
              <View className="flex-1 bg-surface shadow-2xl shadow-black/40" style={{ paddingTop: insets.top }}>
              <View className="flex-row items-center gap-2 px-4 pb-2 pt-3">
                <Text className="flex-1 text-lg font-extrabold text-ink" accessibilityRole="header">
                  Thông báo
                </Text>
                {unread > 0 && (
                  <Pressable onPress={markAllRead} accessibilityRole="button" className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 active:bg-brand-100">
                    <CheckCheck size={14} color={COLORS.brand} />
                    <Text className="text-xs font-bold text-brand-700">Đánh dấu đã đọc</Text>
                  </Pressable>
                )}
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Đóng" className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200">
                  <X size={20} color={COLORS.ink} />
                </Pressable>
              </View>
              <ScrollView contentContainerClassName="gap-2 px-3 pb-8" style={{ paddingBottom: insets.bottom }}>
                {items.length === 0 ? (
                  <View className="mt-16 items-center gap-2 px-6">
                    <BellOff size={34} color={COLORS.subtle} />
                    <Text className="text-center text-[14px] font-semibold text-ink">Chưa có thông báo</Text>
                    <Text className="text-center text-xs leading-[18px] text-ink-muted">
                      Xác nhận lịch học thử, nhắc lịch và ưu đãi của ba mẹ sẽ hiện ở đây.
                    </Text>
                  </View>
                ) : (
                  items.map((n) => {
                    const k = KIND[n.kind];
                    const Icon = k.icon;
                    return (
                      <Pressable
                        key={n.id}
                        onPress={() => open(n)}
                        accessibilityRole="button"
                        accessibilityLabel={`${n.read ? '' : 'Chưa đọc. '}${n.title}. ${n.body}`}
                        testID="notification-item"
                        className={`flex-row gap-3 rounded-2xl p-3 active:opacity-90 ${n.read ? 'bg-white' : 'bg-brand-50'}`}
                      >
                        <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: k.bg }}>
                          <Icon size={18} color={k.color} />
                        </View>
                        <View className="flex-1 gap-0.5">
                          <View className="flex-row items-start gap-2">
                            <Text className={`flex-1 text-[14px] ${n.read ? 'font-semibold text-ink' : 'font-extrabold text-ink'}`}>{n.title}</Text>
                            {!n.read && <View className="mt-1.5 h-2 w-2 rounded-full bg-accent-500" />}
                          </View>
                          <Text className="text-xs leading-[17px] text-ink-muted">{n.body}</Text>
                          <Text className="text-[11px] text-ink-subtle">{ago(n.createdAt)}</Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
