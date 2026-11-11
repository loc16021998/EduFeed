import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  type ViewToken,
} from 'react-native';

import { CategoryChips, TrustTicker } from '@/components';
import type { TabScreenProps } from '@/navigation/types';
import { useCtaHandler } from '@/navigation/useCtaHandler';
import { buildShareUrl, shareMessage } from '@/services/media/shareLinks';
import { useFeedStore, useStaffStore } from '@/store';
import type { Category, FeedItem } from '@/types';
import { COLORS, FEED_FILTERS } from '@/utils/constants';
import { normalizeVN } from '@/utils/helpers';
import { shareText, useAppWidth } from '@/utils/platform';

import FeedVideoCard from './components/FeedVideoCard';
import HomeHeader from './components/HomeHeader';

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };
const CARD_GAP = 16; // matches mb-4 on FeedVideoCard

export default function HomeScreen(_: TabScreenProps<'Home'>) {
  const isFocused = useIsFocused();
  const width = useAppWidth();
  const cardHeight = Math.round((width - 32) * 1.25); // 4:5 portrait card

  const {
    items, status, selectedCategory, likedIds, followedTeachers, loadingMore,
    load, loadMore, setCategory, toggleLike, toggleFollow,
  } = useFeedStore();
  const onCta = useCtaHandler();
  const navigation = useNavigation();
  const isStaff = useStaffStore((s) => s.isStaff);

  const onShare = useCallback((item: FeedItem) => {
    const url = buildShareUrl(item.shareSlug);
    if (url) shareText(shareMessage(item.title, url));
  }, []);

  /** Hidden staff entry: long-press the TH EDU logo. */
  const openStaffArea = useCallback(() => {
    navigation.navigate(useStaffStore.getState().isStaff ? 'StaffVideos' : 'StaffLogin');
  }, [navigation]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true); // autoplay muted, parent opts in to sound
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(3); // TODO: wire to notifications store
  const listRef = useRef<FlatList<FeedItem>>(null);

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  const visible = useMemo(() => {
    const q = normalizeVN(query.trim());
    return items.filter((i) => {
      if (selectedCategory !== 'ALL' && i.category !== selectedCategory) return false;
      if (!q) return true;
      return normalizeVN([i.title, i.teacherName, ...i.tags].join(' ')).includes(q);
    });
  }, [items, selectedCategory, query]);

  // Autoplay whichever card is most on-screen. Must be a stable ref for FlatList.
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setActiveId(viewableItems[0]?.key ?? null);
  }).current;

  const onChangeCategory = useCallback(
    (c: Category) => {
      setCategory(c);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [setCategory],
  );

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleSearch = useCallback(() => {
    setSearchOpen((o) => {
      if (o) setQuery('');
      return !o;
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedVideoCard
        item={item}
        height={cardHeight}
        active={isFocused && activeId === item.id}
        muted={muted}
        liked={likedIds.includes(item.id)}
        following={followedTeachers.includes(item.teacherName)}
        onToggleMute={toggleMute}
        onLike={toggleLike}
        onFollow={toggleFollow}
        onCta={onCta}
        onShare={onShare}
      />
    ),
    [cardHeight, isFocused, activeId, muted, likedIds, followedTeachers, toggleMute, toggleLike, toggleFollow, onCta, onShare],
  );

  return (
    <View className="flex-1 bg-surface">
      <HomeHeader
        unreadCount={unread}
        onNotificationsPress={() => setUnread(0)}
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        query={query}
        onQueryChange={setQuery}
        onBrandLongPress={openStaffArea}
      />
      <View>
        <CategoryChips options={FEED_FILTERS} value={selectedCategory} onChange={onChangeCategory} />
        {/* Real, anonymised recent bookings — renders nothing if there are none. */}
        <TrustTicker active={isFocused} />
      </View>

      {status === 'loading' && items.length === 0 ? (
        <ActivityIndicator className="mt-10" color={COLORS.brand} />
      ) : (
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          extraData={activeId}
          getItemLayout={(_d, index) => ({
            length: cardHeight + CARD_GAP,
            offset: (cardHeight + CARD_GAP) * index,
            index,
          })}
          snapToInterval={cardHeight + CARD_GAP}
          decelerationRate="fast"
          viewabilityConfig={VIEWABILITY}
          onViewableItemsChanged={onViewableItemsChanged}
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          keyboardDismissMode="on-drag"
          contentContainerClassName="pb-24"
          // Infinite scroll: fetch the next server page well before the end. Disabled while
          // searching, since search only filters what's already loaded.
          onEndReached={query ? undefined : loadMore}
          onEndReachedThreshold={1.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" color={COLORS.brand} /> : null}
          refreshControl={
            <RefreshControl refreshing={status === 'loading'} onRefresh={load} tintColor={COLORS.brand} />
          }
          ListEmptyComponent={
            <Text className="mt-10 px-8 text-center text-ink-muted">
              {query ? `Không tìm thấy video cho "${query}".` : 'Chưa có video cho chủ đề này.'}
            </Text>
          }
        />
      )}

      {/* Staff only: quick access to publish a new video. */}
      {isStaff && (
        <Pressable
          onPress={() => navigation.navigate('VideoEditor')}
          accessibilityRole="button"
          accessibilityLabel="Đăng video mới"
          className="absolute bottom-5 right-5 flex-row items-center gap-1.5 rounded-full bg-brand-500 px-4 py-3 shadow-lg shadow-black/25 active:bg-brand-600"
        >
          <Plus size={18} color="#fff" strokeWidth={3} />
          <Text className="text-sm font-bold text-white">Đăng video</Text>
        </Pressable>
      )}
    </View>
  );
}
