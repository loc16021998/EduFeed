/**
 * EduFeed social actions — ♥ likes, comments (with verified TH EDU replies + moderation) and share counts.
 *
 * Everything goes through database functions (supabase/migrations/20261202090000_video_social.sql) that decide
 * the author's name and role on the server, enforce length / anti-spam rules and keep the counters exact.
 * Guests are identified by a random device id kept on this phone (AsyncStorage); their display name too.
 * Without Supabase (dev / demo) it all runs in memory with sample comments.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import { sleep, uuidv4 } from '@/utils/helpers';

import { ApiError } from './apiClient';

export type CommentRole = 'PARENT' | 'TEACHER' | 'ADMIN' | 'GUEST';
export type ShareChannel = 'NATIVE' | 'ZALO' | 'COPY';

export interface VideoComment {
  id: string;
  authorName: string;
  authorRole: CommentRole;
  content: string;
  createdAt: string;
  isHidden: boolean;
  mine: boolean;
  parentId: string | null;
  replies: VideoComment[];
  /** Optimistic row not confirmed by the server yet. */
  pending?: boolean;
}

export interface CommentsPage {
  items: VideoComment[];
  commentsCount: number;
  canModerate: boolean;
}

export interface SocialState {
  id: string;
  likes: number;
  comments: number;
  shares: number;
  liked: boolean;
}

export const COMMENT_MAX = 500;
export const GUEST_NAME_MAX = 40;

// ─── Device id + guest name ─────────────────────────────────────────────────

const DEVICE_KEY = 'thedu.deviceId';
const NAME_KEY = 'thedu.guestName';
let deviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const saved = await AsyncStorage.getItem(DEVICE_KEY);
    if (saved && /^[0-9a-f-]{36}$/.test(saved)) return (deviceId = saved);
  } catch {
    /* storage unavailable (private mode) — a per-session id still works */
  }
  deviceId = uuidv4().toLowerCase();
  AsyncStorage.setItem(DEVICE_KEY, deviceId).catch(() => {});
  return deviceId;
}

export async function getGuestName(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(NAME_KEY)) ?? '';
  } catch {
    return '';
  }
}

export function saveGuestName(name: string): void {
  AsyncStorage.setItem(NAME_KEY, name.trim().slice(0, GUEST_NAME_MAX)).catch(() => {});
}

