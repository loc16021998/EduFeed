import { useIsFocused, useNavigation } from '@react-navigation/native';
import { BookmarkCheck, Plus } from 'lucide-react-native';
import { WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  type ViewToken,
} from 'react-native';

import { CategoryChips, FeedCardSkeleton, TrustTicker } from '@/components';
import NotificationCenter from '@/components/NotificationCenter';
import VideoPlayerModal, { SavedVideosSheet } from '@/components/VideoPlayerModal';
import DailySparkCard, { useSparkHiddenToday } from '@/components/DailySparkCard';
import type { TabScreenProps } from '@/navigation/types';
import { useCtaHandler } from '@/navigation/useCtaHandler';
import { trackEvent } from '@/services/analytics';
import { buildShareUrl, feedShareMessage } from '@/services/media/shareLinks';
import VideoCommentsSheet from '@/components/Feed/VideoCommentsSheet';
import { useBookmarkStore, useFeedStore, useMyBookingsStore, useNotificationStore, useParentClubStore, useStaffStore } from '@/store';
import { selectUnreadCount, type NotificationLink } from '@/store/useNotificationStore';
import type { Category, FeedItem } from '@/types';
import { CATEGORY_LABELS, COLORS, FEED_FILTERS } from '@/utils/constants';
import { normalizeVN } from '@/utils/helpers';
import { BADGES, VIDEO_WATCH_MS } from '@/utils/parentClub';
import { useAppActive } from '@/hooks/useAppActive';
import { useMediaPolicy } from '@/store/networkStore';
import { prefetchImages } from '@/utils/mediaCache';
import { shareText, useAppWidth } from '@/utils/platform';

import FeedVideoCard from './components/FeedVideoCard';
import HomeHeader from './components/HomeHeader';

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };
const CARD_GAP = 16; // matches mb-4 on FeedVideoCard

