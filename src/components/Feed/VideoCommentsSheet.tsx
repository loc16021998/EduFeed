import { BadgeCheck, CornerDownRight, Eye, EyeOff, Send, X } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hasSupabase } from '@/config/env';
import {
  COMMENT_MAX,
  fetchComments,
  getGuestName,
  GUEST_NAME_MAX,
  guestNameProblem,
  postComment,
  ROLE_BADGE,
  saveGuestName,
  setCommentHidden,
  setDemoViewer,
  timeAgo,
  type VideoComment,
} from '@/services/videoSocial';
import { useFeedStore, useParentStore, useStaffStore } from '@/store';
import type { FeedItem } from '@/types';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

/** One-tap questions for busy parents (fills the box; the parent can edit before sending). */
export const QUICK_QUESTIONS = ['Học phí khóa này thế nào ạ?', 'Cơ sở Xa La còn lịch học thử không cô?', 'Cơ sở Ngô Thì Nhậm học giờ nào ạ?', 'Bé 5 tuổi học được chưa ạ?'];

const msg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Không gửi được, ba mẹ thử lại nhé.');
const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

interface Props {
  item: FeedItem | null;
  onClose: () => void;
  /** Guests: 1-tap sign-in (parent OTP). */
  onSignIn?: () => void;
}

/**
 * Comments for one EduFeed video, in a slide-up sheet. Parents / guests ask; teachers & admins answer with a
 * verified badge, reply in threads and hide inappropriate comments. Sending is optimistic (shows instantly,
 * rolls back with the text restored if it fails). Refreshes every 20 s while open.
 */
