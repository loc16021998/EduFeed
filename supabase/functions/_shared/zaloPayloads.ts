/**
 * Zalo OA / ZNS payload builders — shared by the app and the `notify-lead` Edge Function.
 *
 * Keep this file dependency-free (no imports) so both Metro (React Native) and Deno
 * (Supabase Edge Functions) can load it as-is.
 *
 * ⚠️ Sending must happen server-side: Zalo OA access tokens must never ship in the app bundle.
 *
 * API references:
 *  - ZNS (template message to a phone number):
 *      POST https://business.openapi.zalo.me/message/template   header: access_token
 *  - OA consultation message to a follower (by Zalo user_id):
 *      POST https://openapi.zalo.me/v3.0/oa/message/cs           header: access_token
 */

export const ZNS_ENDPOINT = 'https://business.openapi.zalo.me/message/template';
export const OA_CS_ENDPOINT = 'https://openapi.zalo.me/v3.0/oa/message/cs';

/** Flat, label-only view of a lead — everything a notification needs. */
export interface LeadNotificationInput {
  leadId: string;
  code: string;
  parentName: string;
  phone: string;
  childName: string;
  childAge: number;
  course: string;
  campus: string;
  campusAddress: string;
  date: string;
  slot: string;
  gift: string;
  mapsUrl: string;
  source: string;
  quizRecommendation?: string;
  painPoints?: string[];
  /** Human label of a claimed in-app incentive. */
  promo?: string;
}

export interface ZnsPayload {
  phone: string;
  template_id: string;
  template_data: Record<string, string>;
  tracking_id: string;
}

export interface OaTextMessage {
  recipient: { user_id: string };
  message: { text: string };
}

// ─── Small pure helpers (also used by the app) ─────────────────────────────

/** 0912 345 678 / +84912345678 → 84912345678 (format Zalo APIs require). */
export function toZaloPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) return digits.slice(1);
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return `84${digits.slice(1)}`;
  return digits;
}

/** Google Maps turn-by-turn link that opens the native app when installed. */
export function buildMapsDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

/** Public Zalo OA link — opens the Zalo app if installed, else the web profile. */
export function buildZaloOAUrl(oaId: string): string {
  return `https://zalo.me/${oaId}`;
}

/** Short booking code from a UUID, e.g. "TH-7K2Q9M". */
export function bookingCode(leadId: string): string {
  return `TH-${leadId.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

// ─── Payload builders ───────────────────────────────────────────────────────

/**
 * ZNS confirmation sent to the parent's phone.
 * `template_data` keys must match the template approved on the Zalo Business account —
 * the "Chỉ đường" button is configured inside the template, using `maps_url`.
 */
export function buildZnsBookingConfirmation(input: LeadNotificationInput, templateId: string): ZnsPayload {
  return {
    phone: toZaloPhone(input.phone),
    template_id: templateId,
    template_data: {
      customer_name: input.parentName,
      booking_code: input.code,
      child_name: input.childName,
      course_name: input.course,
      schedule: `${input.slot}, ${input.date}`,
      campus: input.campus,
      address: input.campusAddress,
      gift: input.gift,
      maps_url: input.mapsUrl,
    },
    tracking_id: input.leadId,
  };
}

/**
 * ZNS alert to a centre administrator's phone (Thầy Tú / Cô Hường).
 * Requires a separate approved "admin alert" template.
 */
export function buildZnsAdminAlert(input: LeadNotificationInput, adminPhone: string, templateId: string): ZnsPayload {
  return {
    phone: toZaloPhone(adminPhone),
    template_id: templateId,
    template_data: {
      booking_code: input.code,
      parent_name: input.parentName,
      parent_phone: input.phone,
      child_name: `${input.childName} (${input.childAge} tuổi)`,
      course_name: input.course,
      campus: input.campus,
      schedule: `${input.slot}, ${input.date}`,
    },
    // tracking_id must be unique per message → suffix the admin phone.
    tracking_id: `${input.leadId}:${toZaloPhone(adminPhone)}`,
  };
}

/** Body for a generic admin webhook (n8n, Google Chat, Slack-compatible `text`). */
export function buildAdminWebhookBody(input: LeadNotificationInput) {
  return { text: formatAdminAlertText(input), lead: input };
}

/** Internal alert to the consultant on duty (must follow the OA). */
export function buildOaConsultantAlert(input: LeadNotificationInput, consultantUserId: string): OaTextMessage {
  return { recipient: { user_id: consultantUserId }, message: { text: formatAdminAlertText(input) } };
}

/** Plain-text lead summary for staff channels. */
export function formatAdminAlertText(input: LeadNotificationInput): string {
  const lines = [
    `🔔 LEAD MỚI ${input.code} (${input.source})`,
    `👩 PH: ${input.parentName} – ${input.phone}`,
    `🧒 Bé: ${input.childName}, ${input.childAge} tuổi`,
    `📚 ${input.course}`,
    `📍 ${input.campus}`,
    `🗓 ${input.slot}, ${input.date}`,
  ];
  if (input.quizRecommendation) lines.push(`🧩 Quiz: ${input.quizRecommendation}`);
  if (input.painPoints?.length) lines.push(`⚠️ Khó khăn: ${input.painPoints.join(', ')}`);
  if (input.promo) lines.push(`🎁 Đã nhận ưu đãi: ${input.promo} — nhớ gửi cho phụ huynh`);
  lines.push('→ Gọi xác nhận trong 2 giờ làm việc.');
  return lines.join('\n');
}

/** Confirmation to the parent inside the OA chat (only when we know their Zalo user_id). */
export function buildOaParentConfirmation(input: LeadNotificationInput, parentZaloUserId: string): OaTextMessage {
  const text = [
    `Chào ${input.parentName}! TH EDU đã nhận đăng ký học thử của bé ${input.childName} 🎉`,
    `• Mã đăng ký: ${input.code}`,
    `• Khóa học: ${input.course}`,
    `• Lịch: ${input.slot}, ${input.date}`,
    `• Địa điểm: ${input.campus} – ${input.campusAddress}`,
    `• Quà tặng: ${input.gift}`,
    `📍 Chỉ đường: ${input.mapsUrl}`,
    'Cô/thầy sẽ gọi xác nhận lịch trong thời gian sớm nhất. Hẹn gặp bé ở lớp nhé!',
  ].join('\n');
  return { recipient: { user_id: parentZaloUserId }, message: { text } };
}
