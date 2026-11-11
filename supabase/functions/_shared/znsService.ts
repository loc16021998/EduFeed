/**
 * Messaging gateway for parent-facing CRM messages (Zalo ZNS + Zalo OA).
 *
 *   T+0     CONFIRMATION   booking confirmation              (right after the lead is saved)
 *   T-24h   REMINDER_24H   day-before reminder + video link  (cron)
 *   T-2h    REMINDER_2H    near-time reminder + Google Maps  (cron)
 *   T+2h    POST_TRIAL     teacher feedback + voucher        (cron, after a teacher completes the trial)
 *
 * Server-side only (Edge Function): the Zalo access token must never reach the app bundle.
 * Pure functions (template mapping, delivery planning) are separated from I/O so they can be unit-tested.
 *
 * ZNS template params MUST match the templates approved on Zalo exactly. Defaults below:
 *   CONFIRMATION  C_NAME, STUDENT_NAME, CAMPUS, TIME, PHONE
 *   REMINDER_24H  C_NAME, STUDENT_NAME, TIME, CAMPUS, VIDEO_URL
 *   REMINDER_2H   C_NAME, STUDENT_NAME, TIME, ADDRESS, MAPS_URL, PHONE
 *   POST_TRIAL    C_NAME, STUDENT_NAME, TEACHER_NOTE, VOUCHER, EXPIRY, PHONE
 */
import { formatDateLongVN } from './contracts.ts';
import { OA_CS_ENDPOINT, toZaloPhone, ZNS_ENDPOINT, type OaTextMessage, type ZnsMode, type ZnsPayload } from './zaloPayloads.ts';

export const CRM_MESSAGE_KINDS = ['CONFIRMATION', 'REMINDER_24H', 'REMINDER_2H', 'POST_TRIAL'] as const;
export type CrmMessageKind = (typeof CRM_MESSAGE_KINDS)[number];

/** Shape returned by the `crm_lead_context()` database function. */
export interface LeadContext {
  id: string;
  code: string;
  status: string;
  parent_name: string;
  phone_number: string;
  student_name: string;
  student_age: number;
  course_code: string;
  course_name: string;
  appointment_time: string | null;
  slot_label: string | null;
  zalo_user_id: string | null;
  teacher_note: string | null;
  trial_completed_at: string | null;
  branch: { code: string; short_code: string; name: string; address: string; maps_url: string };
  latest_video_slug: string | null;
}

export interface MessagingConfig {
  accessToken: string;
  /** One approved ZNS template per message kind; empty = not configured. */
  templates: Record<CrmMessageKind, string>;
  mode: ZnsMode;
  /** Centre hotline (template param PHONE). */
  hotline: string;
  /** Public web app address — video links in the T-24h reminder. */
  webUrl: string;
  /** Real offer text for the post-trial message, e.g. "Giảm 10% học phí khóa đầu". Empty = don't send. */
  voucherText: string;
  /** Voucher validity in days after the trial. */
  voucherDays: number;
}

export type DeliveryPlan =
  | { channel: 'ZNS'; payload: ZnsPayload }
  | { channel: 'OA'; payload: OaTextMessage }
  | { skip: string };

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

// ─── Formatting (Vietnam time, UTC+7, no DST) ───────────────────────────────

const VN_OFFSET_MS = 7 * 3600_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** "17:30" and "Thứ Năm, 12/11/2026" for an ISO timestamp, in Vietnam time. */
export function vnParts(iso: string): { time: string; date: string; dayMonthYear: string; hour: number } {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  const isoDate = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return {
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    date: formatDateLongVN(isoDate),
    dayMonthYear: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    hour: d.getUTCHours(),
  };
}

/** Post-trial (promotional) messages are only sent 07:00–20:59 Vietnam time. Mirrors crm_due_messages(). */
export const isQuietHour = (now: Date) => {
  const h = vnParts(now.toISOString()).hour;
  return h < 7 || h > 20;
};

/** ZNS params are short text fields — keep values within a safe length. */
const param = (v: string, max = 100) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

const isZaloMobile = (p: string) => /^84[35789]\d{8}$/.test(p);

// ─── Template data per message kind ─────────────────────────────────────────

type Built = { data: Record<string, string>; text: string } | { missing: string };

