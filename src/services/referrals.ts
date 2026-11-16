/**
 * Referral & rewards (app side). Rules and amounts live in the database (referral_program, referral_rewards):
 *   checkReferralCode()   booking form, live: is this code usable and what does the new family get?
 *   fetchMyReferrals()    parent: code, program, stats, vouchers, invited friends
 *   admin*                program settings, referral list, using a voucher on an invoice
 * Without Supabase: in-memory sample data (labelled on screen).
 */
import { Platform } from 'react-native';

import { ENV } from '@/config/env';
import { supabase } from '@/lib/supabase';
import { sleep } from '@/utils/helpers';

import { REFERRAL_CODE_RE } from '../../supabase/functions/_shared/contracts';
import { ApiError } from './apiClient';

export type ReferralStatus = 'PENDING_TRIAL' | 'PENDING_PAYMENT' | 'REWARDED' | 'VOID';
export type VoucherStatus = 'AVAILABLE' | 'USED' | 'EXPIRED';

export interface ReferralProgram {
  active: boolean;
  referrerRewardVnd: number;
  refereeDiscountVnd: number;
  voucherValidDays: number;
}

export interface MyReferrals {
  code: string;
  program: ReferralProgram;
  stats: { invited: number; rewarded: number; earnedVnd: number };
  vouchers: { code: string; amountVnd: number; expiresAt: string; status: VoucherStatus; usedAt: string | null }[];
  friends: { name: string; status: ReferralStatus; rewardVnd: number | null; createdAt: string }[];
}

export interface AdminReferralRow {
  id: string;
  status: ReferralStatus;
  voidReason: string | null;
  createdAt: string;
  referrerName: string;
  referrerPhone: string;
  refereeName: string;
  refereePhone: string;
  promisedRewardVnd: number;
  voucherCode: string | null;
  voucherStatus: 'AVAILABLE' | 'USED' | null;
  notifiedAt: string | null;
}

export const normalizeReferralCode = (raw: string) => raw.replace(/\s/g, '').toUpperCase().slice(0, 12);
export const isReferralCodeShape = (code: string) => REFERRAL_CODE_RE.test(code);

function mapDbError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'FORBIDDEN') return new ApiError(error.message, 'FORBIDDEN', 403);
  if (hint === 'UNAUTHORIZED') return new ApiError(error.message, 'UNAUTHORIZED', 401);
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (/referral/i.test(error.message)) return new ApiError('Cơ sở dữ liệu chưa có chương trình giới thiệu. Chạy supabase/sql/upgrades/20261125090000_referral_rewards.sql.', 'INTERNAL');
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Không thực hiện được, vui lòng thử lại.', 'INTERNAL');
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn as never, args as never);
  if (error) throw mapDbError(error);
  return data as unknown as T;
}

