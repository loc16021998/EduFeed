/**
 * Parent engagement: AI notebook check + "Classroom Flash" (short class moments from teachers).
 *
 * AI check   POST /api/ai/notebook-check (Edge Function → Claude vision). The photo is not stored. Without Supabase
 *            (demo) a fixed SAMPLE result is returned and the screen labels it "Kết quả mẫu".
 * Flashes    teacher uploads a photo / ≤5 s voice clip to class-reports/class/<class_id>/… then flash_create;
 *            parents of that class read them via flash_feed (7 days), react ❤️ / 🌟 and reply.
 */
import { supabase } from '@/lib/supabase';
import type { PickedMedia } from '@/types';
import { sleep, uuidv4 } from '@/utils/helpers';

import {
  SAMPLE_NOTEBOOK_RESULT,
  type NotebookCheckResponse,
  type NotebookKind,
} from '../../supabase/functions/_shared/notebookCheck';
import { ApiError, callApi } from './apiClient';
import type { NotebookPhoto } from './media/mediaPicker';
import { uploadMedia } from './media/storageUpload';

export type { NotebookCheckResponse, NotebookKind };
export type { NotebookCriterion, NotebookResult } from '../../supabase/functions/_shared/notebookCheck';

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'UNAUTHORIZED') return new ApiError(error.message, 'UNAUTHORIZED', 401);
  if (hint === 'RATE_LIMITED') return new ApiError(error.message, 'RATE_LIMITED', 429);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/flash_|ai_check/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có Khoảnh khắc lớp học. Chạy supabase/sql/upgrades/20261127090000_parent_engagement.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

// ─── AI notebook check ──────────────────────────────────────────────────────

export interface NotebookCheckResult extends NotebookCheckResponse {
  /** Demo mode: a fixed sample, not an analysis of the photo. */
  sample: boolean;
}

export async function checkNotebook(kind: NotebookKind, photo: NotebookPhoto): Promise<NotebookCheckResult> {
  if (!supabase) {
    await sleep(2200);
    return { id: uuidv4(), kind, result: structuredClone(SAMPLE_NOTEBOOK_RESULT[kind]), remainingToday: 9, sample: true };
  }
  const r = await callApi<NotebookCheckResponse>('ai/notebook-check', {
    method: 'POST',
    body: { kind, image: photo.base64, mediaType: photo.mediaType },
  });
  return { ...r, sample: false };
}

// ─── Classroom Flash ────────────────────────────────────────────────────────

export type FlashKind = 'PHOTO' | 'AUDIO';
export type FlashReaction = 'HEART' | 'PROUD';

export interface FlashReply {
  parentName: string | null;
  body: string;
  createdAt: string;
}

