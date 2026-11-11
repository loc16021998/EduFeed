/**
 * Staff video management: list (incl. drafts + lead counts), create/edit with upload,
 * publish/unpublish, delete, and public lookup by share slug.
 *
 * Supabase: rows in `videos` (RLS "staff manage videos"), files in Storage bucket `feed-media`
 * (staff-only write). Without Supabase: an in-memory demo store (mockVideoRepo).
 */
import { supabase } from '@/lib/supabase';
import type { AdminVideo, CourseCategory, FeedItem, PickedMedia, VideoDraft } from '@/types';
import type { Tables } from '@/types/database';
import { sleep, uuidv4 } from '@/utils/helpers';

import { removeMedia, uploadMedia } from './media/storageUpload';
import { mockVideoRepo } from './mockVideoRepo';

export type UploadProgress = { stage: 'video' | 'thumbnail' | 'saving'; fraction: number };

const ctaLinkFor = (course: CourseCategory) => `thedu://booking?course=${course}`;

const extOf = (m: PickedMedia, fallback: string) => {
  const fromName = m.name.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 4 && fromName !== m.name.toLowerCase()) return fromName;
  return m.type.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? fallback;
};

const toAdminVideo = (r: Tables<'videos'>, leadCount = 0): AdminVideo => ({
  id: r.id,
  title: r.title,
  videoUrl: r.video_url,
  thumbnailUrl: r.thumbnail_url,
  category: r.category_code as CourseCategory,
  teacherName: r.teacher_name,
  teacherAvatar: r.teacher_avatar_url ?? '',
  tags: r.tags ?? [],
  ctaText: r.cta_text,
  ctaLink: r.cta_link ?? ctaLinkFor(r.category_code as CourseCategory),
  shareSlug: r.share_slug,
  isPublished: r.is_published,
  publishedAt: r.published_at,
  createdAt: r.created_at,
  leadCount,
  videoPath: r.video_path,
  thumbnailPath: r.thumbnail_path,
});

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listAdminVideos(): Promise<AdminVideo[]> {
  if (!supabase) {
    await sleep(300);
    return mockVideoRepo.all();
  }
  const [{ data, error }, stats] = await Promise.all([
    supabase.from('videos').select('*').order('published_at', { ascending: false }).limit(200),
    supabase.rpc('staff_video_stats'),
  ]);
  if (error) throw error;
  const counts = new Map((stats.data ?? []).map((s) => [s.video_id, Number(s.lead_count)]));
  return (data ?? []).map((r) => toAdminVideo(r, counts.get(r.id) ?? 0));
}

