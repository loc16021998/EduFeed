/**
 * Parent-side booking management (no account): status, reschedule, cancel.
 * Each call proves ownership with the booking's id (only known on this device) + the phone used to book;
 * the database functions parent_booking_status / parent_reschedule_booking / parent_cancel_booking check both.
 * Without Supabase (dev), changes are simulated on this device.
 */
import { supabase } from '@/lib/supabase';
import type { BookingRecord, LeadStatus } from '@/types';
import { sleep } from '@/utils/helpers';
import { TIME_SLOTS } from '@/utils/mockData';

import { isSlotValidForDate } from '../../supabase/functions/_shared/contracts';
import { ApiError } from './apiClient';

export interface BookingState {
  status: LeadStatus;
  preferredDate: string | null;
  preferredSlotId: string | null;
  appointmentTime: string | null;
  canChange: boolean;
  reschedulesLeft: number;
  checkedAt: string;
}

const CHANGEABLE: LeadStatus[] = ['NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H'];

function mapError(error: { message: string; hint?: string | null }): ApiError {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return new ApiError(error.message, 'VALIDATION', 422, hint.slice(11));
  if (hint === 'CONFLICT') return new ApiError(error.message, 'CONFLICT', 409);
  if (hint === 'RATE_LIMITED') return new ApiError(error.message, 'RATE_LIMITED', 429);
  if (hint === 'NOT_FOUND') return new ApiError(error.message, 'NOT_FOUND', 404);
  if (/parent_booking_status|parent_reschedule_booking|parent_cancel_booking/.test(error.message)) {
    return new ApiError('Máy chủ chưa hỗ trợ đổi / hủy lịch trong app. Ba mẹ vui lòng gọi hotline.', 'SERVICE_UNAVAILABLE');
  }
  if (/fetch|network/i.test(error.message)) return new ApiError('Mất kết nối mạng. Ba mẹ kiểm tra Internet rồi thử lại.', 'NETWORK');
  return new ApiError('Chưa thực hiện được, ba mẹ vui lòng thử lại.', 'INTERNAL');
}

interface Row {
  status: LeadStatus;
  preferred_date: string | null;
  preferred_slot: string | null;
  appointment_time: string | null;
  can_change?: boolean;
  reschedules_left: number;
}
const toState = (r: Row): BookingState => ({
  status: r.status,
  preferredDate: r.preferred_date,
  preferredSlotId: r.preferred_slot,
  appointmentTime: r.appointment_time,
  canChange: r.can_change ?? CHANGEABLE.includes(r.status),
  reschedulesLeft: r.reschedules_left,
  checkedAt: new Date().toISOString(),
});

/** Current state on the server; null when the booking is not there (e.g. made in demo mode). */
export async function fetchBookingState(b: BookingRecord, prev?: BookingState): Promise<BookingState | null> {
  if (!supabase) return mockState(b, prev);
  const { data, error } = await supabase.rpc('parent_booking_status', { p_id: b.id, p_phone: b.phone });
  if (error) {
    if (error.hint === 'NOT_FOUND') return null;
    throw mapError(error);
  }
  return toState(data as unknown as Row);
}

export async function rescheduleBooking(b: BookingRecord, date: string, slotId: string, prev?: BookingState): Promise<BookingState> {
  if (!isSlotValidForDate(slotId, date)) throw new ApiError('Khung giờ không hợp lệ cho ngày đã chọn', 'VALIDATION', 422, 'preferred_slot');
  if (!supabase) return mockReschedule(b, date, slotId, prev);
  const { data, error } = await supabase.rpc('parent_reschedule_booking', { p_id: b.id, p_phone: b.phone, p_date: date, p_slot: slotId });
  if (error) throw mapError(error);
  const r = data as unknown as Row;
  return toState({ ...r, can_change: CHANGEABLE.includes(r.status) });
}

export async function cancelBooking(b: BookingRecord, reason?: string, prev?: BookingState): Promise<BookingState> {
  if (!supabase) {
    await sleep(300);
    return { ...(prev ?? (await mockState(b))), status: 'CANCELLED', canChange: false, checkedAt: new Date().toISOString() };
  }
  const { error } = await supabase.rpc('parent_cancel_booking', { p_id: b.id, p_phone: b.phone, p_reason: reason ?? null });
  if (error) throw mapError(error);
  const fresh = await fetchBookingState(b);
  return fresh ?? { ...(prev as BookingState), status: 'CANCELLED', canChange: false };
}

/** Appointment start (local Date) from date + slot, for display / sorting. */
export function appointmentDate(date: string | null, slotId: string | null): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const start = TIME_SLOTS.find((s) => s.id === slotId)?.label.slice(0, 5) ?? '00:00';
  const [hh, mm] = start.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

// ─── Demo mode ──────────────────────────────────────────────────────────────

async function mockState(b: BookingRecord, prev?: BookingState): Promise<BookingState> {
  await sleep(200);
  const base = prev ?? {
    status: 'NEW' as LeadStatus,
    preferredDate: b.preferredDate,
    preferredSlotId: b.preferredSlotId,
    appointmentTime: appointmentDate(b.preferredDate, b.preferredSlotId)?.toISOString() ?? null,
    canChange: true,
    reschedulesLeft: 3,
    checkedAt: '',
  };
  const past = (appointmentDate(base.preferredDate, base.preferredSlotId)?.getTime() ?? 0) < Date.now();
  return { ...base, canChange: CHANGEABLE.includes(base.status) && !past, checkedAt: new Date().toISOString() };
}

async function mockReschedule(b: BookingRecord, date: string, slotId: string, prev?: BookingState): Promise<BookingState> {
  const cur = await mockState(b, prev);
  if (!cur.canChange) throw new ApiError('Lịch hẹn này không thể đổi nữa', 'CONFLICT', 409);
  if (cur.reschedulesLeft <= 0) throw new ApiError('Ba mẹ đã đổi lịch 3 lần. Vui lòng gọi hotline để được hỗ trợ.', 'RATE_LIMITED', 429);
  if (cur.preferredDate === date && cur.preferredSlotId === slotId) {
    throw new ApiError('Đây đã là lịch hiện tại của ba mẹ', 'VALIDATION', 422, 'preferred_slot');
  }
  const at = appointmentDate(date, slotId);
  if (!at || at.getTime() < Date.now() + 2 * 3600_000) {
    throw new ApiError('Vui lòng chọn giờ học thử cách thời điểm hiện tại ít nhất 2 giờ', 'VALIDATION', 422, 'preferred_slot');
  }
  return {
    ...cur,
    status: cur.status === 'REMINDED_24H' || cur.status === 'REMINDED_2H' ? 'CONFIRMED' : cur.status,
    preferredDate: date,
    preferredSlotId: slotId,
    appointmentTime: at.toISOString(),
    reschedulesLeft: cur.reschedulesLeft - 1,
  };
}
