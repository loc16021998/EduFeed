import { useState } from 'react';
import { Image, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import Button from '@/components/Button';
import { SettingsSheet } from '@/components/Settings/SettingsSection';
import { StatusBanner } from '@/components/ux';
import { hasSupabase } from '@/config/env';
import { demoSetCommentHidden, fetchModerationComments, type CommentFilter, type ModerationComment } from '@/services/commandCenter';
import { listAdminPortfolios, setPortfolioPublished, type AdminPortfolioRow } from '@/services/portfolioAdmin';
import { listAdminVideos, setPublished } from '@/services/videoAdmin';
import { postComment, setCommentHidden, setDemoViewer, timeAgo } from '@/services/videoSocial';
import { useCommandCenterStore } from '@/store/useCommandCenterStore';
import type { AdminVideo } from '@/types';
import { CAMPUS_LABELS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

import { Chip, Empty, ErrorRow, errMsg, Grid, LoadingRows, ModuleCard, RowAction, useModuleData, useWide } from './ui';

const COMMENT_FILTERS: { id: CommentFilter; label: string }[] = [
  { id: 'QUESTIONS', label: 'Câu hỏi chưa trả lời' },
  { id: 'ALL', label: 'Tất cả' },
  { id: 'HIDDEN', label: 'Đã ẩn' },
];
const ROLE_LABEL = { PARENT: 'Phụ huynh', GUEST: 'Khách', TEACHER: 'Giáo viên', ADMIN: 'Quản trị' } as const;

export default function ContentModerationTab({ onEditVideo, onNewVideo, onNewPortfolio }: { onEditVideo: (id: string) => void; onNewVideo: () => void; onNewPortfolio: () => void }) {
  const wide = useWide();
  const branch = useCommandCenterStore((s) => s.branch);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const fail = (e: unknown) => setNotice({ ok: false, text: errMsg(e) });

  // ── Videos ──
  const videos = useModuleData(() => listAdminVideos(), []);
  const toggleVideo = async (v: AdminVideo, publish: boolean) => {
    videos.setData((d) => d && d.map((x) => (x.id === v.id ? { ...x, isPublished: publish } : x)));
    try {
      await setPublished(v, publish);
      haptics.light();
    } catch (e) {
      videos.setData((d) => d && d.map((x) => (x.id === v.id ? { ...x, isPublished: !publish } : x)));
      fail(e);
    }
  };

  // ── Before / After ──
  const portfolios = useModuleData(() => listAdminPortfolios(branch === 'ALL' ? null : branch), [branch]);
  const togglePortfolio = async (p: AdminPortfolioRow, publish: boolean) => {
    portfolios.setData((d) => d && d.map((x) => (x.id === p.id ? { ...x, isPublished: publish } : x)));
    try {
      await setPortfolioPublished(p, publish);
      haptics.light();
    } catch (e) {
      portfolios.setData((d) => d && d.map((x) => (x.id === p.id ? { ...x, isPublished: !publish } : x)));
      fail(e);
    }
  };

  // ── Comments ──
  const [filter, setFilter] = useState<CommentFilter>('QUESTIONS');
  const comments = useModuleData(() => fetchModerationComments(filter), [filter]);
  const [replyTo, setReplyTo] = useState<ModerationComment | null>(null);
  const hide = async (c: ModerationComment, hidden: boolean) => {
    comments.setData((d) => d && (filter === 'ALL' ? d.map((x) => (x.id === c.id ? { ...x, isHidden: hidden } : x)) : d.filter((x) => x.id !== c.id)));
    try {
      await setCommentHidden(c.id, hidden, c.videoId);
      if (!hasSupabase) demoSetCommentHidden(c.id, hidden);
      haptics.light();
    } catch (e) {
      comments.reload();
      fail(e);
    }
  };

  const published = (videos.data ?? []).filter((v) => v.isPublished).length;
  return (
    <View className="gap-3" testID="content-tab">
      {!!notice && <StatusBanner tone={notice.ok ? 'success' : 'error'} text={notice.text} onDismiss={() => setNotice(null)} testID="content-notice" />}

      <ModuleCard title="Bình luận EduFeed" subtitle="Trả lời câu hỏi của phụ huynh, ẩn nội dung không phù hợp" full testID="comments-card">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" accessibilityRole="tablist">
          {COMMENT_FILTERS.map((f) => (
            <Chip key={f.id} label={f.label} on={filter === f.id} onPress={() => setFilter(f.id)} testID={`comment-filter-${f.id}`} />
          ))}
        </ScrollView>
        {!comments.data ? (
          comments.loading ? <LoadingRows rows={2} /> : <ErrorRow text={comments.error ?? ''} onRetry={comments.reload} />
        ) : comments.data.length === 0 ? (
          <Empty text={filter === 'QUESTIONS' ? 'Không còn câu hỏi nào chờ trả lời. 👏' : 'Chưa có bình luận.'} />
        ) : (
          <View className={wide ? 'flex-row flex-wrap gap-2.5' : 'gap-2.5'}>
            {comments.data.map((c) => (
              <View key={c.id} className={`gap-1.5 rounded-2xl border p-3 ${c.isHidden ? 'border-slate-200 bg-slate-50' : 'border-slate-100'}`} style={wide ? { width: '49%' } : undefined} testID="comment-row">
                <Text className="text-[12px] text-ink-muted" numberOfLines={1}>
                  {c.videoTitle}
                </Text>
                <Text className={`text-[14px] leading-5 ${c.isHidden ? 'text-ink-subtle line-through' : 'text-ink'}`}>
                  <Text className="font-bold">{c.authorName}</Text> ({ROLE_LABEL[c.authorRole]}): {c.content}
                </Text>
                <Text className="text-[11px] text-ink-subtle">{timeAgo(c.createdAt)}{c.isReply ? ' · trả lời' : ''}</Text>
                <View className="flex-row gap-2">
                  {!c.isHidden && !c.isReply && <RowAction label="Trả lời" tone="primary" onPress={() => setReplyTo(c)} testID="comment-reply" />}
                  <RowAction label={c.isHidden ? 'Hiện lại' : 'Ẩn'} tone={c.isHidden ? 'default' : 'danger'} onPress={() => hide(c, !c.isHidden)} testID="comment-hide" />
                </View>
              </View>
            ))}
          </View>
        )}
      </ModuleCard>

      <Grid wide={wide}>
        <ModuleCard title={`Video EduFeed${videos.data ? ` (${published}/${videos.data.length} đang hiện)` : ''}`} action="Đăng video" onAction={onNewVideo} wide={wide} testID="videos-card">
          {!videos.data ? (
            videos.loading ? <LoadingRows rows={3} /> : <ErrorRow text={videos.error ?? ''} onRetry={videos.reload} />
          ) : videos.data.length === 0 ? (
            <Empty text="Chưa có video. Bấm Đăng video để bắt đầu." />
          ) : (
            videos.data.slice(0, 12).map((v) => (
              <View key={v.id} className="min-h-14 flex-row items-center gap-3 border-t border-slate-100 pt-2" testID="video-row">
                {!!v.thumbnailUrl && <Image source={{ uri: v.thumbnailUrl }} className="h-12 w-9 rounded-lg bg-slate-100" accessibilityIgnoresInvertColors />}
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-ink" numberOfLines={2}>
                    {v.title}
                  </Text>
                  <Text className="text-[12px] text-ink-muted">
                    {CATEGORY_LABELS[v.category]} · ♥ {v.likesCount ?? 0} · 💬 {v.commentsCount ?? 0} · {v.leadCount} lead
                  </Text>
                </View>
                <RowAction label="Sửa" onPress={() => onEditVideo(v.id)} testID="video-edit" />
                <Switch value={v.isPublished} onValueChange={(on) => toggleVideo(v, on)} trackColor={{ true: COLORS.brand, false: '#CBD5E1' }} thumbColor="#fff" accessibilityLabel={`Hiện video ${v.title}`} testID="video-toggle" />
              </View>
            ))
          )}
        </ModuleCard>

        <ModuleCard title="Before / After" subtitle="Chỉ hiện công khai khi phụ huynh đã đồng ý" action="Đăng bài mới" onAction={onNewPortfolio} wide={wide} testID="portfolios-card">
          {!portfolios.data ? (
            portfolios.loading ? <LoadingRows rows={3} /> : <ErrorRow text={portfolios.error ?? ''} onRetry={portfolios.reload} />
          ) : portfolios.data.length === 0 ? (
            <Empty text="Chưa có bài Before/After." />
          ) : (
            portfolios.data.slice(0, 12).map((p) => (
              <View key={p.id} className="min-h-14 flex-row items-center gap-3 border-t border-slate-100 pt-2" testID="portfolio-row">
                <Image source={{ uri: p.afterImageUrl }} className="h-11 w-11 rounded-lg bg-slate-100" accessibilityIgnoresInvertColors />
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-ink">{p.displayName}</Text>
                  <Text className="text-[12px] text-ink-muted">
                    {CATEGORY_LABELS[p.course]} · {CAMPUS_LABELS[p.campus]}
                    {p.parentConsent ? '' : ' · chưa có đồng ý'}
                  </Text>
                </View>
                <Switch value={p.isPublished} disabled={!p.parentConsent && !p.isPublished} onValueChange={(on) => togglePortfolio(p, on)} trackColor={{ true: COLORS.brand, false: '#CBD5E1' }} thumbColor="#fff" accessibilityLabel={`Hiện bài của ${p.displayName}`} testID="portfolio-toggle" />
              </View>
            ))
          )}
        </ModuleCard>
      </Grid>

      <ReplySheet
        comment={replyTo}
        onClose={() => setReplyTo(null)}
        onSent={(c) => {
          setReplyTo(null);
          if (filter === 'QUESTIONS') comments.setData((d) => d && d.filter((x) => x.id !== c.id));
          setNotice({ ok: true, text: `Đã trả lời ${c.authorName}. Câu trả lời hiện với huy hiệu Quản trị viên.` });
        }}
      />
    </View>
  );
}

function ReplySheet({ comment, onClose, onSent }: { comment: ModerationComment | null; onClose: () => void; onSent: (c: ModerationComment) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!comment) return;
    if (!text.trim()) return setError('Nhập nội dung trả lời');
    setBusy(true);
    setError(null);
    try {
      if (!hasSupabase) setDemoViewer({ staff: true, parent: false });
      await postComment({ videoId: comment.videoId, content: text, parentId: comment.id });
      haptics.success();
      setText('');
      onSent(comment);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSheet visible={!!comment} title="Trả lời bình luận" onClose={onClose} testID="reply-sheet">
      {comment && (
        <Text className="rounded-2xl bg-slate-50 p-3 text-[14px] leading-5 text-ink">
          <Text className="font-bold">{comment.authorName}:</Text> {comment.content}
        </Text>
      )}
      <TextInput value={text} onChangeText={setText} multiline maxLength={500} placeholder="VD: Dạ học phí khoá này là… Ba mẹ đặt lịch học thử miễn phí ngay dưới video nhé!" placeholderTextColor={COLORS.subtle} accessibilityLabel="Nội dung trả lời" className="min-h-[96px] rounded-2xl border border-slate-200 px-4 py-3 text-[15px] text-ink" style={{ textAlignVertical: 'top' }} testID="reply-text" />
      {!!error && <StatusBanner tone="error" text={error} />}
      <Button title="Gửi trả lời" size="lg" loading={busy} onPress={send} testID="reply-send" />
    </SettingsSheet>
  );
}
