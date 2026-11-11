/**
 * New-lead notifications. Runtime-agnostic (only uses fetch); config is injected so it's testable.
 *
 * Channels (each optional, enabled by config):
 *   • ZNS alert → each responsible admin's phone   (ZNS_ADMIN_TEMPLATE_ID + ADMIN_CONTACTS)
 *   • Generic webhook → staff group (n8n / Google Chat / Slack-style `text`)  (ADMIN_WEBHOOK_URL)
 *   • ZNS confirmation → parent's phone             (ZNS_PARENT_TEMPLATE_ID)
 *   • OA chat message → parent, if signed in with Zalo
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

import { formatDateLongVN, GIFT_BY_COURSE, PROMO_CODES, TIME_SLOTS, type CourseCode, type PromoCode } from './contracts.ts';
import {
  buildAdminWebhookBody,
  buildOaParentConfirmation,
  buildZnsAdminAlert,
  buildZnsBookingConfirmation,
  OA_CS_ENDPOINT,
  ZNS_ENDPOINT,
  type LeadNotificationInput,
} from './zaloPayloads.ts';

export interface AdminContact {
  name: string;
  phone: string;
  /** Course codes this admin handles; empty = all. */
  courses: string[];
}

export interface NotifyConfig {
  zaloAccessToken: string;
  znsAdminTemplateId: string;
  znsParentTemplateId: string;
  adminWebhookUrl: string;
  adminContacts: AdminContact[];
}

/** ADMIN_CONTACTS='[{"name":"Thầy Tú","phone":"09…","courses":["TOAN_TU_DUY"]}, …]' */
export function parseAdminContacts(raw: string): AdminContact[] {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list)
      ? list.filter((c) => c && typeof c.phone === 'string').map((c) => ({ name: String(c.name ?? ''), phone: c.phone, courses: Array.isArray(c.courses) ? c.courses : [] }))
      : [];
  } catch {
    return [];
  }
}

/** Admins responsible for the course; falls back to everyone if nobody matches. */
export function pickAdmins(contacts: AdminContact[], course: string): AdminContact[] {
  const matched = contacts.filter((c) => c.courses.length === 0 || c.courses.includes(course));
  return matched.length ? matched : contacts;
}

async function postZalo(url: string, token: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: token },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: number; message?: string };
  // Zalo answers HTTP 200 with a non-zero `error` on failure.
  if (!res.ok || json.error) throw new Error(`Zalo ${res.status}: ${json.error ?? ''} ${json.message ?? ''}`.trim());
  return 'sent';
}

async function postWebhook(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Webhook ${res.status}`);
  return 'sent';
}

interface LeadWithRefs {
  id: string;
  code: string;
  parent_name: string;
  phone_number: string;
  student_name: string;
  student_age: number;
  course_code: string;
  preferred_date: string | null;
  preferred_slot: string | null;
  source: string;
  zalo_user_id: string | null;
  promo_code: string | null;
  quiz_summary: { recommendation?: string; painPoints?: string[] } | null;
  category: { name: string } | null;
  branch: { short_code: string; name: string; address: string; maps_url: string } | null;
}

export function toNotificationInput(l: LeadWithRefs): LeadNotificationInput {
  return {
    leadId: l.id,
    code: l.code,
    parentName: l.parent_name,
    phone: l.phone_number,
    childName: l.student_name,
    childAge: l.student_age,
    course: l.category?.name ?? l.course_code,
    campus: l.branch ? `${l.branch.short_code} – ${l.branch.name}` : '',
    campusAddress: l.branch?.address ?? '',
    date: l.preferred_date ? formatDateLongVN(l.preferred_date) : 'Chưa chọn',
    slot: TIME_SLOTS.find((s) => s.id === l.preferred_slot)?.label ?? 'Chưa chọn',
    gift: GIFT_BY_COURSE[l.course_code as CourseCode] ?? '',
    mapsUrl: l.branch?.maps_url ?? '',
    source: l.source,
    quizRecommendation: l.quiz_summary?.recommendation,
    painPoints: l.quiz_summary?.painPoints,
    promo: l.promo_code ? PROMO_CODES[l.promo_code as PromoCode] : undefined,
  };
}

/** Send all configured notifications for a lead and record the outcome on the row. */
export async function notifyNewLead(db: SupabaseClient, leadId: string, cfg: NotifyConfig) {
  const { data, error } = await db
    .from('leads')
    .select('*, category:categories(name), branch:branches(short_code, name, address, maps_url)')
    .eq('id', leadId)
    .single();
  if (error || !data) {
    console.error('[notify] lead not found', leadId, error);
    return;
  }

  const lead = data as unknown as LeadWithRefs;
  const input = toNotificationInput(lead);
  const jobs: Record<string, Promise<string>> = {};

  if (cfg.zaloAccessToken && cfg.znsAdminTemplateId) {
    for (const admin of pickAdmins(cfg.adminContacts, lead.course_code)) {
      jobs[`zns_admin:${admin.name || admin.phone}`] = postZalo(
        ZNS_ENDPOINT,
        cfg.zaloAccessToken,
        buildZnsAdminAlert(input, admin.phone, cfg.znsAdminTemplateId),
      );
    }
  }
  if (cfg.adminWebhookUrl) {
    jobs.webhook_admin = postWebhook(cfg.adminWebhookUrl, buildAdminWebhookBody(input));
  }
  if (cfg.zaloAccessToken && cfg.znsParentTemplateId) {
    jobs.zns_parent = postZalo(ZNS_ENDPOINT, cfg.zaloAccessToken, buildZnsBookingConfirmation(input, cfg.znsParentTemplateId));
  }
  if (cfg.zaloAccessToken && lead.zalo_user_id) {
    jobs.oa_parent = postZalo(OA_CS_ENDPOINT, cfg.zaloAccessToken, buildOaParentConfirmation(input, lead.zalo_user_id));
  }

  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(Object.values(jobs));
  const log = Object.fromEntries(
    settled.map((s, i) => [names[i], s.status === 'fulfilled' ? s.value : String(s.reason)]),
  );
  if (names.length === 0) console.warn('[notify] no channels configured — lead saved without notification', lead.code);

  const { error: updErr } = await db
    .from('leads')
    .update({ notified_at: new Date().toISOString(), notification_log: log })
    .eq('id', leadId);
  if (updErr) console.error('[notify] failed to record log', updErr);
  console.log(`[notify] ${lead.code}`, log);
}
