import { BadgeCheck, Flag, Send, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addComment, fetchComments, moderate, reportContent, type CommunityComment, type CommunityPost } from '@/services/community';
import { timeAgo } from '@/services/engagement';
import { COLORS } from '@/utils/constants';
import { confirmAsync } from '@/utils/platform';

/** Full post + comment thread; teachers' answers carry the "Giáo viên TH EDU" badge and are pinned on top. */
export default function PostDetail({ post, moderator, onClose, onCommented }: { post: CommunityPost | null; moderator: boolean; onClose: () => void; onCommented: (expert: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CommunityComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    setText('');
    setNote(null);
    if (post) fetchComments(post.id).then(setItems, (e) => { setItems([]); setNote(e instanceof Error ? e.message : 'Không tải được bình luận'); });
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post) return null;

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const c = await addComment(post.id, text);
      setItems((cur) => [...(cur ?? []), c].sort((a, b) => Number(b.isExpert) - Number(a.isExpert)));
      setText('');
      onCommented(c.isExpert);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Chưa gửi được');
    } finally {
      setBusy(false);
    }
  };

  const report = async (c: CommunityComment) => {
    if (!(await confirmAsync('Báo cáo bình luận này?', 'Trung tâm sẽ xem lại. Bình luận bị 3 người báo cáo sẽ tạm ẩn.'))) return;
    await reportContent({ commentId: c.id }).then(() => setNote('Đã gửi báo cáo. Cảm ơn ba mẹ!'), (e) => setNote(e.message));
  };
  const hide = async (c: CommunityComment, hidden: boolean) => {
    await moderate({ commentId: c.id }, hidden).then(
      () => setItems((cur) => (cur ?? []).map((x) => (x.id === c.id ? { ...x, status: hidden ? ('HIDDEN' as const) : ('VISIBLE' as const) } : x)).filter((x) => moderator || x.status === 'VISIBLE')),
      (e) => setNote(e.message),
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-surface">
        <View className="flex-row items-center gap-2 border-b border-slate-100 bg-white px-4 pb-3" style={{ paddingTop: insets.top + 10 }}>
          <Text className="flex-1 text-[16px] font-bold text-ink">Bình luận</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100">
            <X size={20} color={COLORS.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="gap-3 p-4" testID="post-detail">
          <View className="gap-1 rounded-3xl bg-white p-4">
            <Text className="text-[13px] font-bold text-ink">{post.authorName}</Text>
            <Text className="text-[14px] leading-[21px] text-ink">{post.body}</Text>
          </View>
          {items === null ? (
            <ActivityIndicator color={COLORS.brand} />
          ) : items.length === 0 ? (
            <Text className="text-center text-[13px] text-ink-muted">Chưa có bình luận. Ba mẹ là người đầu tiên nhé!</Text>
          ) : (
            items.map((c) => (
              <View key={c.id} className={`gap-1 rounded-2xl p-3 ${c.isExpert ? 'border border-emerald-200 bg-emerald-50' : 'bg-white'} ${c.status === 'HIDDEN' ? 'opacity-50' : ''}`} testID="comment">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-[13px] font-bold text-ink">{c.authorName}</Text>
                  {c.isExpert && (
                    <View className="flex-row items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5" testID="expert-badge">
                      <BadgeCheck size={11} color="#fff" />
                      <Text className="text-[10px] font-bold text-white">Giáo viên TH EDU</Text>
                    </View>
                  )}
                  <Text className="flex-1 text-[11px] text-ink-subtle">· {timeAgo(c.createdAt)}</Text>
                  {!c.mine && !moderator && (
                    <Pressable onPress={() => report(c)} accessibilityRole="button" accessibilityLabel="Báo cáo bình luận" hitSlop={8} className="h-8 w-8 items-center justify-center">
                      <Flag size={13} color={COLORS.subtle} />
                    </Pressable>
                  )}
                  {(moderator || c.mine) && (
                    <Pressable onPress={() => hide(c, c.status === 'VISIBLE')} accessibilityRole="button" hitSlop={6} className="h-8 justify-center px-1">
                      <Text className="text-[11px] font-semibold text-ink-muted">{c.status === 'VISIBLE' ? (c.mine && !moderator ? 'Xoá' : 'Ẩn') : 'Hiện lại'}</Text>
                    </Pressable>
                  )}
                </View>
                <Text className="text-[14px] leading-5 text-ink">{c.body}</Text>
              </View>
            ))
          )}
          {!!note && <Text className="text-center text-xs text-ink-muted">{note}</Text>}
        </ScrollView>
        {post.status === 'VISIBLE' && (
          <View className="flex-row items-center gap-2 border-t border-slate-100 bg-white px-4 pt-2" style={{ paddingBottom: insets.bottom + 10 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Viết bình luận…"
              placeholderTextColor={COLORS.subtle}
              maxLength={1000}
              accessibilityLabel="Viết bình luận"
              className="h-11 flex-1 rounded-full border border-slate-200 px-4 text-[14px] text-ink"
              onSubmitEditing={send}
              returnKeyType="send"
              testID="comment-input"
            />
            <Pressable onPress={send} disabled={!text.trim() || busy} accessibilityRole="button" accessibilityLabel="Gửi bình luận" className={`h-11 w-11 items-center justify-center rounded-full ${text.trim() ? 'bg-brand-500' : 'bg-slate-200'}`}>
              <Send size={16} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