/** Link to send friends: the booking form with the code pre-filled (+ UTM so it shows in the dashboard). */
export function referralShareLink(code: string): string {
  const base = ENV.webUrl || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/booking?ref=${code}&utm_source=referral&utm_medium=parent&utm_campaign=${code}`;
}

// ─── Booking form ───────────────────────────────────────────────────────────

export type CodeCheck = { valid: true; code: string; discountVnd: number } | { valid: false; reason: 'INACTIVE' | 'NOT_FOUND' | 'SHAPE' };

export async function checkReferralCode(raw: string): Promise<CodeCheck> {
  const code = normalizeReferralCode(raw);
  if (!isReferralCodeShape(code)) return { valid: false, reason: 'SHAPE' };
  if (!supabase) {
    await sleep(350);
    const d = demoProgram();
    if (!d.active) return { valid: false, reason: 'INACTIVE' };
    return DEMO_CODES.includes(code) ? { valid: true, code, discountVnd: d.refereeDiscountVnd } : { valid: false, reason: 'NOT_FOUND' };
  }
  const r = await rpc<{ valid: boolean; code?: string; discount_vnd?: number; reason?: 'INACTIVE' | 'NOT_FOUND' }>('referral_check', { p_code: code });
  return r.valid ? { valid: true, code: r.code ?? code, discountVnd: Number(r.discount_vnd ?? 0) } : { valid: false, reason: r.reason ?? 'NOT_FOUND' };
}

// ─── Parent ─────────────────────────────────────────────────────────────────

export async function fetchMyReferrals(): Promise<MyReferrals> {
  if (!supabase) {
    await sleep(250);
    return { ...demoMine(), program: demoProgram() };
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = await rpc<any>('parent_referrals');
  return {
    code: r.code,
    program: { active: !!r.program?.active, referrerRewardVnd: Number(r.program?.referrer_reward_vnd ?? 0), refereeDiscountVnd: Number(r.program?.referee_discount_vnd ?? 0), voucherValidDays: Number(r.program?.voucher_valid_days ?? 0) },
    stats: { invited: Number(r.stats?.invited ?? 0), rewarded: Number(r.stats?.rewarded ?? 0), earnedVnd: Number(r.stats?.earned_vnd ?? 0) },
    vouchers: (r.vouchers ?? []).map((v: any) => ({ code: v.code, amountVnd: Number(v.amount_vnd), expiresAt: v.expires_at, status: v.status, usedAt: v.used_at })),
    friends: (r.friends ?? []).map((f: any) => ({ name: f.name, status: f.status, rewardVnd: f.reward_vnd === null ? null : Number(f.reward_vnd), createdAt: f.created_at })),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export async function fetchProgram(): Promise<ReferralProgram> {
  if (!supabase) {
    await sleep(150);
    return { ...demoProgram() };
  }
  const { data, error } = await supabase.from('referral_program' as never).select('is_active, referrer_reward_vnd, referee_discount_vnd, voucher_valid_days').eq('id' as never, 1 as never).maybeSingle();
  if (error) throw mapDbError(error);
  const p = (data ?? {}) as { is_active?: boolean; referrer_reward_vnd?: number; referee_discount_vnd?: number; voucher_valid_days?: number };
  return { active: !!p.is_active, referrerRewardVnd: Number(p.referrer_reward_vnd ?? 0), refereeDiscountVnd: Number(p.referee_discount_vnd ?? 0), voucherValidDays: Number(p.voucher_valid_days ?? 180) };
}

export function programProblem(p: ReferralProgram): string | null {
  if (!Number.isInteger(p.referrerRewardVnd) || p.referrerRewardVnd < 0 || p.referrerRewardVnd > 10_000_000) return 'Quà cho người giới thiệu từ 0 đến 10.000.000đ';
  if (!Number.isInteger(p.refereeDiscountVnd) || p.refereeDiscountVnd < 0 || p.refereeDiscountVnd > 10_000_000) return 'Ưu đãi học viên mới từ 0 đến 10.000.000đ';
  if (!Number.isInteger(p.voucherValidDays) || p.voucherValidDays < 7 || p.voucherValidDays > 730) return 'Hạn dùng voucher từ 7 đến 730 ngày';
  return null;
}

export async function updateProgram(p: ReferralProgram): Promise<void> {
  const problem = programProblem(p);
  if (problem) throw new ApiError(problem, 'VALIDATION', 422);
  if (!supabase) {
    await sleep(200);
    demoProg = { ...p };
    return;
  }
  await rpc('admin_referral_program_update', { p_active: p.active, p_referrer_reward: p.referrerRewardVnd, p_referee_discount: p.refereeDiscountVnd, p_valid_days: p.voucherValidDays });
}

export async function adminListReferrals(): Promise<AdminReferralRow[]> {
  if (!supabase) {
    await sleep(200);
    return DEMO_ADMIN;
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = await rpc<any[]>('admin_referrals', { p_limit: 150 });
  return rows.map((r) => ({
    id: r.id, status: r.status, voidReason: r.void_reason, createdAt: r.created_at, referrerName: r.referrer_name, referrerPhone: r.referrer_phone,
    refereeName: r.referee_name, refereePhone: r.referee_phone, promisedRewardVnd: Number(r.promised_reward_vnd), voucherCode: r.voucher_code,
    voucherStatus: r.voucher_status, notifiedAt: r.notified_at,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Mark a voucher used by an invoice whose discount already includes it. */
export async function redeemVoucher(rewardId: string, invoiceId: string): Promise<void> {
  if (!supabase) {
    await sleep(150);
    return;
  }
  await rpc('referral_voucher_redeem', { p_reward_id: rewardId, p_invoice_id: invoiceId });
}

// ─── Demo ───────────────────────────────────────────────────────────────────

/** Demo: the sample parent's code (portal) is valid in the booking form. */
const DEMO_CODES = ['TH4F9A2C'];
let demoProg: ReferralProgram | null = null;
const demoProgram = (): ReferralProgram => (demoProg ??= { active: true, referrerRewardVnd: 200_000, refereeDiscountVnd: 150_000, voucherValidDays: 180 });
const ago = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
const ahead = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
function demoMine(): Omit<MyReferrals, 'program'> {
  return {
    code: 'TH4F9A2C',
    stats: { invited: 3, rewarded: 1, earnedVnd: 200_000 },
    vouchers: [{ code: 'GT7C1E09A2', amountVnd: 200_000, expiresAt: ahead(150), status: 'AVAILABLE', usedAt: null }],
    friends: [
      { name: 'Nam (mẫu)', status: 'REWARDED', rewardVnd: 200_000, createdAt: ago(40) },
      { name: 'Mai (mẫu)', status: 'PENDING_TRIAL', rewardVnd: null, createdAt: ago(3) },
      { name: 'Hoa (mẫu)', status: 'PENDING_PAYMENT', rewardVnd: null, createdAt: ago(12) },
    ],
  };
}
const DEMO_ADMIN: AdminReferralRow[] = [
  { id: 'demo-ref-1', status: 'REWARDED', voidReason: null, createdAt: ago(40), referrerName: 'Mẹ An (mẫu)', referrerPhone: '0912000111', refereeName: 'Trần Văn Nam (mẫu)', refereePhone: '0977222333', promisedRewardVnd: 200_000, voucherCode: 'GT7C1E09A2', voucherStatus: 'AVAILABLE', notifiedAt: ago(39) },
  { id: 'demo-ref-2', status: 'PENDING_PAYMENT', voidReason: null, createdAt: ago(12), referrerName: 'Mẹ An (mẫu)', referrerPhone: '0912000111', refereeName: 'Phạm Hoa (mẫu)', refereePhone: '0977333444', promisedRewardVnd: 200_000, voucherCode: null, voucherStatus: null, notifiedAt: null },
  { id: 'demo-ref-3', status: 'PENDING_TRIAL', voidReason: null, createdAt: ago(3), referrerName: 'Mẹ An (mẫu)', referrerPhone: '0912000111', refereeName: 'Nguyễn Thị Mai (mẫu)', refereePhone: '0977111222', promisedRewardVnd: 200_000, voucherCode: null, voucherStatus: null, notifiedAt: null },
];
