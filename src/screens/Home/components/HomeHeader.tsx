import { Bell, Search, Trophy, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/utils/constants';

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

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <View style={{ paddingTop: insets.top }} className="bg-surface">
      <View className="h-14 flex-row items-center gap-2 px-4">
        {/* Brand mark. Long-press (1s) opens the admin sign-in — parents never need it. */}
        <Pressable
          onLongPress={onBrandLongPress}
          delayLongPress={1000}
          accessibilityRole="header"
          className="flex-1 flex-row items-center gap-2"
        >
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-500">
            <Text className="text-base font-black text-white">TH</Text>
          </View>
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
