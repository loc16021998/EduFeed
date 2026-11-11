/**
 * In-memory video store for running WITHOUT Supabase (dev / demo).
 * Lets staff try the whole publish flow locally: new uploads appear in EduFeed until reload.
 * Never used when PUBLIC_SUPABASE_* are configured.
 */
import type { AdminVideo } from '@/types';
import { FEED_ITEMS } from '@/utils/mockData';

const now = Date.now();

let videos: AdminVideo[] = FEED_ITEMS.map((v, i) => ({
  ...v,
  shareSlug: `demo${i + 1}`,
  isPublished: true,
  publishedAt: new Date(now - i * 6 * 3600_000).toISOString(),
  createdAt: new Date(now - i * 6 * 3600_000).toISOString(),
  leadCount: 0,
  videoPath: null,
  thumbnailPath: null,
}));

const byNewest = (a: AdminVideo, b: AdminVideo) => b.publishedAt.localeCompare(a.publishedAt);

export const mockVideoRepo = {
  all: (): AdminVideo[] => [...videos].sort(byNewest),
  published: (): AdminVideo[] => videos.filter((v) => v.isPublished).sort(byNewest),
  get: (id: string) => videos.find((v) => v.id === id),
  bySlug: (slug: string) => videos.find((v) => v.shareSlug === slug && v.isPublished),
  upsert: (v: AdminVideo) => {
    videos = [v, ...videos.filter((x) => x.id !== v.id)];
    return v;
  },
  remove: (id: string) => {
    videos = videos.filter((v) => v.id !== id);
  },
};
