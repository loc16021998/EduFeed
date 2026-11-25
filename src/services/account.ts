/**
 * "Cài đặt & Tài khoản": the signed-in person's own profile (any role), avatar upload,
 * account-deletion requests and the admin editor for the store version gate.
 * Server: supabase/migrations/20261203090000_account_center.sql. Demo mode keeps everything in memory.
 */
import { ENV } from '@/config/env';
import { supabase } from '@/lib/supabase';
import { ApiError } from '@/services/apiClient';
import { fetchMyKind } from '@/services/staffOps';
import { uploadMedia } from '@/services/media/storageUpload';
import { useParentStore } from '@/store/useParentStore';
import { useStaffStore } from '@/store/useStaffStore';
import type { CampusLocation, PickedMedia } from '@/types';
import type { ReleaseConfig } from '@/services/updateService';

export type AccountRole = 'GUEST' | 'PARENT' | 'TEACHER' | 'ADVISOR' | 'MANAGER' | 'ADMIN';

export interface MyAccount {
  role: Exclude<AccountRole, 'GUEST'>;
  fullName: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  campus: CampusLocation | null;
  zaloLinked: boolean;
  deletionPending: boolean;
}

export interface DeletionRequest {
  id: string;
  role: MyAccount['role'];
  displayName: string;
  contact: string;
  reason: string | null;
  status: 'PENDING' | 'DONE' | 'CANCELLED';
  createdAt: string;
}

export const ROLE_BADGE: Record<AccountRole, string> = {
  GUEST: 'Khách',
  PARENT: 'Phụ huynh TH EDU',
  TEACHER: 'Giáo viên',
  ADVISOR: 'Tư vấn viên',
  MANAGER: 'Quản lý',
  ADMIN: 'Quản trị viên',
};

/** Pure: name rules shared with update_my_profile (unit-tested). Returns an error message or null. */
export function validateDisplayName(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 2 || v.length > 60) return 'Tên cần từ 2 đến 60 ký tự';
  if (/[<>{}]|https?:\/\//i.test(v)) return 'Tên không được chứa đường link hay ký tự đặc biệt';
  return null;
}

