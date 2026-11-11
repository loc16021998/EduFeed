/**
 * Trust content: verified stats, consented testimonials, anonymised recent activity.
 *
 * Data origin rules (enforced here, labelled in the UI):
 *   LIVE   — from Supabase (RLS only returns published + sourced/consented rows)
 *   SAMPLE — dev builds without a backend: clearly-labelled placeholder content
 *   NONE   — production without a backend: show nothing rather than invent anything
 */
import { SAMPLE_ACTIVITY, SAMPLE_STATS, SAMPLE_TESTIMONIALS } from '@/content/trustSamples';
import { supabase } from '@/lib/supabase';
import type {
  ActivityEvent,
  CampusLocation,
  CourseCategory,
  Testimonial,
  TrustDataOrigin,
  TrustStat,
} from '@/types';

export interface WithOrigin<T> {
  data: T;
  origin: TrustDataOrigin;
}

const fallback = <T>(sample: T, empty: T): WithOrigin<T> =>
  __DEV__ ? { data: sample, origin: 'SAMPLE' } : { data: empty, origin: 'NONE' };

export async function fetchTrustStats(): Promise<WithOrigin<TrustStat[]>> {
  if (!supabase) return fallback(SAMPLE_STATS, []);
  const { data, error } = await supabase
    .from('trust_stats')
    .select('id, icon, headline, label, source_note')
    .order('sort_order')
    .limit(6);
  if (error) throw error;
  return {
    origin: 'LIVE',
    data: (data ?? []).map((r) => ({ id: r.id, icon: r.icon, headline: r.headline, label: r.label, sourceNote: r.source_note })),
  };
}

export async function fetchRecentActivity(limit = 12): Promise<WithOrigin<ActivityEvent[]>> {
  if (!supabase) return fallback(SAMPLE_ACTIVITY, []);
  const { data, error } = await supabase.rpc('recent_activity', { p_limit: limit });
  if (error) throw error;
  return {
    origin: 'LIVE',
    data: (data ?? []).map((r, i) => ({
      id: `${r.created_at}-${i}`,
      actorLabel: r.actor_label,
      course: r.course_code as CourseCategory,
      courseName: r.course_name,
      branch: r.branch_code as CampusLocation,
      branchName: r.branch_name,
      createdAt: r.created_at,
    })),
  };
}

export async function fetchTestimonials(): Promise<WithOrigin<Testimonial[]>> {
  if (!supabase) return fallback(SAMPLE_TESTIMONIALS, []);
  const { data, error } = await supabase
    .from('testimonials')
    .select('id, kind, parent_label, course_code, branch_location, quote, media_url, thumbnail_url, duration_sec')
    .order('sort_order')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return {
    origin: 'LIVE',
    data: (data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      parentLabel: r.parent_label,
      course: r.course_code as CourseCategory,
      branch: r.branch_location as CampusLocation | null,
      quote: r.quote,
      mediaUrl: r.media_url,
      thumbnailUrl: r.thumbnail_url,
      durationSec: r.duration_sec,
    })),
  };
}

/** "3 phút trước" / "2 giờ trước" / "hôm qua" */
export function timeAgoVN(iso: string, now = Date.now()): string {
  const mins = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hôm qua' : `${days} ngày trước`;
}
