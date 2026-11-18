import { BadgeCheck, EyeOff, Flag, Heart, MessageCircle, PenLine, ShieldCheck } from 'lucide-react-native';
import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader } from '@/components';
import ImageZoomModal from '@/components/ImageZoomModal';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import {
  fetchCommunityFeed,
  isCommunityModerator,
  kindInfo,
  moderate,
  POST_KINDS,
  reportContent,
  setCommunityDemoViewer,
  toggleLike,
  type CommunityPost,
  type PostKind,
} from '@/services/community';
import { timeAgo } from '@/services/engagement';
import { useParentStore, useStaffStore } from '@/store';
import type { CampusLocation } from '@/types';
import { CAMPUS_LABELS, COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';
import { confirmAsync } from '@/utils/platform';

import PostComposer from './components/PostComposer';
import PostDetail from './components/PostDetail';

const CAMPUS_SHORT: Record<CampusLocation, string> = { XA_LA: 'Xa La', NGO_THI_NHAM: 'Ngô Thì Nhậm' };

/** "Cộng đồng TH EDU" — route /cong-dong. Verified parents + staff; admins / managers moderate. */
export default function ParentCommunityScreen({ navigation }: RootStackScreenProps<'Community'>) {
  const insets = useSafeAreaInsets();
  const parentStatus = useParentStore((s) => s.status);
  const parentName = useParentStore((s) => s.portal?.parent.fullName);
  const staff = useStaffStore();
  const [kind, setKind] = useState<PostKind | null>(null);
  const [campus, setCampus] = useState<CampusLocation | null>(null);
  const [items, setItems] = useState<CommunityPost[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [moderator, setModerator] = useState(false);

  const isParent = parentStatus === 'signedIn';
  const isStaff = staff.status === 'signedIn' && staff.isStaff;
  const decided = parentStatus !== 'unknown' && staff.status !== 'unknown';

  useEffect(() => {
    if (decided && !isParent && !isStaff) navigation.replace('ParentAuth');
  }, [decided, isParent, isStaff, navigation]);

  useEffect(() => {
    // Demo: a staff sign-in wins (on a real device only one Supabase session exists at a time).
    if (!hasSupabase) setCommunityDemoViewer(isStaff ? { name: staff.isAdmin ? 'Quản trị (mẫu)' : 'Cô Hường (mẫu)', staff: true, moderator: staff.isAdmin } : { name: parentName ?? 'Mẹ An (mẫu)', staff: false, moderator: false });
    if (isParent || isStaff) isCommunityModerator().then(setModerator);
  }, [isParent, isStaff, parentName, staff.isAdmin]);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchCommunityFeed({ kind, campus, before });
        setItems((cur) => (before ? [...(cur ?? []), ...page] : page));
        setMore(page.length >= 20);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không tải được bài viết');
        if (!before) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [kind, campus],
  );
  useEffect(() => {
    if (isParent || isStaff) load();
  }, [load, isParent, isStaff]);

  const patch = (id: string, p: Partial<CommunityPost>) => setItems((cur) => cur?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null);

  const like = async (post: CommunityPost) => {
    haptics.light();
    patch(post.id, { liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) });
    try {
      const r = await toggleLike(post.id);
      patch(post.id, { liked: r.on, likes: r.likes });
    } catch {
      patch(post.id, { liked: post.liked, likes: post.likes });
    }
  };
  const report = async (post: CommunityPost) => {
    if (!(await confirmAsync('Báo cáo bài viết?', 'Trung tâm sẽ xem lại. Bài bị 3 thành viên báo cáo sẽ tạm ẩn.', 'Báo cáo'))) return;
    reportContent({ postId: post.id }).then(() => setNotice('Đã gửi báo cáo. Cảm ơn ba mẹ!'), (e) => setNotice(e.message));
  };
  const hide = async (post: CommunityPost, hidden: boolean) => {
    if (hidden && post.mine && !moderator && !(await confirmAsync('Xoá bài viết?', 'Bài sẽ không còn hiển thị với mọi người.', 'Xoá'))) return;
    moderate({ postId: post.id }, hidden).then(
      () => patch(post.id, { status: hidden ? 'HIDDEN' : 'VISIBLE', hiddenReason: hidden ? (moderator ? 'STAFF' : 'AUTHOR') : null, reports: hidden ? post.reports : 0 }),
      (e) => setNotice(e.message),
    );
  };

  const open = items?.find((x) => x.id === openId) ?? null;

  const header = (
    <View className="gap-3 pb-1">
      <View className="flex-row items-start gap-2 rounded-2xl bg-brand-50 p-3">
        <ShieldCheck size={16} color={COLORS.brand} style={{ marginTop: 1 }} />
        <Text className="flex-1 text-xs leading-[18px] text-brand-800">
          Cộng đồng riêng của phụ huynh TH EDU hai cơ sở Xa La & Ngô Thì Nhậm. Câu hỏi được thầy cô trả lời có dấu <Text className="font-bold">Giáo viên TH EDU</Text>.
        </Text>
      </View>
      {!hasSupabase && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: các bài viết bên dưới chỉ để minh họa.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Tất cả" on={!kind} onPress={() => setKind(null)} />
        {POST_KINDS.map((k) => (
          <Chip key={k.kind} label={`${k.emoji} ${k.label}`} on={kind === k.kind} onPress={() => setKind(k.kind)} />
        ))}
      </ScrollView>
      <View className="flex-row gap-2">
        <Chip small label="Mọi cơ sở" on={!campus} onPress={() => setCampus(null)} />
        {(Object.keys(CAMPUS_SHORT) as CampusLocation[]).map((c) => (
          <Chip small key={c} label={CAMPUS_SHORT[c]} on={campus === c} onPress={() => setCampus(c)} />
        ))}
      </View>
      {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-800">{notice}</Text>}
      {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{error}</Text>}
      {items === null && <ActivityIndicator color={COLORS.brand} style={{ marginTop: 24 }} />}
      {items?.length === 0 && !error && <Text className="rounded-3xl bg-white p-6 text-center text-[13px] leading-5 text-ink-muted">Chưa có bài viết nào ở mục này. Ba mẹ mở đầu câu chuyện nhé!</Text>}
    </View>
  );

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Cộng đồng TH EDU" onBack={() => (navigation.canGoBack() ? navigation.goBack() : isParent ? navigation.navigate('ParentPortal') : navigation.navigate('MainTabs', { screen: 'Home' }))} />
      <FlatList
        data={items ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 96, gap: 12 }}
        renderItem={({ item }) => (
          <PostCard post={item} moderator={moderator} onLike={() => like(item)} onOpen={() => setOpenId(item.id)} onZoom={() => setZoom(item.photoUrl)} onReport={() => report(item)} onHide={(h) => hide(item, h)} />
        )}
        ListFooterComponent={more ? <Button title="Xem thêm" variant="ghost" size="sm" loading={loading} onPress={() => items?.length && load(items[items.length - 1].createdAt)} /> : null}
        refreshControl={<RefreshControl refreshing={loading && !!items?.length} onRefresh={() => load()} tintColor={COLORS.brand} />}
        initialNumToRender={6}
        windowSize={7}
        testID="community-feed"
      />
      <Pressable
        onPress={() => {
          haptics.light();
          setComposer(true);
        }}
        accessibilityRole="button"
        className="absolute right-4 h-14 flex-row items-center gap-2 rounded-full bg-accent-500 px-5 shadow-lg active:bg-accent-600"
        style={{ bottom: insets.bottom + 20 }}
        testID="open-composer"
      >
        <PenLine size={18} color="#fff" />
        <Text className="text-[15px] font-bold text-white">Viết bài</Text>
      </Pressable>

      <PostComposer
        visible={composer}
        onClose={() => setComposer(false)}
        onPosted={() => {
          setComposer(false);
          setNotice('Đã đăng bài. Cảm ơn ba mẹ đã chia sẻ!');
          load();
        }}
      />
      <PostDetail
        post={open}
        moderator={moderator}
        onClose={() => setOpenId(null)}
        onCommented={(expert) => open && patch(open.id, { comments: open.comments + 1, expertAnswered: open.expertAnswered || expert })}
      />
      <ImageZoomModal urls={zoom ? [zoom] : []} index={zoom ? 0 : null} onClose={() => setZoom(null)} />
    </View>
  );
}