export default function HomeScreen(_: TabScreenProps<'Home'>) {
  const isFocused = useIsFocused();
  const width = useAppWidth();
  // 4:5 portrait card, but never taller than the visible feed area: one swipe = one whole card,
  // CTA included (on short phones the bottom of a 4:5 card would sit under the tab bar).
  const [feedHeight, setFeedHeight] = useState(0);
  const ideal = Math.round((width - 32) * 1.25);
  const cardHeight = feedHeight > 0 ? Math.max(360, Math.min(ideal, feedHeight - CARD_GAP - 8)) : ideal;

  // Shallow selector: the feed re-renders only when these fields change (not on unrelated store updates).
  const {
    items, status, selectedCategory, likedIds, followedTeachers, loadingMore, social, socialNotice,
    load, loadMore, setCategory, toggleLike, likeVideo, shareVideo, clearSocialNotice, toggleFollow,
  } = useFeedStore(
    useShallow((s) => ({
      items: s.items, status: s.status, selectedCategory: s.selectedCategory, likedIds: s.likedIds, followedTeachers: s.followedTeachers,
      loadingMore: s.loadingMore, social: s.social, socialNotice: s.socialNotice, load: s.load, loadMore: s.loadMore, setCategory: s.setCategory,
      toggleLike: s.toggleLike, likeVideo: s.likeVideo, shareVideo: s.shareVideo, clearSocialNotice: s.clearSocialNotice, toggleFollow: s.toggleFollow,
    })),
  );
  const policy = useMediaPolicy();
  // Locked phone / other app / hidden tab → nothing plays or buffers.
  const appActive = useAppActive();
  const likedSet = useMemo(() => new Set(likedIds), [likedIds]);
  const followedSet = useMemo(() => new Set(followedTeachers), [followedTeachers]);
  const onCta = useCtaHandler();
  const navigation = useNavigation();
  const isStaff = useStaffStore((s) => s.isStaff);

  const onShare = useCallback(
    async (item: FeedItem) => {
      const url = buildShareUrl(item.shareSlug);
      await shareText(feedShareMessage({ title: item.title, teacherName: item.teacherName, courseLabel: CATEGORY_LABELS[item.category], url }));
      shareVideo(item.id);
    },
    [shareVideo],
  );
  const onDoubleTapLike = useCallback((id: string) => likeVideo(id, 'like'), [likeVideo]);
  const [commentsFor, setCommentsFor] = useState<FeedItem | null>(null);
  // A failed ♥ rolled back: say so briefly.
  useEffect(() => {
    if (!socialNotice) return undefined;
    const t = setTimeout(clearSocialNotice, 3500);
    return () => clearTimeout(t);
  }, [socialNotice, clearSocialNotice]);

  /** Hidden admin entry: long-press the TH EDU logo (teachers / staff sign in at /quan-ly/dang-nhap). */
  const openStaffArea = useCallback(() => {
    const { isStaff, isAdmin } = useStaffStore.getState();
    navigation.navigate(isStaff && isAdmin ? 'AdminHome' : 'AdminLogin');
  }, [navigation]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true); // autoplay muted, parent opts in to sound
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const unread = useNotificationStore(selectUnreadCount);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [playing, setPlaying] = useState<FeedItem | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const savedCount = useBookmarkStore((s) => s.saved.length);
  const refreshBookings = useMyBookingsStore((s) => s.refresh);
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

  // Autoplay whichever card is most on-screen. Must be a stable ref for FlatList; the state update is a
  // single cheap setState (no work in the scroll path — prefetching happens in an effect below).
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable)?.key ?? null;
    setActiveId((cur) => (cur === first ? cur : first));
  }).current;

  // The card after the active one (warmed on fast Wi-Fi) + poster prefetch ahead of the scroll.
  const activeIndex = useMemo(() => visible.findIndex((v) => v.id === activeId), [visible, activeId]);
  const nextId = activeIndex >= 0 ? visible[activeIndex + 1]?.id ?? null : null;
  useEffect(() => {
    if (!policy.posterLookahead) return;
    const from = Math.max(0, activeIndex);
    const ahead = visible.slice(from, from + 1 + policy.posterLookahead);
    prefetchImages(ahead.flatMap((v) => [v.thumbnailUrl, v.teacherAvatar]));
  }, [visible, activeIndex, policy.posterLookahead]);

  // Dashboard funnel: a video counts as "viewed" after 3 s on screen (once per session; staff excluded).
  useEffect(() => {
    if (!isFocused || !activeId) return undefined;
    const t = setTimeout(() => {
      if (!useStaffStore.getState().isStaff) trackEvent('VIDEO_VIEW', activeId);
    }, 3000);
    // CLB Phụ huynh: a video counts toward "Đồng Hành Cùng Con" after VIDEO_WATCH_MS on screen.
    const w = setTimeout(() => useParentClubStore.getState().markVideoWatched(activeId), VIDEO_WATCH_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(w);
    };
  }, [isFocused, activeId]);

  // Daily tip above the feed (hidden while searching, or when the parent hid it today).
  const sparkHidden = useSparkHiddenToday();
  const showSpark = !sparkHidden && !query;
  const [sparkHeight, setSparkHeight] = useState(0);
  const headerHeight = showSpark || savedCount > 0 ? sparkHeight : 0;
  const step = cardHeight + CARD_GAP;
  const snapOffsets = useMemo(
    () => (headerHeight ? [0, ...visible.map((_, i) => headerHeight + i * step)] : undefined),
    [headerHeight, visible, step],
  );
  const openNotificationLink = useCallback(
    (link: NotificationLink) => {
      if (link === 'MANAGE_BOOKINGS') navigation.navigate('ManageBookings');
      else if (link === 'BOOKING') navigation.navigate('MainTabs', { screen: 'Booking' });
      else useParentClubStore.getState().openSheet();
    },
    [navigation],
  );
  // Status changes from the centre (confirmed / cancelled) + appointment reminders → notifications.
  useEffect(() => {
    if (isFocused) refreshBookings();
  }, [isFocused, refreshBookings]);
  const clubDone = useParentClubStore((s) => BADGES.filter((b) => !!s.unlockedAt[b.id]).length);
  const openClub = useParentClubStore((s) => s.openSheet);

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
        active={isFocused && appActive && activeId === item.id}
        warm={isFocused && appActive && policy.warmNextVideo && nextId === item.id}
        autoplay={policy.autoplay}
        preferLowRes={policy.preferLowRes}
        muted={muted}
        liked={likedSet.has(item.id)}
        counts={social[item.id]}
        following={followedSet.has(item.teacherName)}
        onToggleMute={toggleMute}
        onLike={toggleLike}
        onDoubleTapLike={onDoubleTapLike}
        onComments={setCommentsFor}
        onFollow={toggleFollow}
        onCta={onCta}
        onShare={onShare}
        onExpand={setPlaying}
      />
    ),
    [cardHeight, isFocused, appActive, activeId, nextId, policy.warmNextVideo, policy.autoplay, policy.preferLowRes, muted, likedSet, social, followedSet, toggleMute, toggleLike, onDoubleTapLike, toggleFollow, onCta, onShare],
  );

  return (
    <View className="flex-1 bg-surface">
      <HomeHeader
        unreadCount={unread}
        onNotificationsPress={() => setNotificationsOpen(true)}
        searchOpen={searchOpen}
        onToggleSearch={toggleSearch}
        query={query}
        onQueryChange={setQuery}
        onBrandLongPress={openStaffArea}
        club={{ done: clubDone, total: BADGES.length }}
        onClubPress={openClub}
        onParentPress={() => navigation.navigate('ParentPortal')}
      />
      <View>
        <CategoryChips options={FEED_FILTERS} value={selectedCategory} onChange={onChangeCategory} />
        {/* Real, anonymised recent bookings — renders nothing if there are none. */}
        <TrustTicker active={isFocused && appActive} />
        {policy.dataSaver && (
          <Pressable
            onPress={() => navigation.navigate('DataSettings')}
            accessibilityRole="button"
            testID="data-saver-banner"
            className="mx-4 mb-2 min-h-11 flex-row items-center gap-2 rounded-2xl bg-white px-3.5 active:bg-slate-50"
          >
            <WifiOff size={16} color={COLORS.brand} />
            <Text className="flex-1 text-[13px] text-ink">
              <Text className="font-bold">{policy.label}</Text> · chạm video để xem
            </Text>
            <Text className="text-xs font-semibold text-brand-600">Cài đặt ›</Text>
          </Pressable>
        )}
      </View>

      {status === 'loading' && items.length === 0 ? (
        // Same size as the real cards → no layout shift when the feed arrives.
        <View className="pt-1" testID="feed-skeleton">
          <FeedCardSkeleton height={cardHeight} />
          <FeedCardSkeleton height={cardHeight} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          onLayout={(e) => setFeedHeight(Math.round(e.nativeEvent.layout.height))}
          data={visible}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          extraData={renderItem}
          ListHeaderComponent={
            showSpark || savedCount > 0 ? (
              <View onLayout={(e) => setSparkHeight(Math.round(e.nativeEvent.layout.height))}>
                {showSpark && <DailySparkCard />}
                {savedCount > 0 && (
                  <Pressable
                    onPress={() => setSavedOpen(true)}
                    accessibilityRole="button"
                    testID="saved-videos-link"
                    className="mx-4 mb-4 flex-row items-center gap-2 rounded-2xl bg-white px-4 py-3 active:bg-slate-50"
                  >
                    <BookmarkCheck size={18} color={COLORS.brand} />
                    <Text className="flex-1 text-[14px] font-bold text-ink">Video đã lưu ({savedCount})</Text>
                    <Text className="text-xs font-semibold text-brand-600">Xem ›</Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
          getItemLayout={(_d, index) => ({
            length: step,
            offset: headerHeight + step * index,
            index,
          })}
          {...(snapOffsets ? { snapToOffsets: snapOffsets } : { snapToInterval: step })}
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

      <VideoPlayerModal
        item={playing}
        onClose={() => setPlaying(null)}
        onBook={(item) => {
          setPlaying(null);
          navigation.navigate('MainTabs', { screen: 'Booking', params: { course: item.category, source: 'FEED', sourceRef: item.id } });
        }}
      />
      <SavedVideosSheet
        visible={savedOpen}
        onClose={() => setSavedOpen(false)}
        onPlay={(v) => {
          setSavedOpen(false);
          setPlaying(v);
        }}
      />
      <VideoCommentsSheet
        item={commentsFor}
        onClose={() => setCommentsFor(null)}
        onSignIn={() => {
          setCommentsFor(null);
          navigation.navigate('ParentAuth');
        }}
      />
      {!!socialNotice && (
        <View pointerEvents="none" className="absolute left-4 right-4 top-28 items-center" testID="social-notice">
          <Text className="rounded-2xl bg-ink/90 px-4 py-2.5 text-center text-[13px] font-semibold text-white">{socialNotice}</Text>
        </View>
      )}
      <NotificationCenter
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={openNotificationLink}
        onOpenSettings={() => {
          setNotificationsOpen(false);
          navigation.navigate('Settings');
        }}
      />

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