/** Public: a published video by its share slug (for /v/<slug>). */
export async function fetchVideoBySlug(slug: string): Promise<FeedItem | null> {
  if (!supabase) {
    await sleep(300);
    return mockVideoRepo.bySlug(slug) ?? null;
  }
  const { data, error } = await supabase.from('videos').select('*').eq('share_slug', slug).maybeSingle();
  if (error) throw error;
  return data ? toAdminVideo(data) : null;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Create (no `existing`) or update a video. Uploads any new files first, then writes the row;
 * replaced files are deleted afterwards so a failed save never leaves a video without media.
 */
export async function saveVideo(
  draft: VideoDraft,
  publish: boolean,
  existing: AdminVideo | undefined,
  onProgress: (p: UploadProgress) => void,
): Promise<AdminVideo> {
  if (!supabase) return mockSave(draft, publish, existing, onProgress);

  const id = existing?.id ?? uuidv4();
  const stamp = Date.now().toString(36);
  let videoUrl = existing?.videoUrl;
  let videoPath = existing?.videoPath ?? null;
  let thumbnailUrl = existing?.thumbnailUrl;
  let thumbnailPath = existing?.thumbnailPath ?? null;
  const replaced: (string | null)[] = [];

  if (draft.video) {
    const path = `videos/${id}-${stamp}.${extOf(draft.video, 'mp4')}`;
    videoUrl = await uploadMedia(path, draft.video, (f) => onProgress({ stage: 'video', fraction: f }));
    if (videoPath) replaced.push(videoPath);
    videoPath = path;
  }
  if (draft.thumbnail) {
    const path = `thumbnails/${id}-${stamp}.${extOf(draft.thumbnail, 'jpg')}`;
    thumbnailUrl = await uploadMedia(path, draft.thumbnail, (f) => onProgress({ stage: 'thumbnail', fraction: f }));
    if (thumbnailPath) replaced.push(thumbnailPath);
    thumbnailPath = path;
  }
  if (!videoUrl || !thumbnailUrl) throw new Error('Thiếu video hoặc ảnh bìa');

  onProgress({ stage: 'saving', fraction: 1 });
  const row = {
    title: draft.title.trim(),
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    video_path: videoPath,
    thumbnail_path: thumbnailPath,
    category_code: draft.category,
    teacher_name: draft.teacherName.trim(),
    teacher_avatar_url: draft.teacherAvatar || null,
    tags: draft.tags,
    cta_text: draft.ctaText.trim(),
    cta_link: ctaLinkFor(draft.category),
    is_published: publish,
    // Newly published videos go to the top of the feed.
    ...(publish && !existing?.isPublished ? { published_at: new Date().toISOString() } : {}),
  };

  const query = existing
    ? supabase.from('videos').update(row).eq('id', id).select('*').single()
    : supabase.from('videos').insert({ id, ...row }).select('*').single();
  const { data, error } = await query;
  if (error) {
    // Roll back uploads of a brand-new video so Storage doesn't fill with orphans.
    if (!existing) await removeMedia([videoPath, thumbnailPath]).catch(() => {});
    throw new Error(error.message.includes('row-level security') ? 'Tài khoản không có quyền đăng video.' : `Lưu video thất bại: ${error.message}`);
  }

  await removeMedia(replaced).catch(() => {});
  return toAdminVideo(data, existing?.leadCount ?? 0);
}

export async function setPublished(video: AdminVideo, publish: boolean): Promise<AdminVideo> {
  if (!supabase) {
    return mockVideoRepo.upsert({ ...video, isPublished: publish, publishedAt: publish ? new Date().toISOString() : video.publishedAt });
  }
  const patch = publish ? { is_published: true, published_at: new Date().toISOString() } : { is_published: false };
  const { data, error } = await supabase.from('videos').update(patch).eq('id', video.id).select('*').single();
  if (error) throw error;
  return toAdminVideo(data, video.leadCount);
}

export async function deleteVideo(video: AdminVideo): Promise<void> {
  if (!supabase) {
    mockVideoRepo.remove(video.id);
    return;
  }
  const { error } = await supabase.from('videos').delete().eq('id', video.id);
  if (error) throw error;
  await removeMedia([video.videoPath, video.thumbnailPath]).catch(() => {});
}

// ─── Demo mode ──────────────────────────────────────────────────────────────

async function mockSave(draft: VideoDraft, publish: boolean, existing: AdminVideo | undefined, onProgress: (p: UploadProgress) => void) {
  // Simulated upload so the progress UI can be reviewed without a backend.
  for (const stage of ['video', 'thumbnail'] as const) {
    if (stage === 'video' ? !draft.video : !draft.thumbnail) continue;
    for (let i = 1; i <= 5; i++) {
      await sleep(stage === 'video' ? 250 : 80);
      onProgress({ stage, fraction: i / 5 });
    }
  }
  onProgress({ stage: 'saving', fraction: 1 });
  const nowIso = new Date().toISOString();
  const id = existing?.id ?? uuidv4();
  return mockVideoRepo.upsert({
    id,
    title: draft.title.trim(),
    videoUrl: draft.video?.uri ?? existing?.videoUrl ?? '',
    thumbnailUrl: draft.thumbnail?.uri ?? existing?.thumbnailUrl ?? '',
    category: draft.category,
    teacherName: draft.teacherName.trim(),
    teacherAvatar: draft.teacherAvatar,
    tags: draft.tags,
    ctaText: draft.ctaText.trim(),
    ctaLink: ctaLinkFor(draft.category),
    shareSlug: existing?.shareSlug ?? id.replace(/-/g, '').slice(0, 10),
    isPublished: publish,
    publishedAt: publish && !existing?.isPublished ? nowIso : existing?.publishedAt ?? nowIso,
    createdAt: existing?.createdAt ?? nowIso,
    leadCount: existing?.leadCount ?? 0,
    videoPath: null,
    thumbnailPath: null,
  });
}
