/**
 * "Cộng đồng TH EDU" — private, moderated feed for verified parents (a child with an active / completed course)
 * and staff. Everything goes through database functions (community_*); photos live in the private bucket
 * `community` under <auth uid>/…. Staff comments are "Giáo viên giải đáp"; 3 reports hide a post until an admin /
 * manager reviews it. Demo mode (no Supabase) runs on labelled sample posts in memory.
 */
import { registerMediaCache } from '@/utils/mediaCache';
import { supabase } from '@/lib/supabase';
import type { CampusLocation, PickedMedia } from '@/types';
import { sleep, uuidv4 } from '@/utils/helpers';

import { ApiError } from './apiClient';
import { uploadMedia } from './media/storageUpload';

export type PostKind = 'TIP' | 'QUESTION' | 'MILESTONE' | 'BOOK_EXCHANGE';

export const POST_KINDS: { kind: PostKind; label: string; emoji: string }[] = [
  { kind: 'TIP', label: 'Mẹo hay', emoji: '💡' },
  { kind: 'QUESTION', label: 'Hỏi đáp', emoji: '❓' },
  { kind: 'MILESTONE', label: 'Khoảnh khắc của con', emoji: '🌱' },
  { kind: 'BOOK_EXCHANGE', label: 'Trao đổi sách', emoji: '📚' },
];
export const kindInfo = (k: PostKind) => POST_KINDS.find((x) => x.kind === k) ?? POST_KINDS[0];

export interface CommunityPost {
  id: string;
  authorName: string;
  authorIsStaff: boolean;
  campus: CampusLocation | null;
  kind: PostKind;
  body: string;
  photoUrl: string;
  status: 'VISIBLE' | 'HIDDEN';
  hiddenReason: 'REPORTED' | 'STAFF' | 'AUTHOR' | null;
  createdAt: string;
  mine: boolean;
  likes: number;
  liked: boolean;
  comments: number;
  expertAnswered: boolean;
  /** Open reports (moderators only, else 0). */
  reports: number;
}

export interface CommunityComment {
  id: string;
  authorName: string;
  isExpert: boolean;
  body: string;
  status: 'VISIBLE' | 'HIDDEN';
  mine: boolean;
  createdAt: string;
}

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'RATE_LIMITED') return new ApiError(error.message, 'RATE_LIMITED', 429);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/community_/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có Cộng đồng. Chạy supabase/sql/upgrades/20261128090000_voice_games_community.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

