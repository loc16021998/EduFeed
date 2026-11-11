// Single source of truth lives next to the Edge Function so Deno can import it too.
export * from '../../../supabase/functions/_shared/zaloPayloads';

import type { BookingRecord } from '@/types';
import type { LeadNotificationInput } from '../../../supabase/functions/_shared/zaloPayloads';
import { PROMO_CODES } from '../../../supabase/functions/_shared/contracts';

/** Map an app-side booking record to the notification input (handy for previews / tests). */
export function toNotificationInput(r: BookingRecord): LeadNotificationInput {
  return {
    leadId: r.id,
    code: r.code,
    parentName: r.parentName,
    phone: r.phone,
    childName: r.studentName,
    childAge: r.childAge,
    course: r.display.course,
    campus: r.display.campus,
    campusAddress: r.display.campusAddress,
    date: r.display.date,
    slot: r.display.slot,
    gift: r.display.gift,
    mapsUrl: r.display.mapsUrl,
    source: r.source,
    quizRecommendation: r.quizSummary?.recommendation,
    painPoints: r.quizSummary?.painPoints,
    promo: r.promoCode ? PROMO_CODES[r.promoCode] : undefined,
  };
}