export interface ClassFlash {
  id: string;
  classId: string;
  className: string;
  teacherName: string;
  kind: FlashKind;
  /** Signed URL (1 h) — or a full URL in demo mode. Empty if signing failed. */
  url: string;
  caption: string | null;
  durationSec: number | null;
  createdAt: string;
  hearts: number;
  prouds: number;
  myReactions: FlashReaction[];
  replies: FlashReply[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const toFlash = (f: any): Omit<ClassFlash, 'url'> & { path: string } => ({
  id: f.id,
  classId: f.class_id,
  className: f.class_name ?? '',
  teacherName: f.teacher_name ?? 'Giáo viên',
  kind: f.kind,
  path: f.media_path,
  caption: f.caption ?? null,
  durationSec: f.duration_sec == null ? null : Number(f.duration_sec),
  createdAt: f.created_at,
  hearts: Number(f.hearts ?? 0),
  prouds: Number(f.prouds ?? 0),
  myReactions: Array.isArray(f.my_reactions) ? f.my_reactions : [],
  replies: (Array.isArray(f.replies) ? f.replies : []).map((r: any) => ({ parentName: r.parent_name ?? null, body: r.body, createdAt: r.created_at })),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

async function withUrls(rows: unknown[]): Promise<ClassFlash[]> {
  const flashes = rows.map(toFlash);
  const urls = await signAll(flashes.map((f) => f.path));
  return flashes.map(({ path, ...f }) => ({ ...f, url: urls.get(path) ?? '' }));
}

/**
 * Signed URLs, reused for ~50 minutes per path: a stable URL lets the image cache (browser / OS) hit
 * on every revisit instead of downloading the same photo again under a fresh signature.
 */
const signed = new Map<string, { url: string; until: number }>();
async function signAll(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const p of paths) {
    if (/^https?:\/\//.test(p)) out.set(p, p);
    else if ((signed.get(p)?.until ?? 0) > now) out.set(p, signed.get(p)!.url);
    else missing.push(p);
  }
  if (supabase && missing.length) {
    const { data } = await supabase.storage.from('class-reports').createSignedUrls(missing, 3600);
    for (const d of data ?? []) {
      if (!d.path || !d.signedUrl) continue;
      signed.set(d.path, { url: d.signedUrl, until: now + 50 * 60_000 });
      out.set(d.path, d.signedUrl);
    }
  }
  return out;
}

/** Parent: moments from all their children's classes (last 7 days). */
export async function fetchFlashFeed(): Promise<ClassFlash[]> {
  if (!supabase) {
    await sleep(350);
    return structuredClone(demoFlashes());
  }
  return withUrls(await rpc<unknown[]>('flash_feed'));
}

/** Teacher: moments of one class, with every parent's reply. */
export async function fetchClassFlashes(classId: string): Promise<ClassFlash[]> {
  if (!supabase) {
    await sleep(250);
    return structuredClone(demoFlashes().filter((f) => f.classId === classId || classId.startsWith('demo')));
  }
  return withUrls(await rpc<unknown[]>('flash_feed', { p_class_id: classId }));
}

export async function reactToFlash(flashId: string, reaction: FlashReaction): Promise<boolean> {
  if (!supabase) {
    await sleep(120);
    const f = demoFlashes().find((x) => x.id === flashId);
    if (!f) return false;
    const on = !f.myReactions.includes(reaction);
    f.myReactions = on ? [...f.myReactions, reaction] : f.myReactions.filter((r) => r !== reaction);
    if (reaction === 'HEART') f.hearts += on ? 1 : -1;
    else f.prouds += on ? 1 : -1;
    return on;
  }
  return (await rpc<{ on: boolean }>('flash_react', { p_flash_id: flashId, p_reaction: reaction })).on;
}

export const QUICK_REPLIES = ['Cảm ơn cô ạ! 🥰', 'Con giỏi quá!', 'Nhà mình tự hào lắm 🌟'];

export async function replyToFlash(flashId: string, body: string): Promise<FlashReply> {
  const text = body.trim();
  if (!text) throw new ApiError('Ba mẹ nhập lời nhắn nhé', 'VALIDATION', 422, 'body');
  if (text.length > 300) throw new ApiError('Lời nhắn tối đa 300 ký tự', 'VALIDATION', 422, 'body');
  const reply: FlashReply = { parentName: null, body: text, createdAt: new Date().toISOString() };
  if (!supabase) {
    await sleep(200);
    demoFlashes().find((x) => x.id === flashId)?.replies.push(reply);
    return reply;
  }
  await rpc('flash_reply', { p_flash_id: flashId, p_body: text });
  return reply;
}

/** Teacher: upload the photo / voice clip into the class folder, then register the moment. */
export async function postFlash(input: { classId: string; kind: FlashKind; media: PickedMedia; caption?: string; onProgress?: (f: number) => void }): Promise<void> {
  const caption = input.caption?.trim() ?? '';
  if (caption.length > 120) throw new ApiError('Chú thích tối đa 120 ký tự', 'VALIDATION', 422, 'caption');
  if (input.kind === 'AUDIO' && (input.media.durationSec ?? 0) > 5.5) throw new ApiError('Lời nhắn thoại tối đa 5 giây', 'VALIDATION', 422, 'media');
  if (!supabase) {
    await sleep(400);
    demoFlashes().unshift({
      id: uuidv4(), classId: input.classId, className: 'Lớp demo', teacherName: 'Bạn (demo)', kind: input.kind, url: input.media.uri,
      caption: caption || null, durationSec: input.media.durationSec ?? null, createdAt: new Date().toISOString(), hearts: 0, prouds: 0, myReactions: [], replies: [],
    });
    return;
  }
  const t = input.media.type;
  const ext = input.kind === 'PHOTO'
    ? (/png/.test(t) ? 'png' : /webp/.test(t) ? 'webp' : 'jpg')
    : (/mp4|m4a|aac/.test(t) ? 'm4a' : /ogg/.test(t) ? 'ogg' : /mpeg/.test(t) ? 'mp3' : 'webm');
  const path = `class/${input.classId}/${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}.${ext}`;
  await uploadMedia(path, input.media, input.onProgress, 'class-reports');
  await rpc('flash_create', {
    p_class_id: input.classId,
    p_kind: input.kind,
    p_path: path,
    p_caption: caption || null,
    p_duration: input.kind === 'AUDIO' ? Math.min(5, input.media.durationSec ?? 5) : null,
  });
}

/** "2 giờ trước" style label. */
export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return 'Vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

// ─── Demo data (no Supabase) ────────────────────────────────────────────────

let demoStore: ClassFlash[] | null = null;
function demoFlashes(): ClassFlash[] {
  if (demoStore) return demoStore;
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const pic = (seed: string) => `https://picsum.photos/seed/${seed}/900/1200`;
  demoStore = [
    { id: 'flash-1', classId: 'demo-class-1', className: 'Toán tư duy A1', teacherName: 'Cô Lan (mẫu)', kind: 'PHOTO', url: pic('thedu-flash-1'), caption: 'Cả lớp đang thi tính nhẩm siêu tốc!', durationSec: null, createdAt: ago(25), hearts: 6, prouds: 3, myReactions: [], replies: [] },
    { id: 'flash-2', classId: 'demo-class-1', className: 'Toán tư duy A1', teacherName: 'Cô Lan (mẫu)', kind: 'AUDIO', url: '', caption: 'Lời nhắn của cô sau buổi học', durationSec: 5, createdAt: ago(140), hearts: 4, prouds: 1, myReactions: ['HEART'], replies: [] },
    { id: 'flash-3', classId: 'demo-class-2', className: 'Luyện chữ đẹp B2', teacherName: 'Cô Mai (mẫu)', kind: 'PHOTO', url: pic('thedu-flash-3'), caption: 'Bài viết đẹp nhất tuần này', durationSec: null, createdAt: ago(60 * 26), hearts: 9, prouds: 5, myReactions: [], replies: [] },
  ];
  return demoStore;
}
