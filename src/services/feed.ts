import { supabase } from '@/lib/supabase';
import type { Category, CourseCategory, FeedItem } from '@/types';
import type { Tables } from '@/types/database';
import { sleep } from '@/utils/helpers';

import { mockVideoRepo } from './mockVideoRepo';

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface FeedQuery {
  category?: Category;
  cursor?: string | null;
  limit?: number;
}

const toFeedItem = (r: Tables<'videos'>): FeedItem => ({
  id: r.id,
  title: r.title,
  videoUrl: r.video_url,
  thumbnailUrl: r.thumbnail_url,
  category: r.category_code as CourseCategory,
  teacherName: r.teacher_name,
  teacherAvatar: r.teacher_avatar_url ?? '',
  tags: r.tags ?? [],
  ctaText: r.cta_text,
  ctaLink: r.cta_link ?? `thedu://booking?course=${r.category_code}`,
  shareSlug: r.share_slug ?? undefined,
});

/** Cursor = "<published_at>|<id>" of the last item (keyset pagination, stable as new videos arrive). */
const encodeCursor = (r: Tables<'videos'>) => `${r.published_at}|${r.id}`;
const decodeCursor = (c: string | null) => {
  const [ts, id] = (c ?? '').split('|');
  return ts && id ? { ts, id } : null;
};

/**
 * Feed page straight from the database function `get_feed()` (public read via RLS, published
 * videos only). Needs no Edge Function, so it works right after running the SQL setup.
 * (The `GET /api/feed` endpoint remains available for other clients / CDN caching.)
 */
export async function fetchFeedPage({ category = 'ALL', cursor = null, limit = 6 }: FeedQuery = {}): Promise<FeedPage> {
  if (!supabase) return mockFeedPage(category, cursor, limit);

  const after = decodeCursor(cursor);
  const { data, error } = await supabase.rpc('get_feed', {
    p_category_code: category === 'ALL' ? null : category,
    p_limit: limit + 1, // one extra row tells us whether another page exists
    p_before_ts: after?.ts ?? null,
    p_before_id: after?.id ?? null,
  });
  if (error) throw error;

  const rows = data ?? [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { items: page.map(toFeedItem), nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

/** Offline/dev fallback with the same paging semantics (cursor = next index). */
async function mockFeedPage(category: Category, cursor: string | null, limit: number): Promise<FeedPage> {
  await sleep(500);
  const published = mockVideoRepo.published();
  const all = category === 'ALL' ? published : published.filter((i) => i.category === category);
  const start = cursor ? Number(cursor) : 0;
  const items = all.slice(start, start + limit);
  const next = start + limit;
  return { items, nextCursor: next < all.length ? String(next) : null };
}