function Chip({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={on}
      accessibilityState={{ selected: on }}
      className={`${small ? 'h-8 px-3' : 'h-10 px-3.5'} justify-center rounded-full border ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'}`}
    >
      <Text className={`${small ? 'text-xs' : 'text-[13px]'} font-semibold ${on ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

const PostCard = memo(function PostCard({
  post, moderator, onLike, onOpen, onZoom, onReport, onHide,
}: { post: CommunityPost; moderator: boolean; onLike: () => void; onOpen: () => void; onZoom: () => void; onReport: () => void; onHide: (hidden: boolean) => void }) {
  const k = kindInfo(post.kind);
  const hidden = post.status === 'HIDDEN';
  return (
    <View className={`gap-2.5 rounded-3xl bg-white p-4 ${hidden ? 'opacity-60' : ''}`} testID="post-card">
      <View className="flex-row items-center gap-2.5">
        <View className={`h-10 w-10 items-center justify-center rounded-full ${post.authorIsStaff ? 'bg-emerald-100' : 'bg-brand-50'}`}>
          <Text className={`text-[13px] font-extrabold ${post.authorIsStaff ? 'text-emerald-700' : 'text-brand-700'}`}>
            {post.authorName.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(-1)[0]?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[14px] font-bold text-ink" numberOfLines={1}>
              {post.authorName}
            </Text>
            {post.authorIsStaff && <BadgeCheck size={14} color="#059669" />}
          </View>
          <Text className="text-xs text-ink-muted">
            {post.campus ? `${CAMPUS_LABELS[post.campus]} · ` : ''}
            {timeAgo(post.createdAt)}
          </Text>
        </View>
        <Text className="overflow-hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-ink">
          {k.emoji} {k.label}
        </Text>
      </View>

      {hidden && (
        <View className="flex-row items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5">
          <EyeOff size={13} color="#B45309" />
          <Text className="text-[11px] font-semibold text-amber-800">
            {post.hiddenReason === 'REPORTED' ? 'Tạm ẩn do bị báo cáo — chờ trung tâm xem lại' : post.hiddenReason === 'AUTHOR' ? 'Bạn đã xoá bài này' : 'Đã ẩn bởi trung tâm'}
          </Text>
        </View>
      )}
      {moderator && post.reports > 0 && <Text className="text-[11px] font-bold text-red-600">⚠️ {post.reports} báo cáo chưa xử lý</Text>}

      <Text className="text-[14px] leading-[21px] text-ink">{post.body}</Text>
      {!!post.photoUrl && (
        <Pressable onPress={onZoom} accessibilityRole="imagebutton" accessibilityLabel="Xem ảnh" className="overflow-hidden rounded-2xl bg-slate-100" style={{ aspectRatio: 4 / 3 }}>
          <Image source={{ uri: post.photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </Pressable>
      )}
      {post.expertAnswered && (
        <View className="flex-row items-center gap-1.5 self-start rounded-full bg-emerald-50 px-2.5 py-1" testID="expert-answered">
          <BadgeCheck size={13} color="#059669" />
          <Text className="text-[11px] font-bold text-emerald-700">Giáo viên TH EDU đã trả lời</Text>
        </View>
      )}

      <View className="flex-row items-center gap-2 border-t border-slate-100 pt-2">
        <Pressable onPress={onLike} disabled={hidden} accessibilityRole="button" accessibilityState={{ selected: post.liked }} aria-pressed={post.liked} className={`h-10 flex-row items-center gap-1.5 rounded-full px-3.5 ${post.liked ? 'bg-pink-50' : 'active:bg-slate-100'}`} testID="post-like">
          <Heart size={16} color={post.liked ? '#DB2777' : COLORS.ink} fill={post.liked ? '#DB2777' : 'transparent'} />
          <Text className={`text-[13px] font-bold ${post.liked ? 'text-pink-600' : 'text-ink'}`}>{post.likes > 0 ? post.likes : 'Thích'}</Text>
        </Pressable>
        <Pressable onPress={onOpen} accessibilityRole="button" className="h-10 flex-row items-center gap-1.5 rounded-full px-3.5 active:bg-slate-100" testID="post-comments">
          <MessageCircle size={16} color={COLORS.ink} />
          <Text className="text-[13px] font-bold text-ink">{post.comments > 0 ? `${post.comments} bình luận` : 'Bình luận'}</Text>
        </Pressable>
        <View className="flex-1" />
        {moderator ? (
          <Pressable onPress={() => onHide(!hidden)} accessibilityRole="button" className="h-10 justify-center rounded-full px-3 active:bg-slate-100" testID="post-moderate">
            <Text className="text-[12px] font-bold text-ink-muted">{hidden ? 'Hiện lại' : 'Ẩn bài'}</Text>
          </Pressable>
        ) : post.mine ? (
          !hidden && (
            <Pressable onPress={() => onHide(true)} accessibilityRole="button" className="h-10 justify-center rounded-full px-3 active:bg-slate-100">
              <Text className="text-[12px] font-bold text-ink-muted">Xoá</Text>
            </Pressable>
          )
        ) : (
          <Pressable onPress={onReport} accessibilityRole="button" accessibilityLabel="Báo cáo bài viết" className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100">
            <Flag size={15} color={COLORS.subtle} />
          </Pressable>
        )}
      </View>
    </View>
  );
});
