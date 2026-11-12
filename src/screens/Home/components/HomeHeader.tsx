import { Bell, Search, Trophy, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Image, Pressable, Text, TextInput, View, type GestureResponderEvent, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import mark from '@/assets/branding/logo-th-mark.png';
import { COLORS } from '@/utils/constants';

const MARK: ImageSourcePropType = typeof mark === 'string' ? { uri: mark } : mark;
// logo-th-mark.png is 430 × 256.
const MARK_RATIO = 430 / 256;

interface HomeHeaderProps {
  unreadCount: number;
  onNotificationsPress: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  /** Hidden staff entry point. */
  onBrandLongPress?: () => void;
  /** CLB Phụ huynh: badges collected / total. */
  club?: { done: number; total: number };
  onClubPress?: () => void;
}

export default function HomeHeader({
  unreadCount,
  onNotificationsPress,
  searchOpen,
  onToggleSearch,
  query,
  onQueryChange,
  onBrandLongPress,
  club,
  onClubPress,
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  // Hold the brand ~0.9 s → admin sign-in. A finger is tracked with raw touch events: on the web the
  // press responder reports "press out" right after "press in" for touch, which would cancel the hold.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touching = useRef(false);
  const fired = useRef(false);
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const startHold = () => {
    cancelHold();
    fired.current = false;
    if (onBrandLongPress) {
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        fired.current = true;
        onBrandLongPress();
      }, 900);
    }
  };
  const onTouchStart = () => {
    touching.current = true;
    startHold();
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    touching.current = false;
    cancelHold();
    // The hold already opened the sign-in page: stop the browser's follow-up "click" from landing on
    // whatever is now under the finger (the new page's back button).
    if (fired.current) {
      fired.current = false;
      e.preventDefault();
    }
  };
  useEffect(() => cancelHold, []);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <View style={{ paddingTop: insets.top }} className="bg-surface">
      <View className="h-14 flex-row items-center gap-2 px-4">
        {/* Brand mark. Hold ~1s to open the admin sign-in — parents never need it. */}
        <Pressable
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => {
            touching.current = false;
            cancelHold();
          }}
          onPressIn={() => !touching.current && startHold()}
          onPressOut={() => !touching.current && cancelHold()}
          accessibilityRole="header"
          className="flex-1 flex-row items-center gap-2"
        >
          {/* TH EDU mark (white background removed; the wordmark is the text next to it). */}
          <Image source={MARK} style={{ width: 54, height: 54 / MARK_RATIO }} resizeMode="contain" accessibilityIgnoresInvertColors testID="brand-mark" />
          <View>
            <Text className="text-lg font-black leading-5 text-ink">
              TH <Text className="text-accent-500">EDU</Text>
            </Text>
            <Text className="text-[10px] font-medium uppercase tracking-widest text-ink-subtle">EduFeed</Text>
          </View>
        </Pressable>

        {club && onClubPress && (
          <Pressable
            onPress={onClubPress}
            accessibilityRole="button"
            accessibilityLabel={`CLB Phụ huynh: ${club.done} trên ${club.total} huy hiệu`}
            testID="club-button"
            className="h-9 flex-row items-center gap-1 rounded-full bg-amber-100 px-2.5 active:bg-amber-200"
          >
            <Trophy size={16} color="#B45309" />
            <Text className="text-xs font-extrabold text-amber-800">
              {club.done}/{club.total}
            </Text>
          </Pressable>
        )}

        <IconButton label={searchOpen ? 'Đóng tìm kiếm' : 'Tìm kiếm'} onPress={onToggleSearch}>
          {searchOpen ? <X size={22} color={COLORS.ink} /> : <Search size={22} color={COLORS.ink} />}
        </IconButton>

        <IconButton label={`Thông báo, ${unreadCount} chưa đọc`} onPress={onNotificationsPress}>
          <Bell size={22} color={COLORS.ink} />
          {unreadCount > 0 && (
            <View className="absolute right-1 top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-accent-500 px-1">
              <Text className="text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </IconButton>
      </View>

      {searchOpen && (
        <View className="mx-4 mb-1 h-11 flex-row items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
          <Search size={18} color={COLORS.subtle} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Tìm video, thầy cô, #hashtag…"
            placeholderTextColor={COLORS.subtle}
            returnKeyType="search"
            className="flex-1 text-base text-ink"
          />
          {!!query && (
            <Pressable onPress={() => onQueryChange('')} hitSlop={8} accessibilityLabel="Xóa">
              <X size={16} color={COLORS.subtle} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-200"
    >
      {children}
    </Pressable>
  );
}