const signed = new Map<string, { url: string; until: number }>();
registerMediaCache({ id: 'community-photos', label: 'Ảnh cộng đồng (liên kết tạm)', size: () => signed.size, clear: () => signed.clear() });
async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const missing = paths.filter((p) => {
    const hit = signed.get(p);
    if (hit && hit.until > now) out.set(p, hit.url);
    return !(hit && hit.until > now);
  });
  if (supabase && missing.length) {
    const { data } = await supabase.storage.from('community').createSignedUrls(missing, 3600);
    for (const d of data ?? []) {
      if (!d.path || !d.signedUrl) continue;
      signed.set(d.path, { url: d.signedUrl, until: now + 50 * 60_000 });
      out.set(d.path, d.signedUrl);
    }
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const toPost = (p: any, url: string): CommunityPost => ({
  id: p.id, authorName: p.author_name, authorIsStaff: !!p.author_is_staff, campus: p.campus ?? null, kind: p.kind, body: p.body,
  photoUrl: url, status: p.status, hiddenReason: p.hidden_reason ?? null, createdAt: p.created_at, mine: !!p.mine,
  likes: Number(p.likes ?? 0), liked: !!p.liked, comments: Number(p.comments ?? 0), expertAnswered: !!p.expert_answered, reports: Number(p.reports ?? 0),
});
const toComment = (c: any): CommunityComment => ({
  id: c.id, authorName: c.author_name, isExpert: !!c.is_expert, body: c.body, status: c.status, mine: !!c.mine, createdAt: c.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchCommunityFeed(f: { campus?: CampusLocation | null; kind?: PostKind | null; before?: string | null } = {}): Promise<CommunityPost[]> {
  if (!supabase) {
    await sleep(300);
    return structuredClone(
      demo().posts.filter((p) => (p.status === 'VISIBLE' || p.mine || demoViewer.moderator) && (!f.campus || p.campus === f.campus) && (!f.kind || p.kind === f.kind) && (!f.before || p.createdAt < f.before)),
    );
  }
  const rows = await rpc<any[]>('community_feed', { p_campus: f.campus ?? null, p_kind: f.kind ?? null, p_before: f.before ?? null }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const urls = await signPhotos(rows.map((r) => r.photo_path).filter(Boolean));
  return rows.map((r) => toPost(r, r.photo_path ? urls.get(r.photo_path) ?? '' : ''));
}

export async function isCommunityModerator(): Promise<boolean> {
  if (!supabase) return demoViewer.moderator;
  return rpc<boolean>('community_moderator').catch(() => false);
}

export function postProblem(kind: PostKind | null, body: string): string | null {
  if (!kind) return 'Chọn loại bài viết';
  const n = body.trim().length;
  if (n < 5) return 'Viết thêm một chút nhé (ít nhất 5 ký tự)';
  if (n > 2000) return 'Bài viết tối đa 2000 ký tự';
  return null;
}

export async function createCommunityPost(input: { kind: PostKind; body: string; photo?: PickedMedia | null; onProgress?: (f: number) => void }): Promise<void> {
  const problem = postProblem(input.kind, input.body);
  if (problem) throw new ApiError(problem, 'VALIDATION', 422, 'body');
  if (!supabase) {
    await sleep(350);
    demo().posts.unshift({
      id: uuidv4(), authorName: demoViewer.name, authorIsStaff: demoViewer.staff, campus: 'XA_LA', kind: input.kind, body: input.body.trim(),
      photoUrl: input.photo?.uri ?? '', status: 'VISIBLE', hiddenReason: null, createdAt: new Date().toISOString(), mine: true,
      likes: 0, liked: false, comments: 0, expertAnswered: false, reports: 0,
    });
    return;
  }
  let path: string | null = null;
  if (input.photo) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new ApiError('Phiên đăng nhập đã hết hạn', 'UNAUTHORIZED', 401);
    const ext = /png/.test(input.photo.type) ? 'png' : /webp/.test(input.photo.type) ? 'webp' : 'jpg';
    path = `${data.user.id}/${uuidv4()}.${ext}`;
    await uploadMedia(path, input.photo, input.onProgress, 'community');
  }
  await rpc('community_post_create', { p_kind: input.kind, p_body: input.body.trim(), p_photo_path: path });
}

export async function fetchComments(postId: string): Promise<CommunityComment[]> {
  if (!supabase) {
    await sleep(200);
    return structuredClone((demo().comments[postId] ?? []).filter((c) => c.status === 'VISIBLE' || demoViewer.moderator)).sort((a, b) => Number(b.isExpert) - Number(a.isExpert));
  }
  return (await rpc<unknown[]>('community_comments_list', { p_post_id: postId })).map(toComment);
}

export async function addComment(postId: string, body: string): Promise<CommunityComment> {
  const text = body.trim();
  if (!text) throw new ApiError('Nhập bình luận', 'VALIDATION', 422, 'body');
  if (text.length > 1000) throw new ApiError('Bình luận tối đa 1000 ký tự', 'VALIDATION', 422, 'body');
  if (!supabase) {
    await sleep(200);
    const c: CommunityComment = { id: uuidv4(), authorName: demoViewer.name, isExpert: demoViewer.staff, body: text, status: 'VISIBLE', mine: true, createdAt: new Date().toISOString() };
    (demo().comments[postId] ??= []).push(c);
    const p = demo().posts.find((x) => x.id === postId);
    if (p) {
      p.comments++;
      if (c.isExpert) p.expertAnswered = true;
    }
    return c;
  }
  const r = await rpc<{ id: string; is_expert: boolean }>('community_comment', { p_post_id: postId, p_body: text });
  return { id: r.id, authorName: 'Bạn', isExpert: r.is_expert, body: text, status: 'VISIBLE', mine: true, createdAt: new Date().toISOString() };
}

export async function toggleLike(postId: string): Promise<{ on: boolean; likes: number }> {
  if (!supabase) {
    await sleep(100);
    const p = demo().posts.find((x) => x.id === postId)!;
    p.liked = !p.liked;
    p.likes += p.liked ? 1 : -1;
    return { on: p.liked, likes: p.likes };
  }
  const r = await rpc<{ on: boolean; likes: number }>('community_like', { p_post_id: postId });
  return { on: r.on, likes: Number(r.likes) };
}

export async function reportContent(target: { postId?: string; commentId?: string }, reason?: string): Promise<void> {
  if (!supabase) {
    await sleep(150);
    return;
  }
  await rpc('community_report', { p_post_id: target.postId ?? null, p_comment_id: target.commentId ?? null, p_reason: reason?.trim() || null });
}

/** Hide / restore (moderators), or delete own (hidden = true). */
export async function moderate(target: { postId?: string; commentId?: string }, hidden: boolean): Promise<void> {
  if (!supabase) {
    await sleep(150);
    const p = target.postId && demo().posts.find((x) => x.id === target.postId);
    if (p) {
      p.status = hidden ? 'HIDDEN' : 'VISIBLE';
      p.hiddenReason = hidden ? (demoViewer.moderator ? 'STAFF' : 'AUTHOR') : null;
    }
    for (const list of Object.values(demo().comments)) {
      const c = list.find((x) => x.id === target.commentId);
      if (c) c.status = hidden ? 'HIDDEN' : 'VISIBLE';
    }
    return;
  }
  await rpc('community_moderate', { p_post_id: target.postId ?? null, p_comment_id: target.commentId ?? null, p_hidden: hidden });
}

// ─── Demo ───────────────────────────────────────────────────────────────────

const demoViewer = { name: 'Mẹ An (mẫu)', staff: false, moderator: false };
/** Demo only: who is browsing (parent or staff demo account). */
export function setCommunityDemoViewer(v: { name: string; staff: boolean; moderator: boolean }) {
  Object.assign(demoViewer, v);
}

let demoStore: { posts: CommunityPost[]; comments: Record<string, CommunityComment[]> } | null = null;
function demo() {
  if (demoStore) return demoStore;
  const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const base = { authorIsStaff: false, photoUrl: '', status: 'VISIBLE' as const, hiddenReason: null, mine: false, liked: false, reports: 0 };
  demoStore = {
    posts: [
      { ...base, id: 'cp-1', authorName: 'Mẹ Bống (mẫu)', campus: 'XA_LA', kind: 'QUESTION', body: 'Bé nhà mình 5 tuổi cầm bút hay bị mỏi tay, viết được 3 dòng là kêu. Các mẹ có mẹo gì cho con tập không ạ?', createdAt: ago(3), likes: 8, comments: 2, expertAnswered: true },
      { ...base, id: 'cp-2', authorName: 'Bố Gia Huy (mẫu)', campus: 'NGO_THI_NHAM', kind: 'BOOK_EXCHANGE', body: 'Nhà mình pass lại bộ sách Toán tư duy cấp độ 1 (còn mới 90%), ba mẹ nào cần thì để lại bình luận nhé.', createdAt: ago(20), likes: 3, comments: 0, expertAnswered: false },
      { ...base, id: 'cp-3', authorName: 'Mẹ Su (mẫu)', campus: 'XA_LA', kind: 'TIP', body: 'Mẹo nhỏ: mỗi tối mình cho con đọc to biển số xe, giá tiền trong siêu thị — con thích lắm mà lại nhớ số rất nhanh.', createdAt: ago(30), likes: 15, comments: 1, expertAnswered: false },
    ],
    comments: {
      'cp-1': [
        { id: 'cc-1', authorName: 'Mẹ Na (mẫu)', isExpert: false, body: 'Bé nhà mình tập bóp bóng cao su 5 phút trước khi viết, đỡ hẳn mỏi tay.', status: 'VISIBLE', mine: false, createdAt: ago(2.5) },
        { id: 'cc-2', authorName: 'Cô Hường (mẫu)', isExpert: true, body: 'Ba mẹ cho con khởi động ngón tay (nặn đất, xé giấy) và chỉ viết 10–15 phút mỗi lần. Kiểm tra tư thế cầm bút: 3 ngón, cách ngòi khoảng 2,5 cm nhé.', status: 'VISIBLE', mine: false, createdAt: ago(2) },
      ],
      'cp-3': [{ id: 'cc-3', authorName: 'Mẹ Bống (mẫu)', isExpert: false, body: 'Hay quá, mai mình thử!', status: 'VISIBLE', mine: false, createdAt: ago(28) }],
    },
  };
  return demoStore;
}
