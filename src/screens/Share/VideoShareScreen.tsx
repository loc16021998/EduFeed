import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, ScreenHeader, StickyCta } from '@/components';
import VideoCommentsSheet from '@/components/Feed/VideoCommentsSheet';
import type { RootStackScreenProps } from '@/navigation/types';
import FeedVideoCard from '@/screens/Home/components/FeedVideoCard';
import { trackEvent } from '@/services/analytics';
import { fetchVideoBySlug } from '@/services/videoAdmin';
import { buildShareUrl, feedShareMessage } from '@/services/media/shareLinks';
import { useFeedStore, useParentClubStore, useStaffStore } from '@/store';
import type { FeedItem } from '@/types';
import { CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { VIDEO_WATCH_MS } from '@/utils/parentClub';
import { shareText, useAppWidth } from '@/utils/platform';

/**
 * Landing page for a shared video link (https://<web>/v/<slug>, thedu://v/<slug>).
 * Parents arriving from Facebook / Zalo see the video and one clear booking button;
 * the booking is attributed to this video (source SHARE_LINK).
 */
export default function VideoShareScreen({ navigation, route }: RootStackScreenProps<'VideoShare'>) {
  const width = useAppWidth();
  const [video, setVideo] = useState<FeedItem | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [muted, setMuted] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const liked = useFeedStore((s) => !!video && s.likedIds.includes(video.id));
  const counts = useFeedStore((s) => (video ? s.social[video.id] : undefined));
  const { likeVideo, shareVideo, hydrateSocial } = useFeedStore.getState();

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchVideoBySlug(route.params.slug)
      .then((v) => {
        if (!alive) return;
        setVideo(v);
        setState(v ? 'ready' : 'missing');
        if (v) hydrateSocial([v.id]);
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [route.params.slug]);

  // Dashboard funnel: a video counts as "viewed" after 3 s on screen (once per session; staff excluded).
  useEffect(() => {
    if (state !== 'ready' || !video) return undefined;
    const t = setTimeout(() => {
      if (!useStaffStore.getState().isStaff) trackEvent('VIDEO_VIEW', video.id);
    }, 3000);
    const w = setTimeout(() => useParentClubStore.getState().markVideoWatched(video.id), VIDEO_WATCH_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(w);
    };
  }, [state, video]);

  const goHome = () => navigation.navigate('MainTabs', { screen: 'Home' });
  const book = () =>
    video &&
    navigation.navigate('MainTabs', {
      screen: 'Booking',
      params: { course: video.category, source: 'SHARE_LINK', sourceRef: video.id },
    });

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="TH EDU" onBack={() => (navigation.canGoBack() ? navigation.goBack() : goHome())} />

      {state === 'loading' && <ActivityIndicator className="mt-16" color={COLORS.brand} />}

      {(state === 'missing' || state === 'error') && (
        <View className="items-center gap-3 px-8 pt-16">
          <Text className="text-4xl">🎬</Text>
          <Text className="text-center text-[15px] font-bold text-ink">
            {state === 'missing' ? 'Video không còn hiển thị' : 'Không tải được video'}
          </Text>
          <Text className="text-center text-[13px] text-ink-muted">Ba mẹ xem các video khác của TH EDU nhé.</Text>
          <Button title="Xem video khác" onPress={goHome} />
        </View>
      )}

      {state === 'ready' && video && (
        <>
          <ScrollView contentContainerClassName="gap-3 pb-6 pt-2">
            <FeedVideoCard
              item={video}
              height={Math.round((width - 32) * 1.25)}
              active
              muted={muted}
              liked={liked}
              counts={counts}
              following={false}
              onToggleMute={() => setMuted((m) => !m)}
              onLike={(id) => likeVideo(id, 'toggle')}
              onDoubleTapLike={(id) => likeVideo(id, 'like')}
              onComments={() => setCommentsOpen(true)}
              onShare={async (v) => {
                await shareText(feedShareMessage({ title: v.title, teacherName: v.teacherName, courseLabel: CATEGORY_LABELS[v.category], url: buildShareUrl(v.shareSlug) }));
                shareVideo(v.id);
              }}
              onFollow={() => {}}
              onCta={book}
            />
            <Pressable onPress={goHome} className="items-center py-2" accessibilityRole="link">
              <Text className="text-[13px] font-semibold text-brand-600">Xem thêm video của TH EDU →</Text>
            </Pressable>
          </ScrollView>
          <StickyCta
            title={`🎁 Đăng ký học thử ${CATEGORY_LABELS[video.category]} miễn phí`}
            subtitle="Không ràng buộc · Trung tâm gọi xác nhận trong 24 giờ"
            onPress={book}
          />
        </>
      )}
      <VideoCommentsSheet
        item={commentsOpen ? video : null}
        onClose={() => setCommentsOpen(false)}
        onSignIn={() => {
          setCommentsOpen(false);
          navigation.navigate('ParentAuth');
        }}
      />
    </View>
  );
}