/** Pure: "1", "1.2" or "1.2.3" (same regex as app_release_config). */
export const isVersion = (v: string) => /^\d{1,6}(\.\d{1,6}){0,2}$/.test(v.trim());

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (hint === 'UNAUTHORIZED') return new ApiError(error.message, 'UNAUTHORIZED', 401);
  if (/my_account|update_my_profile|account_deletion|admin_release_config_save/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa có Trung tâm tài khoản. Chạy supabase/sql/upgrades/20261203090000_account_center.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

const toAccount = (a: Record<string, unknown>): MyAccount => ({
  role: a.role as MyAccount['role'],
  fullName: String(a.fullName ?? ''),
  phone: (a.phone as string | null) ?? null,
  email: (a.email as string | null) ?? null,
  avatarUrl: (a.avatarUrl as string | null) ?? null,
  campus: (a.campus as CampusLocation | null) ?? null,
  zaloLinked: !!a.zaloLinked,
  deletionPending: !!a.deletionPending,
});

// ─── Demo (no Supabase) ─────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const demoEdits: Record<string, Partial<MyAccount>> = {};
let demoRequests: DeletionRequest[] = [];
let demoRelease: Record<'android' | 'ios', ReleaseConfig> = {
  android: { platform: 'android', minSupportedVersion: '0.0.0', latestVersion: '0.1.0', storeUrl: '', releaseNotesVi: '', isForceUpdate: false },
  ios: { platform: 'ios', minSupportedVersion: '0.0.0', latestVersion: '0.1.0', storeUrl: '', releaseNotesVi: '', isForceUpdate: false },
};

async function demoAccount(): Promise<MyAccount> {
  const staff = useStaffStore.getState();
  let base: MyAccount;
  let key: string;
  if (staff.status === 'signedIn' && staff.isStaff) {
    const kind = await fetchMyKind();
    const role: MyAccount['role'] = staff.isAdmin ? 'ADMIN' : kind === 'ADVISOR' ? 'ADVISOR' : kind === 'MANAGER' ? 'MANAGER' : 'TEACHER';
    const local = (staff.email ?? '').split('@')[0];
    const name = role === 'ADMIN' ? 'Quản trị TH EDU' : local === 'co.huong' ? 'Cô Hường' : local === 'chi.mai' ? 'Chị Mai' : local || 'Nhân viên';
    key = staff.email ?? 'staff';
    base = { role, fullName: `${name} (mẫu)`, phone: role === 'ADMIN' ? null : '0987 111 222'.replace(/\s/g, ''), email: staff.email, avatarUrl: null, campus: role === 'ADMIN' ? null : 'XA_LA', zaloLinked: false, deletionPending: false };
  } else {
    const portal = useParentStore.getState().portal;
    key = 'parent';
    base = {
      role: 'PARENT',
      fullName: portal?.parent.fullName ?? 'Mẹ An (mẫu)',
      phone: portal?.parent.phone ?? '0912000111',
      email: null,
      avatarUrl: null,
      campus: portal?.students[0]?.campus ?? 'XA_LA',
      zaloLinked: true,
      deletionPending: false,
    };
  }
  const merged = { ...base, ...demoEdits[key] };
  merged.deletionPending = demoRequests.some((r) => r.status === 'PENDING' && r.contact === (merged.phone ?? merged.email ?? ''));
  return merged;
}
const demoKey = () => {
  const s = useStaffStore.getState();
  return s.status === 'signedIn' && s.isStaff ? s.email ?? 'staff' : 'parent';
};

// ─── API ────────────────────────────────────────────────────────────────────

export async function fetchMyAccount(): Promise<MyAccount> {
  if (!supabase) {
    await sleep(150);
    return demoAccount();
  }
  return toAccount(await rpc<Record<string, unknown>>('my_account'));
}

export async function updateMyProfile(fullName: string, avatarUrl: string | null): Promise<MyAccount> {
  const bad = validateDisplayName(fullName);
  if (bad) throw new ApiError(bad, 'VALIDATION', 422, 'fullName');
  if (!supabase) {
    await sleep(250);
    demoEdits[demoKey()] = { ...demoEdits[demoKey()], fullName: fullName.trim(), avatarUrl };
    return demoAccount();
  }
  return toAccount(await rpc<Record<string, unknown>>('update_my_profile', { p_full_name: fullName.trim(), p_avatar_url: avatarUrl }));
}

/** Upload a new avatar into avatars/<auth uid>/… and return its public URL (demo: the local preview URI). */
export async function uploadAvatar(media: PickedMedia, onProgress?: (f: number) => void): Promise<string> {
  if (!supabase) {
    await sleep(300);
    onProgress?.(1);
    return media.uri;
  }
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new ApiError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', 'UNAUTHORIZED', 401);
  const ext = media.type === 'image/png' ? 'png' : media.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/avatar-${Date.now()}.${ext}`;
  await uploadMedia(path, media, onProgress, 'avatars');
  return `${ENV.supabaseUrl}/storage/v1/object/public/avatars/${path}`;
}

export async function requestAccountDeletion(reason: string): Promise<MyAccount> {
  const r = reason.trim();
  if (r.length > 500) throw new ApiError('Lý do tối đa 500 ký tự', 'VALIDATION', 422, 'reason');
  if (!supabase) {
    await sleep(300);
    const me = await demoAccount();
    if (me.deletionPending) throw new ApiError('Yêu cầu xoá tài khoản đã được gửi, trung tâm đang xử lý', 'CONFLICT', 409);
    demoRequests = [{ id: `del-${Date.now()}`, role: me.role, displayName: me.fullName, contact: me.phone ?? me.email ?? '', reason: r || null, status: 'PENDING', createdAt: new Date().toISOString() }, ...demoRequests];
    return demoAccount();
  }
  return toAccount(await rpc<Record<string, unknown>>('request_account_deletion', { p_reason: r || null }));
}

export async function cancelAccountDeletion(): Promise<MyAccount> {
  if (!supabase) {
    await sleep(200);
    const me = await demoAccount();
    demoRequests = demoRequests.map((x) => (x.status === 'PENDING' && x.contact === (me.phone ?? me.email ?? '') ? { ...x, status: 'CANCELLED' } : x));
    return demoAccount();
  }
  return toAccount(await rpc<Record<string, unknown>>('cancel_account_deletion'));
}

export async function listDeletionRequests(status: DeletionRequest['status'] | null = 'PENDING'): Promise<DeletionRequest[]> {
  if (!supabase) {
    await sleep(200);
    return demoRequests.filter((r) => !status || r.status === status);
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = await rpc<any[]>('admin_deletion_requests', { p_status: status });
  return rows.map((r) => ({ id: r.id, role: r.role, displayName: r.display_name, contact: r.contact, reason: r.reason, status: r.status, createdAt: r.created_at }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function resolveDeletionRequest(id: string, status: 'DONE' | 'CANCELLED'): Promise<void> {
  if (!supabase) {
    await sleep(200);
    demoRequests = demoRequests.map((r) => (r.id === id ? { ...r, status } : r));
    return;
  }
  await rpc('admin_resolve_deletion', { p_id: id, p_status: status });
}

export async function fetchReleaseConfigs(): Promise<ReleaseConfig[]> {
  if (!supabase) {
    await sleep(150);
    return [demoRelease.android, demoRelease.ios];
  }
  const { data, error } = await supabase.from('app_release_config' as never).select('*').order('platform');
  if (error) throw mapDbError(error);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[]).map((r) => ({
    platform: r.platform,
    minSupportedVersion: r.min_supported_version,
    latestVersion: r.latest_version,
    storeUrl: r.store_url,
    releaseNotesVi: r.release_notes_vi,
    isForceUpdate: r.is_force_update,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function saveReleaseConfig(c: ReleaseConfig): Promise<void> {
  if (!isVersion(c.minSupportedVersion)) throw new ApiError('Phiên bản tối thiểu dạng 1.2.3', 'VALIDATION', 422, 'minSupportedVersion');
  if (!isVersion(c.latestVersion)) throw new ApiError('Phiên bản mới nhất dạng 1.2.3', 'VALIDATION', 422, 'latestVersion');
  if (c.storeUrl && !/^https:\/\//i.test(c.storeUrl)) throw new ApiError('Link cửa hàng phải bắt đầu bằng https://', 'VALIDATION', 422, 'storeUrl');
  if (!supabase) {
    await sleep(250);
    demoRelease = { ...demoRelease, [c.platform]: { ...c } };
    return;
  }
  await rpc('admin_release_config_save', {
    p_platform: c.platform,
    p_min_supported_version: c.minSupportedVersion.trim(),
    p_latest_version: c.latestVersion.trim(),
    p_store_url: c.storeUrl.trim(),
    p_release_notes_vi: c.releaseNotesVi.trim(),
    p_is_force_update: c.isForceUpdate,
  });
}
