/**
 * Teachers who appear on EduFeed videos / Before-After posts ("Cô Hường", "Thầy Tú"…) and their avatar.
 * Server: supabase/migrations/20261205090000_video_presenters.sql. Demo mode keeps them in memory.
 */
import { supabase } from '@/lib/supabase';
import { uploadAvatar } from '@/services/account';
import { ApiError } from '@/services/apiClient';
import { mockVideoRepo } from '@/services/mockVideoRepo';
import type { PickedMedia } from '@/types';
import { sleep } from '@/utils/helpers';
import { TEACHERS } from '@/utils/mockData';

export interface Presenter {
  id: string;
  name: string;
  /** '' = no photo yet (initials are shown). */
  avatarUrl: string;
  /** Videos currently showing this name. */
  videos: number;
}

export interface SavePresenterResult {
  presenter: Presenter;
  updatedVideos: number;
  updatedPosts: number;
}

/** Same rules as video_presenter_save (unit-tested). */
export function presenterNameProblem(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 2 || v.length > 60) return 'Tên giáo viên cần 2–60 ký tự';
  if (/[<>{}]|https?:\/\//i.test(v)) return 'Tên không được chứa đường link hay ký tự đặc biệt';
  return null;
}

/** Shown while the list loads or when the server has no list yet (keeps the editor usable). */
export const FALLBACK_PRESENTERS: Presenter[] = TEACHERS.map((t) => ({ id: `local-${t.id}`, name: t.name, avatarUrl: '', videos: 0 }));

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/video_presenter/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có danh sách giáo viên. Chạy supabase/sql/upgrades/20261205090000_video_presenters.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

// ─── Demo ───────────────────────────────────────────────────────────────────

let demo: Presenter[] | null = null;
const demoList = () =>
  (demo ??= TEACHERS.map((t) => ({ id: `demo-${t.id}`, name: t.name, avatarUrl: t.avatarUrl, videos: 0 }))).map((p) => ({ ...p, videos: mockVideoRepo.countByPresenter(p.name) }));

// ─── API ────────────────────────────────────────────────────────────────────

export async function listPresenters(): Promise<Presenter[]> {
  if (!supabase) {
    await sleep(150);
    return demoList();
  }
  const { data, error } = await supabase.rpc('video_presenters_list' as never);
  if (error) throw mapDbError(error);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url ?? '', videos: Number(r.videos ?? 0) }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Add (id null) or update a presenter. applyExisting: also put the new name + photo on the videos and
 * Before/After posts that already show this teacher.
 */
export async function savePresenter(input: { id: string | null; name: string; avatarUrl: string; applyExisting: boolean }): Promise<SavePresenterResult> {
  const bad = presenterNameProblem(input.name);
  if (bad) throw new ApiError(bad, 'VALIDATION', 422, 'name');
  const name = input.name.trim();
  if (!supabase) {
    await sleep(200);
    const list = demoList();
    if (list.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== input.id)) throw new ApiError(`Đã có giáo viên tên "${name}"`, 'CONFLICT', 409);
    let updatedVideos = 0;
    if (input.id) {
      const old = list.find((p) => p.id === input.id);
      if (!old) throw new ApiError('Không tìm thấy giáo viên', 'NOT_FOUND', 404);
      if (input.applyExisting) updatedVideos = mockVideoRepo.updatePresenter(old.name, name, input.avatarUrl);
      demo = (demo ?? []).map((p) => (p.id === input.id ? { ...p, name, avatarUrl: input.avatarUrl } : p));
    } else {
      demo = [...(demo ?? []), { id: `demo-${Date.now()}`, name, avatarUrl: input.avatarUrl, videos: 0 }];
    }
    const saved = demoList().find((p) => p.name === name)!;
    return { presenter: saved, updatedVideos, updatedPosts: 0 };
  }
  const { data, error } = await supabase.rpc('video_presenter_save' as never, {
    p_id: input.id && !input.id.startsWith('local-') ? input.id : null,
    p_name: name,
    p_avatar_url: input.avatarUrl || null,
    p_apply_existing: input.applyExisting,
  } as never);
  if (error) throw mapDbError(error);
  const r = data as unknown as { id: string; name: string; avatarUrl: string | null; updatedVideos: number; updatedPosts: number };
  return { presenter: { id: r.id, name: r.name, avatarUrl: r.avatarUrl ?? '', videos: 0 }, updatedVideos: Number(r.updatedVideos ?? 0), updatedPosts: Number(r.updatedPosts ?? 0) };
}

/** Upload a presenter photo (public "avatars" bucket, uploader's own folder). Returns its URL. */
export const uploadPresenterAvatar = (media: PickedMedia): Promise<string> => uploadAvatar(media);

export async function archivePresenter(id: string): Promise<void> {
  if (!supabase) {
    await sleep(150);
    demo = (demo ?? []).filter((p) => p.id !== id);
    return;
  }
  const { error } = await supabase.rpc('video_presenter_archive' as never, { p_id: id } as never);
  if (error) throw mapDbError(error);
}