export function buildMessage(kind: CrmMessageKind, ctx: LeadContext, cfg: MessagingConfig): Built {
  const when = ctx.appointment_time ? vnParts(ctx.appointment_time) : null;
  const campus = `${ctx.branch.short_code} – ${ctx.branch.name}`;
  const name = param(ctx.parent_name, 30);
  const child = param(ctx.student_name, 30);
  const hotline = cfg.hotline.replace(/\s+/g, '');

  switch (kind) {
    case 'CONFIRMATION': {
      if (!hotline) return { missing: 'CENTRE_HOTLINE' };
      const time = when ? `${ctx.slot_label ?? when.time}, ${when.date}` : 'Trung tâm sẽ gọi để xếp lịch';
      return {
        data: { C_NAME: name, STUDENT_NAME: child, CAMPUS: param(campus), TIME: param(time), PHONE: hotline },
        text: `Chào ${ctx.parent_name}! TH EDU đã nhận đăng ký học thử ${ctx.course_name} của bé ${ctx.student_name} (mã ${ctx.code}).\n🗓 ${time}\n📍 ${campus}\n☎️ ${hotline}`,
      };
    }
    case 'REMINDER_24H': {
      if (!when) return { missing: 'appointment_time' };
      if (!cfg.webUrl) return { missing: 'WEB_URL' };
      const videoUrl = `${cfg.webUrl}${ctx.latest_video_slug ? `/v/${ctx.latest_video_slug}` : '/feed'}`;
      const time = `${ctx.slot_label ?? when.time}, ${when.date}`;
      return {
        data: { C_NAME: name, STUDENT_NAME: child, TIME: param(time), CAMPUS: param(campus), VIDEO_URL: videoUrl },
        text: `Nhắc lịch: ngày mai bé ${ctx.student_name} có buổi học thử ${ctx.course_name} lúc ${time} tại ${campus}.\n🎬 Ba mẹ cho bé xem trước video bài học: ${videoUrl}`,
      };
    }
    case 'REMINDER_2H': {
      if (!when) return { missing: 'appointment_time' };
      if (!hotline) return { missing: 'CENTRE_HOTLINE' };
      if (!ctx.branch.maps_url) return { missing: 'branch maps_url' };
      return {
        data: {
          C_NAME: name,
          STUDENT_NAME: child,
          TIME: `${when.time} hôm nay`,
          ADDRESS: param(ctx.branch.address),
          MAPS_URL: ctx.branch.maps_url,
          PHONE: hotline,
        },
        text: `Còn khoảng 2 giờ nữa là buổi học thử của bé ${ctx.student_name} (${when.time} hôm nay).\n📍 ${ctx.branch.address}\n🗺 Chỉ đường: ${ctx.branch.maps_url}\n☎️ ${hotline}`,
      };
    }
    case 'POST_TRIAL': {
      if (!ctx.teacher_note) return { missing: 'teacher_note' };
      if (!cfg.voucherText) return { missing: 'POST_TRIAL_VOUCHER' };
      if (!hotline) return { missing: 'CENTRE_HOTLINE' };
      const base = ctx.trial_completed_at ?? ctx.appointment_time ?? new Date().toISOString();
      const expiry = vnParts(new Date(new Date(base).getTime() + cfg.voucherDays * 86400_000).toISOString()).dayMonthYear;
      return {
        data: {
          C_NAME: name,
          STUDENT_NAME: child,
          TEACHER_NOTE: param(ctx.teacher_note, 200),
          VOUCHER: param(cfg.voucherText, 80),
          EXPIRY: expiry,
          PHONE: hotline,
        },
        text: `Cảm ơn ba mẹ đã cho bé ${ctx.student_name} học thử tại TH EDU!\n📝 Nhận xét của giáo viên: ${ctx.teacher_note}\n🎁 ${cfg.voucherText} — áp dụng đến ${expiry}.\n☎️ Đăng ký giữ chỗ: ${hotline}`,
      };
    }
  }
}

const TEMPLATE_ENV: Record<CrmMessageKind, string> = {
  CONFIRMATION: 'ZNS_TEMPLATE_CONFIRMATION',
  REMINDER_24H: 'ZNS_TEMPLATE_REMINDER_24H',
  REMINDER_2H: 'ZNS_TEMPLATE_REMINDER_2H',
  POST_TRIAL: 'ZNS_TEMPLATE_POST_TRIAL',
};

/**
 * Decide how (and whether) to deliver a message:
 *   approved ZNS template → ZNS to the parent's phone
 *   else, parent signed in with Zalo → OA consultation message
 *   else → skip, with a reason that ends up in crm_logs
 */
export function planDelivery(kind: CrmMessageKind, ctx: LeadContext, cfg: MessagingConfig): DeliveryPlan {
  if (!cfg.accessToken) return { skip: 'Chưa cấu hình ZALO_OA_ACCESS_TOKEN' };

  const built = buildMessage(kind, ctx, cfg);
  if ('missing' in built) return { skip: `Thiếu dữ liệu/cấu hình: ${built.missing}` };

  const templateId = cfg.templates[kind];
  if (templateId) {
    const phone = toZaloPhone(ctx.phone_number);
    if (!isZaloMobile(phone)) return { skip: `Số điện thoại không hợp lệ cho ZNS: ${ctx.phone_number}` };
    return {
      channel: 'ZNS',
      payload: {
        phone,
        template_id: templateId,
        template_data: built.data,
        // Unique per lead + kind: lets Zalo de-duplicate and links delivery reports back to crm_logs.
        tracking_id: `${ctx.id}:${kind}`,
        ...(cfg.mode === 'development' ? { mode: 'development' as const } : {}),
      },
    };
  }
  if (ctx.zalo_user_id) {
    return { channel: 'OA', payload: { recipient: { user_id: ctx.zalo_user_id }, message: { text: built.text } } };
  }
  return { skip: `Chưa cấu hình mẫu ZNS (${TEMPLATE_ENV[kind]}) và phụ huynh chưa liên kết Zalo OA` };
}

// ─── I/O: send to Zalo ──────────────────────────────────────────────────────

/** POST to Zalo with a timeout. Zalo replies HTTP 200 with `error: 0` on success, non-zero on failure. */
export async function sendZaloMessage(
  plan: Exclude<DeliveryPlan, { skip: string }>,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(plan.channel === 'ZNS' ? ZNS_ENDPOINT : OA_CS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: accessToken },
      body: JSON.stringify(plan.payload),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: number;
      message?: string;
      data?: { msg_id?: string; message_id?: string };
    };
    if (res.ok && body.error === 0) {
      return { ok: true, providerMessageId: body.data?.msg_id ?? body.data?.message_id };
    }
    return { ok: false, error: `Zalo ${res.status}${body.error !== undefined ? ` error ${body.error}` : ''}: ${body.message ?? 'unknown'}` };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, error: aborted ? `timeout after ${timeoutMs}ms` : `network: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}