/** Same rule as the server (shown before sending, so the parent is not surprised). */
export function guestNameProblem(name: string): string | null {
  const n = name.replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > GUEST_NAME_MAX) return 'Tên hiển thị 2–40 ký tự, VD: Mẹ bé Na';
  if (/(th\s*edu|giáo\s*viên|giao\s*vien|quản\s*trị|quan\s*tri|admin|trung\s*tâm|trung\s*tam|ban\s*giám|ban\s*giam)/i.test(n)) return 'Tên này dành cho trung tâm, ba mẹ chọn tên khác nhé';
  return null;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/** 999 → "999", 1234 → "1.2K", 15000 → "15K", 2_300_000 → "2.3M". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  if (n < 1_000_000) return `${n < 10_000 ? (Math.floor(n / 100) / 10).toString() : Math.floor(n / 1000)}K`;
  return `${Math.floor(n / 100_000) / 10}M`;
}

/** "Vừa xong", "5 phút", "3 giờ", "2 ngày", then "12/11". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} ngày`;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const ROLE_BADGE: Partial<Record<CommentRole, string>> = { TEACHER: 'Giáo viên TH EDU', ADMIN: 'Quản trị viên' };

// ─── Errors ─────────────────────────────────────────────────────────────────

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'RATE_LIMIT') return new ApiError(error.message, 'RATE_LIMITED', 429);
  if (/toggle_video_like|add_video_comment|get_video_comments|video_social_state|increment_video_share|hide_video_comment/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có tính năng bình luận. Chạy supabase/sql/upgrades/20261202090000_video_social.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const toComment = (c: any, parentId: string | null = null): VideoComment => ({
  id: String(c.id),
  authorName: String(c.author_name ?? 'Phụ huynh'),
  authorRole: (['PARENT', 'TEACHER', 'ADMIN', 'GUEST'].includes(c.author_role) ? c.author_role : 'GUEST') as CommentRole,
  content: String(c.content ?? ''),
  createdAt: String(c.created_at ?? new Date().toISOString()),
  isHidden: !!c.is_hidden,
  mine: !!c.mine,
  parentId: c.parent_comment_id ?? parentId,
  replies: Array.isArray(c.replies) ? c.replies.map((r: any) => toComment(r, String(c.id))) : [],
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── API ────────────────────────────────────────────────────────────────────

/** Counters + "did I like it" for a page of feed videos. */
export async function fetchSocialState(ids: string[]): Promise<SocialState[]> {
  const real = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!supabase) {
    await sleep(80);
    return ids.map((id) => ({ id, ...demoCounts(id), liked: demo.liked.has(id) }));
  }
  if (real.length === 0) return [];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = await rpc<any[]>('video_social_state', { p_video_ids: real, p_device_id: await getDeviceId() });
  return rows.map((r) => ({ id: r.id, likes: Number(r.likes_count) || 0, comments: Number(r.comments_count) || 0, shares: Number(r.shares_count) || 0, liked: !!r.liked }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** liked: true = like (double-tap), false = unlike. Returns the server's truth. */
export async function setVideoLike(id: string, liked: boolean): Promise<{ liked: boolean; likes: number }> {
  if (!supabase) {
    await sleep(120);
    if (demo.failNext) throw ((demo.failNext = false), new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK'));
    const c = demoCounts(id);
    if (liked && !demo.liked.has(id)) (demo.liked.add(id), c.likes++);
    if (!liked && demo.liked.has(id)) (demo.liked.delete(id), (c.likes = Math.max(0, c.likes - 1)));
    return { liked, likes: c.likes };
  }
  const r = await rpc<{ liked: boolean; likes_count: number }>('toggle_video_like', { p_video_id: id, p_device_id: await getDeviceId(), p_liked: liked });
  return { liked: !!r.liked, likes: Number(r.likes_count) || 0 };
}

export async function recordShare(id: string, channel: ShareChannel = 'NATIVE'): Promise<number | null> {
  if (!supabase) {
    await sleep(80);
    return ++demoCounts(id).shares;
  }
  const r = await rpc<{ shares_count: number }>('increment_video_share', { p_video_id: id, p_device_id: await getDeviceId(), p_channel: channel });
  return Number(r.shares_count) || 0;
}

export async function fetchComments(videoId: string): Promise<CommentsPage> {
  if (!supabase) {
    await sleep(200);
    const items = demoThreads(videoId).filter((c) => demo.staff || !c.isHidden).map((c) => ({ ...c, replies: c.replies.filter((r) => demo.staff || !r.isHidden) }));
    return { items, commentsCount: demoCounts(videoId).comments, canModerate: demo.staff };
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = await rpc<any>('get_video_comments', { p_video_id: videoId, p_device_id: await getDeviceId(), p_limit: 50 });
  return { items: (r.items ?? []).map((c: any) => toComment(c)), commentsCount: Number(r.comments_count) || 0, canModerate: !!r.can_moderate };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface NewComment {
  videoId: string;
  content: string;
  parentId?: string | null;
  /** Guests only (signed-in parents / staff are named by the server). */
  guestName?: string;
}

export async function postComment(input: NewComment): Promise<{ comment: VideoComment; commentsCount: number }> {
  const content = input.content.trim();
  if (!content) throw new ApiError('Ba mẹ nhập nội dung bình luận nhé', 'VALIDATION', 422, 'content');
  if (content.length > COMMENT_MAX) throw new ApiError('Bình luận tối đa 500 ký tự', 'VALIDATION', 422, 'content');
  if (!supabase) {
    await sleep(250);
    if (demo.failNext) throw ((demo.failNext = false), new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK'));
    const role: CommentRole = demo.staff ? 'TEACHER' : demo.parent ? 'PARENT' : 'GUEST';
    if (role === 'GUEST') {
      const p = guestNameProblem(input.guestName ?? '');
      if (p) throw new ApiError(p, 'VALIDATION', 422, 'name');
    }
    if (input.parentId && role !== 'TEACHER') throw new ApiError('Chỉ giáo viên / quản trị viên TH EDU được trả lời bình luận', 'FORBIDDEN', 403);
    const c: VideoComment = {
      id: `demo-c-${Date.now()}`, authorName: role === 'TEACHER' ? 'Cô Hường (mẫu)' : role === 'PARENT' ? 'Mẹ Minh Khôi (mẫu)' : input.guestName!.trim(),
      authorRole: role, content, createdAt: new Date().toISOString(), isHidden: false, mine: true, parentId: input.parentId ?? null, replies: [],
    };
    const threads = demoThreads(input.videoId);
    const parent = input.parentId ? threads.find((t) => t.id === input.parentId || t.replies.some((r) => r.id === input.parentId)) : null;
    if (parent) parent.replies.push({ ...c, parentId: parent.id });
    else threads.unshift(c);
    return { comment: c, commentsCount: ++demoCounts(input.videoId).comments };
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = await rpc<any>('add_video_comment', {
    p_video_id: input.videoId, p_content: content, p_parent_comment_id: input.parentId ?? null,
    p_guest_name: input.guestName?.trim() || null, p_device_id: await getDeviceId(),
  });
  return { comment: toComment(r), commentsCount: Number(r.comments_count) || 0 };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function setCommentHidden(commentId: string, hidden: boolean, videoId: string): Promise<number> {
  if (!supabase) {
    await sleep(150);
    for (const t of demoThreads(videoId)) {
      const target = t.id === commentId ? t : t.replies.find((r) => r.id === commentId);
      if (!target || target.isHidden === hidden) continue;
      const affected = target === t ? [t, ...t.replies.filter((r) => r.isHidden !== hidden)] : [target];
      for (const x of affected) x.isHidden = hidden;
      const c = demoCounts(videoId);
      c.comments = Math.max(0, c.comments + (hidden ? -affected.length : affected.length));
    }
    return demoCounts(videoId).comments;
  }
  const r = await rpc<{ comments_count: number }>('hide_video_comment', { p_comment_id: commentId, p_hidden: hidden });
  return Number(r.comments_count) || 0;
}

// ─── Demo ───────────────────────────────────────────────────────────────────

const demo = {
  liked: new Set<string>(),
  counts: new Map<string, { likes: number; comments: number; shares: number }>(),
  threads: new Map<string, VideoComment[]>(),
  /** Who is "signed in" in demo mode (set by the app from the parent / staff stores). */
  staff: false,
  parent: false,
  /** Test hook: make the next like / comment fail (rollback demo). */
  failNext: false,
};

/** Demo mode only: tell the sample backend who is using the app. */
export function setDemoViewer(v: { staff: boolean; parent: boolean }) {
  demo.staff = v.staff;
  demo.parent = v.parent;
}
/** Demo / tests: the next like or comment fails like a network drop. */
export function demoFailNext() {
  demo.failNext = true;
}

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function demoCounts(id: string) {
  let c = demo.counts.get(id);
  if (!c) {
    const h = hash(id);
    c = { likes: 40 + (h % 1400), comments: demoThreads(id).reduce((n, t) => n + 1 + t.replies.length, 0), shares: 3 + (h % 60) };
    demo.counts.set(id, c);
  }
  return c;
}

function demoThreads(id: string): VideoComment[] {
  let t = demo.threads.get(id);
  if (!t) {
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const mk = (i: string, name: string, role: CommentRole, content: string, min: number, replies: VideoComment[] = []): VideoComment => ({
      id: `demo-${id}-${i}`, authorName: name, authorRole: role, content, createdAt: ago(min), isHidden: false, mine: false, parentId: null, replies,
    });
    const reply = (i: string, name: string, role: CommentRole, content: string, min: number): VideoComment => ({ ...mk(i, name, role, content, min), parentId: `demo-${id}-1` });
    t = [
      mk('3', 'Bố Gia Huy (mẫu)', 'PARENT', 'Con nhà mình học 2 tháng đã tính nhẩm nhanh hơn hẳn, cảm ơn các cô ạ!', 45),
      mk('2', 'Mẹ Su (mẫu)', 'GUEST', 'Cơ sở Xa La còn lịch học thử cuối tuần không cô?', 180),
      mk('1', 'Mẹ Minh Anh (mẫu)', 'PARENT', 'Học phí khóa này thế nào ạ?', 600, [
        reply('1r', 'Cô Hường (mẫu)', 'TEACHER', 'Chào chị, học phí từ 1.200.000đ/tháng (8 buổi). Chị đặt lịch học thử miễn phí để cô kiểm tra trình độ của bé nhé!', 540),
      ]),
    ];
    demo.threads.set(id, t);
  }
  return t;
}