function VideoCommentsSheet({ item, onClose, onSignIn }: Props) {
  const insets = useSafeAreaInsets();
  const visible = !!item;
  const videoId = item?.id ?? '';
  const isStaff = useStaffStore((s) => s.status === 'signedIn' && s.isStaff);
  const isAdmin = useStaffStore((s) => s.isAdmin);
  const isParent = useParentStore((s) => s.status === 'signedIn');
  const count = useFeedStore((s) => (videoId ? s.social[videoId]?.comments : 0) ?? 0);
  const { setCommentsCount, bumpComments } = useFeedStore.getState();

  const [items, setItems] = useState<VideoComment[] | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [guestName, setGuestName] = useState('');
  const [replyTo, setReplyTo] = useState<VideoComment | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<TextInput>(null);
  const isGuest = !isStaff && !isParent;

  // Demo backend needs to know who is "signed in".
  useEffect(() => {
    if (!hasSupabase) setDemoViewer({ staff: isStaff, parent: isParent });
  }, [isStaff, isParent]);

  useEffect(() => {
    getGuestName().then(setGuestName);
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!videoId) return;
      if (!quiet) setLoadError(null);
      try {
        const page = await fetchComments(videoId);
        setItems((cur) => {
          // Keep optimistic rows still in flight on top.
          const pending = (cur ?? []).filter((c) => c.pending);
          return [...pending, ...page.items];
        });
        setCanModerate(page.canModerate);
        setCommentsCount(videoId, page.commentsCount);
      } catch (e) {
        if (!quiet) setLoadError(msg(e));
      }
    },
    [videoId, setCommentsCount],
  );

  useEffect(() => {
    if (!visible) return undefined;
    setItems(null);
    setReplyTo(null);
    setNotice(null);
    load();
    const t = setInterval(() => load(true), 20_000);
    return () => clearInterval(t);
  }, [visible, load]);

  const sheetY = useSharedValue(60);
  useEffect(() => {
    sheetY.value = visible ? withSpring(0, { damping: 18 }) : 60;
  }, [visible, sheetY]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    if (isGuest) {
      const p = guestNameProblem(guestName);
      if (p) return setNotice({ ok: false, text: p });
      saveGuestName(guestName);
    }
    const parentId = replyTo ? replyTo.parentId ?? replyTo.id : null;
    const temp: VideoComment = {
      id: `pending-${Date.now()}`,
      authorName: isStaff ? 'Bạn' : isParent ? 'Bạn' : guestName.trim(),
      authorRole: isStaff ? (isAdmin ? 'ADMIN' : 'TEACHER') : isParent ? 'PARENT' : 'GUEST',
      content,
      createdAt: new Date().toISOString(),
      isHidden: false,
      mine: true,
      parentId,
      replies: [],
      pending: true,
    };
    // Optimistic: shown + counted in the same frame.
    const prevItems = items;
    const prevReply = replyTo;
    setItems((cur) => (parentId ? (cur ?? []).map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, temp] } : c)) : [temp, ...(cur ?? [])]));
    bumpComments(videoId, 1);
    setText('');
    setReplyTo(null);
    setNotice(null);
    setSending(true);
    try {
      const { comment, commentsCount } = await postComment({ videoId, content, parentId, guestName: isGuest ? guestName : undefined });
      haptics.success();
      const real = { ...comment, mine: true, replies: [] };
      setItems((cur) =>
        (cur ?? []).map((c) => (c.id === temp.id ? real : parentId && c.id === parentId ? { ...c, replies: c.replies.map((r) => (r.id === temp.id ? { ...real, parentId } : r)) } : c)),
      );
      setCommentsCount(videoId, commentsCount);
    } catch (e) {
      // Roll back: remove the row, restore the count and the text so nothing typed is lost.
      setItems(prevItems);
      bumpComments(videoId, -1);
      setText(content);
      setReplyTo(prevReply);
      setNotice({ ok: false, text: msg(e) });
    } finally {
      setSending(false);
    }
  };

  const moderate = async (c: VideoComment) => {
    const hide = !c.isHidden;
    const flip = (list: VideoComment[]): VideoComment[] =>
      list.map((x) => (x.id === c.id ? { ...x, isHidden: hide, replies: x.replies.map((r) => ({ ...r, isHidden: hide })) } : { ...x, replies: x.replies.map((r) => (r.id === c.id ? { ...r, isHidden: hide } : r)) }));
    const prev = items;
    setItems((cur) => flip(cur ?? []));
    try {
      setCommentsCount(videoId, await setCommentHidden(c.id, hide, videoId));
    } catch (e) {
      setItems(prev);
      setNotice({ ok: false, text: msg(e) });
    }
  };

  const startReply = (c: VideoComment) => {
    setReplyTo(c);
    inputRef.current?.focus();
  };

  const renderComment = (c: VideoComment, reply = false) => {
    const badge = ROLE_BADGE[c.authorRole];
    const official = !!badge;
    return (
      <View key={c.id} className={`flex-row gap-2.5 ${reply ? 'ml-11 mt-2' : ''} ${c.isHidden ? 'opacity-50' : ''}`} testID={reply ? 'comment-reply' : 'comment'}>
        <View className={`items-center justify-center rounded-full ${reply ? 'h-8 w-8' : 'h-9 w-9'} ${official ? 'bg-leaf-500' : 'bg-brand-100'}`}>
          <Text className={`text-xs font-extrabold ${official ? 'text-white' : 'text-brand-700'}`}>{initials(c.authorName)}</Text>
        </View>
        <View className={`flex-1 gap-0.5 rounded-2xl px-3 py-2 ${official ? 'border border-leaf-500/40 bg-leaf-50' : 'bg-slate-100'}`}>
          <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Text className="text-[13px] font-bold text-ink" numberOfLines={1}>
              {c.authorName}
            </Text>
            {official && (
              <View className={`flex-row items-center gap-0.5 rounded-full px-1.5 py-0.5 ${c.authorRole === 'ADMIN' ? 'bg-amber-100' : 'bg-leaf-100'}`} testID="verified-badge">
                <BadgeCheck size={11} color={c.authorRole === 'ADMIN' ? '#B45309' : COLORS.leafDark} />
                <Text className={`text-[10px] font-extrabold ${c.authorRole === 'ADMIN' ? 'text-amber-800' : 'text-leaf-700'}`}>{badge}</Text>
              </View>
            )}
            <Text className="text-[11px] text-ink-subtle">{c.pending ? 'Đang gửi…' : timeAgo(c.createdAt)}</Text>
            {c.isHidden && <Text className="text-[11px] font-bold text-red-700">· Đã ẩn</Text>}
          </View>
          <Text className="text-[14px] leading-5 text-ink">{c.content}</Text>
          {canModerate && !c.pending && (
            <View className="mt-1 flex-row gap-4">
              {!c.isHidden && (
                <Pressable onPress={() => startReply(c)} hitSlop={10} accessibilityRole="button" className="min-h-8 flex-row items-center gap-1" testID="comment-reply-btn">
                  <CornerDownRight size={13} color={COLORS.brand} />
                  <Text className="text-xs font-bold text-brand-700">Trả lời</Text>
                </Pressable>
              )}
              <Pressable onPress={() => moderate(c)} hitSlop={10} accessibilityRole="button" className="min-h-8 flex-row items-center gap-1" testID="comment-hide-btn">
                {c.isHidden ? <Eye size={13} color={COLORS.muted} /> : <EyeOff size={13} color={COLORS.muted} />}
                <Text className="text-xs font-bold text-ink-muted">{c.isHidden ? 'Hiện lại' : 'Ẩn'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng bình luận" />
        <Animated.View style={[{ height: '78%' }, sheetStyle]} testID="comments-sheet">
          <View className="flex-1 rounded-t-[28px] bg-white" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
            <View className="items-center pt-2">
              <View className="h-1 w-10 rounded-full bg-slate-300" />
            </View>
            <View className="flex-row items-center px-5 pb-2 pt-2">
              <Text className="flex-1 text-[17px] font-extrabold text-ink" accessibilityRole="header" testID="comments-title">
                Bình luận ({count})
              </Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" testID="comments-close">
                <X size={22} color={COLORS.ink} />
              </Pressable>
            </View>

            <FlatList
              data={items ?? []}
              keyExtractor={(c) => c.id}
              className="flex-1"
              contentContainerClassName="gap-4 px-4 pb-3"
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }) => (
                <View>
                  {renderComment(c)}
                  {c.replies.map((r) => renderComment(r, true))}
                </View>
              )}
              ListEmptyComponent={
                items === null ? (
                  loadError ? (
                    <Pressable onPress={() => load()} className="items-center py-10" accessibilityRole="button">
                      <Text className="text-center text-[14px] text-red-700">{loadError}</Text>
                      <Text className="mt-1 text-[13px] font-bold text-brand-700">Thử lại</Text>
                    </Pressable>
                  ) : (
                    <ActivityIndicator className="py-10" color={COLORS.brand} />
                  )
                ) : (
                  <View className="items-center gap-1 py-10" testID="comments-empty">
                    <Text style={{ fontSize: 32 }}>💬</Text>
                    <Text className="text-[15px] font-bold text-ink">Chưa có bình luận</Text>
                    <Text className="text-center text-[13px] text-ink-muted">Ba mẹ hỏi thầy cô ngay bên dưới nhé!</Text>
                  </View>
                )
              }
            />

            {!!notice && (
              <Text className={`mx-4 mb-1 rounded-xl px-3 py-2 text-[13px] ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} testID="comments-notice">
                {notice.text}
              </Text>
            )}

            {/* Quick questions (not for staff) */}
            {!isStaff && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2 px-4 pb-2" testID="quick-questions">
                {QUICK_QUESTIONS.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => {
                      haptics.light();
                      setText(q);
                      inputRef.current?.focus();
                    }}
                    accessibilityRole="button"
                    className="min-h-10 justify-center rounded-full border border-brand-200 bg-brand-50 px-3.5 active:bg-brand-100"
                  >
                    <Text className="text-[13px] font-semibold text-brand-700">{q}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View className="gap-2 border-t border-slate-100 px-4 pt-2">
              {replyTo && (
                <View className="flex-row items-center gap-2 rounded-xl bg-leaf-50 px-3 py-1.5" testID="replying-to">
                  <CornerDownRight size={14} color={COLORS.leafDark} />
                  <Text className="flex-1 text-xs text-ink" numberOfLines={1}>
                    Trả lời <Text className="font-bold">{replyTo.authorName}</Text>
                  </Text>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Huỷ trả lời">
                    <X size={14} color={COLORS.muted} />
                  </Pressable>
                </View>
              )}
              {isGuest ? (
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={guestName}
                    onChangeText={setGuestName}
                    maxLength={GUEST_NAME_MAX}
                    placeholder="Tên hiển thị, VD: Mẹ bé Na"
                    placeholderTextColor={COLORS.subtle}
                    accessibilityLabel="Tên hiển thị"
                    className="h-10 flex-1 rounded-xl bg-slate-100 px-3 text-[14px] text-ink"
                    testID="guest-name"
                  />
                  {onSignIn && (
                    <Pressable onPress={onSignIn} accessibilityRole="button" className="h-10 justify-center rounded-xl px-2" testID="comments-sign-in">
                      <Text className="text-[13px] font-bold text-brand-700">Đăng nhập</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <Text className="text-[12px] text-ink-muted" testID="comment-identity">
                  {isStaff ? `Đăng với tư cách ${isAdmin ? 'Quản trị viên' : 'Giáo viên TH EDU'} ✓` : 'Bình luận bằng tài khoản phụ huynh (hiện tên "Mẹ/Bố + tên bé", không hiện số điện thoại)'}
                </Text>
              )}
              <View className="flex-row items-end gap-2">
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={setText}
                  maxLength={COMMENT_MAX}
                  multiline
                  placeholder={replyTo ? 'Viết câu trả lời…' : isStaff ? 'Viết bình luận…' : 'Hỏi thầy cô về khóa học…'}
                  placeholderTextColor={COLORS.subtle}
                  accessibilityLabel="Nội dung bình luận"
                  className="max-h-28 min-h-12 flex-1 rounded-2xl bg-slate-100 px-3.5 py-3 text-[15px] text-ink"
                  testID="comment-input"
                />
                <Pressable
                  onPress={send}
                  disabled={!text.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Gửi bình luận"
                  className={`h-12 w-12 items-center justify-center rounded-full ${text.trim() ? 'bg-brand-500 active:bg-brand-600' : 'bg-slate-200'}`}
                  testID="comment-send"
                >
                  <Send size={20} color={text.trim() ? '#fff' : COLORS.subtle} />
                </Pressable>
              </View>
              {text.length > COMMENT_MAX - 60 && (
                <Text className="self-end text-[11px] text-ink-subtle">
                  {text.length}/{COMMENT_MAX}
                </Text>
              )}
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default memo(VideoCommentsSheet);
