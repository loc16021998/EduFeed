/**
 * Staff account management (admins only).
 *  - List / change role: database functions admin_list_staff() / admin_set_role() with the admin's session.
 *  - Create account / reset password: `api` Edge Function (needs the Auth admin API = service role,
 *    which must never be shipped in the app).
 * Without Supabase (dev), an in-memory list is used.
 */
import { supabase } from '@/lib/supabase';
import { sleep, uuidv4 } from '@/utils/helpers';

import {
  staffPasswordProblem,
  validateCreateStaff,
  type CreateStaffRequest,
  type StaffAccountDTO,
  type StaffRole,
} from '../../supabase/functions/_shared/contracts';
import { ApiError, callApi } from './apiClient';

export type { StaffAccountDTO as StaffAccount, StaffRole };
export { staffPasswordProblem };

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Quản trị',
  staff: 'Giáo viên / nhân viên',
};

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (/admin_list_staff|admin_set_role|function .* does not exist/i.test(error.message)) {
    return new ApiError('Cơ sở dữ liệu chưa được nâng cấp. Chạy supabase/sql/upgrades/20261117090000_admin_accounts.sql.', 'INTERNAL');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

/** Account creation / password reset run on the server; explain clearly when it isn't deployed yet. */
function functionError(e: unknown): never {
  if (e instanceof ApiError && (e.code === 'FUNCTION_UNAVAILABLE' || (e.code === 'NETWORK' && supabase))) {
    throw new ApiError(
      'Chưa bật được chức năng này: cần triển khai Edge Function "api" lên Supabase (xem hướng dẫn trong supabase/README.md, mục Staff accounts). Trong lúc chờ, có thể tạo tài khoản trong Supabase Dashboard.',
      'SERVICE_UNAVAILABLE',
    );
  }
  throw e;
}

export async function listStaff(): Promise<StaffAccountDTO[]> {
  if (!supabase) {
    await sleep(200);
    demo ??= demoAccounts();
    return [...demo];
  }
  const { data, error } = await supabase.rpc('admin_list_staff');
  if (error) throw mapDbError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    displayName: r.display_name,
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at,
  }));
}

export async function createStaff(req: CreateStaffRequest): Promise<StaffAccountDTO> {
  const parsed = validateCreateStaff(req);
  if (!parsed.ok) throw new ApiError(parsed.message, 'VALIDATION', 422, parsed.field);
  if (!supabase) return mockCreate(parsed.value);
  try {
    return await callApi<StaffAccountDTO>('admin/users', { method: 'POST', body: parsed.value });
  } catch (e) {
    return functionError(e);
  }
}

export async function resetStaffPassword(id: string, password: string): Promise<void> {
  const problem = staffPasswordProblem(password);
  if (problem) throw new ApiError(problem, 'VALIDATION', 422, 'password');
  if (!supabase) return sleep(250);
  try {
    await callApi<{ id: string }>(`admin/users/${id}/password`, { method: 'POST', body: { password } });
  } catch (e) {
    functionError(e);
  }
}

/** role 'none' revokes access (the account stays, but sees nothing). */
export async function setStaffRole(id: string, role: StaffRole | 'none'): Promise<void> {
  if (!supabase) return mockSetRole(id, role);
  const { error } = await supabase.rpc('admin_set_role', { p_user_id: id, p_role: role });
  if (error) throw mapDbError(error);
}

/** Readable random password: letters + digits, no look-alikes (0/O, 1/l/I). */
export function generatePassword(length = 10): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const rand = (n: number) => {
    const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
    if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] % n;
    return Math.floor(Math.random() * n);
  };
  const chars = [letters[rand(letters.length)], digits[rand(digits.length)]];
  while (chars.length < length) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// ─── Demo mode (no Supabase, dev only) ──────────────────────────────────────

let demo: StaffAccountDTO[] | null = null;

function demoAccounts(): StaffAccountDTO[] {
  const day = 86400_000;
  return [
    { id: uuidv4(), email: 'chu.trung.tam@thedu.vn', role: 'admin', displayName: 'Chủ trung tâm (mẫu)', createdAt: new Date(Date.now() - 60 * day).toISOString(), lastSignInAt: new Date(Date.now() - 3600_000).toISOString() },
    { id: uuidv4(), email: 'co.huong@thedu.vn', role: 'staff', displayName: 'Cô Hường (mẫu)', createdAt: new Date(Date.now() - 40 * day).toISOString(), lastSignInAt: new Date(Date.now() - 2 * day).toISOString() },
    { id: uuidv4(), email: 'thay.tu@thedu.vn', role: 'staff', displayName: 'Thầy Tú (mẫu)', createdAt: new Date(Date.now() - 20 * day).toISOString(), lastSignInAt: null },
  ];
}

async function mockCreate(r: CreateStaffRequest): Promise<StaffAccountDTO> {
  await sleep(400);
  demo ??= demoAccounts();
  if (demo.some((a) => a.email === r.email)) throw new ApiError('Email này đã có tài khoản', 'CONFLICT', 409, 'email');
  const acc: StaffAccountDTO = { id: uuidv4(), email: r.email, role: r.role, displayName: r.displayName ?? null, createdAt: new Date().toISOString(), lastSignInAt: null };
  demo = [...demo, acc];
  return acc;
}

async function mockSetRole(id: string, role: StaffRole | 'none') {
  await sleep(250);
  demo ??= demoAccounts();
  const target = demo.find((a) => a.id === id);
  if (!target) throw new ApiError('Không tìm thấy tài khoản', 'NOT_FOUND', 404);
  if (target.role === 'admin' && role !== 'admin' && demo.filter((a) => a.role === 'admin').length <= 1) {
    throw new ApiError('Phải còn ít nhất một quản trị viên', 'CONFLICT', 409);
  }
  demo = role === 'none' ? demo.filter((a) => a.id !== id) : demo.map((a) => (a.id === id ? { ...a, role } : a));
}
