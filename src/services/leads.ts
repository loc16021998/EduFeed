/**
 * Lead submission.
 *  - Supabase configured → POST /api/leads/submit (Edge Function): server-side validation,
 *    idempotent insert via `submit_lead()`, rate limiting, then Zalo ZNS / webhook alerts to admins.
 *  - Not configured → in-app mock with realistic latency (dev / demo).
 */
import { supabase } from '@/lib/supabase';
import type { BookingPayload, BookingRecord } from '@/types';
import { CAMPUS_LABELS, CATEGORY_LABELS, GIFT_BY_COURSE } from '@/utils/constants';
import { normalizePhone, sleep, uuidv4 } from '@/utils/helpers';
import { CAMPUSES, TIME_SLOTS } from '@/utils/mockData';
import { formatDateLong } from '@/utils/schedule';

import type { LeadSubmitRequest, LeadSubmitResponse } from '../../supabase/functions/_shared/contracts';
import { ApiError, callApi } from './apiClient';
import { bookingCode } from './zalo';

export { ApiError as LeadSubmitError };

/** Enrich the raw form payload into a full record (id, code, display labels) for the success screen. */
export function buildLeadRecord(payload: BookingPayload, id = uuidv4()): BookingRecord {
  const campus = CAMPUSES.find((c) => c.id === payload.selectedCampus);
  return {
    ...payload,
    phone: normalizePhone(payload.phone),
    parentName: payload.parentName.trim(),
    studentName: payload.studentName.trim(),
    id,
    code: bookingCode(id),
    createdAt: new Date().toISOString(),
    status: 'NEW',
    display: {
      course: CATEGORY_LABELS[payload.selectedCourse],
      campus: campus ? `${campus.code} – ${campus.name}` : CAMPUS_LABELS[payload.selectedCampus],
      campusAddress: campus?.address ?? '',
      date: formatDateLong(payload.preferredDate),
      slot: TIME_SLOTS.find((s) => s.id === payload.preferredSlotId)?.label ?? payload.preferredSlotId,
      gift: GIFT_BY_COURSE[payload.selectedCourse],
      mapsUrl: campus?.mapUrl ?? '',
    },
  };
}

export function toSubmitRequest(r: BookingRecord): LeadSubmitRequest {
  return {
    id: r.id,
    parentName: r.parentName,
    phone: r.phone,
    studentName: r.studentName,
    studentAge: r.childAge,
    courseCode: r.selectedCourse,
    branchLocation: r.selectedCampus,
    preferredDate: r.preferredDate,
    preferredSlotId: r.preferredSlotId,
    source: r.source,
    ...(r.sourceRef ? { sourceRef: r.sourceRef } : {}),
    ...(r.zaloUserId ? { zaloUserId: r.zaloUserId } : {}),
    ...(r.promoCode ? { promoCode: r.promoCode } : {}),
    ...(r.quizAnswers ? { quizAnswers: r.quizAnswers } : {}),
    ...(r.quizSummary ? { quizSummary: r.quizSummary } : {}),
  };
}

/**
 * Submit a lead. Pass the same `idempotencyKey` when retrying after a network error so a
 * request that actually reached the server isn't recorded twice.
 */
export async function submitLead(payload: BookingPayload, idempotencyKey?: string): Promise<BookingRecord> {
  const record = buildLeadRecord(payload, idempotencyKey);

  if (!supabase) {
    await sleep(1200);
    return record;
  }

  const request = toSubmitRequest(record);
  try {
    const res = await callApi<LeadSubmitResponse>('leads/submit', { method: 'POST', body: request });
    return { ...record, id: res.id, code: res.code, createdAt: res.createdAt };
  } catch (e) {
    // Edge Function not deployed yet → save the lead directly. Staff notifications (Zalo/webhook)
    // only happen via the function, so these leads keep notified_at = null until it is deployed.
    if (e instanceof ApiError && e.code === 'FUNCTION_UNAVAILABLE') {
      const res = await submitLeadViaRpc(request);
      return { ...record, id: res.id, code: res.code, createdAt: res.createdAt };
    }
    throw e;
  }
}

/** Same insert the Edge Function performs, via the `submit_lead()` database function (anon-callable). */
async function submitLeadViaRpc(r: LeadSubmitRequest): Promise<LeadSubmitResponse> {
  if (!supabase) throw new ApiError('Chưa kết nối máy chủ', 'NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('submit_lead', {
    p: {
      id: r.id,
      parent_name: r.parentName.trim(),
      phone_number: r.phone,
      student_name: r.studentName.trim(),
      student_age: r.studentAge,
      course_code: r.courseCode,
      branch_location: r.branchLocation,
      preferred_date: r.preferredDate,
      preferred_slot: r.preferredSlotId,
      source: r.source,
      source_ref: r.sourceRef ?? null,
      zalo_user_id: r.zaloUserId ?? null,
      promo_code: r.promoCode ?? null,
      quiz_answers: r.quizAnswers ?? null,
      quiz_summary: r.quizSummary ?? null,
    },
  });
  if (error) {
    if (error.hint?.startsWith('VALIDATION:')) throw new ApiError(error.message, 'VALIDATION', 422, error.hint.slice(11));
    if (error.hint === 'RATE_LIMITED') throw new ApiError(error.message, 'RATE_LIMITED', 429);
    throw new ApiError('Không gửi được đăng ký. Ba mẹ vui lòng thử lại hoặc gọi hotline.', 'INTERNAL');
  }
  const d = data as { id: string; code: string; created_at: string; duplicate: boolean };
  return { id: d.id, code: d.code, createdAt: d.created_at, duplicate: d.duplicate };
}
