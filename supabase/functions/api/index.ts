/**
 * TH EDU public API — Supabase Edge Function `api`.
 *
 *   GET  /api/feed?category=TOAN_TU_DUY&limit=10&cursor=…   → FeedPageResponse
 *   POST /api/leads/submit   (LeadSubmitRequest JSON)          → LeadSubmitResponse (201 | 200 duplicate)
 *
 * Deployed URL: https://<project-ref>.supabase.co/functions/v1/api/…
 * Deploy:       supabase functions deploy api
 * Secrets:      supabase secrets set ZALO_OA_ACCESS_TOKEN=… ZNS_ADMIN_TEMPLATE_ID=… ZNS_PARENT_TEMPLATE_ID=…
 *                 CENTRE_HOTLINE=0987xxxxxx ZNS_MODE=development (test; remove to go live)
 *                 ADMIN_WEBHOOK_URL=… ADMIN_CONTACTS='[{"name":"Thầy Tú","phone":"09…","courses":["TOAN_TU_DUY","BOI_DUONG_TOAN_TV"]},{"name":"Cô Hường","phone":"09…","courses":["TIEN_TIEU_HOC","LUYEN_CHU_DEP"]}]'
 * (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
 */
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import {
  COURSE_CODES,
  normalizePhone,
  validateLeadRequest,
  type ApiErrorBody,
  type ApiErrorCode,
  type FeedPageResponse,
  type LeadSubmitResponse,
  type VideoDTO,
} from '../_shared/contracts.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { notifyNewLead, parseAdminContacts, type NotifyConfig } from '../_shared/notify.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

const SUPABASE_URL = env('SUPABASE_URL');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

/** Service-role client: bypasses RLS — only used for lead submission + notification bookkeeping. */
const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
/** Anon client: RLS applies — used for public reads so policies stay the single source of truth. */
const publicDb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const notifyConfig: NotifyConfig = {
  zaloAccessToken: env('ZALO_OA_ACCESS_TOKEN'),
  znsAdminTemplateId: env('ZNS_ADMIN_TEMPLATE_ID'),
  znsParentTemplateId: env('ZNS_PARENT_TEMPLATE_ID'),
  znsMode: env('ZNS_MODE') === 'development' ? 'development' : 'production',
  centreHotline: env('CENTRE_HOTLINE'),
  adminWebhookUrl: env('ADMIN_WEBHOOK_URL'),
  adminContacts: parseAdminContacts(env('ADMIN_CONTACTS')),
};

// ─── Response helpers ───────────────────────────────────────────────────────

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function fail(code: ApiErrorCode, message: string, status: number, field?: string) {
  const body: ApiErrorBody = { error: { code, message, ...(field ? { field } : {}) } };
  return json(body, status);
}

// ─── Cursor (opaque base64url of "published_at|id") ─────────────────────────

const encodeCursor = (ts: string, id: string) =>
  btoa(`${ts}|${id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function decodeCursor(cursor: string): { ts: string; id: string } | null {
  try {
    const b64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const [ts, id] = atob(b64 + '==='.slice((b64.length + 3) % 4)).split('|');
    if (!ts || !id || Number.isNaN(Date.parse(ts))) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

// ─── GET /api/feed ──────────────────────────────────────────────────────────

interface VideoRow {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url: string;
  category_code: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  tags: string[];
  cta_text: string;
  cta_link: string | null;
  published_at: string;
  share_slug: string | null;
}

const toVideoDTO = (r: VideoRow): VideoDTO => ({
  id: r.id,
  title: r.title,
  videoUrl: r.video_url,
  thumbnailUrl: r.thumbnail_url,
  category: r.category_code as VideoDTO['category'],
  teacherName: r.teacher_name,
  teacherAvatar: r.teacher_avatar_url ?? '',
  tags: r.tags ?? [],
  ctaText: r.cta_text,
  ctaLink: r.cta_link ?? `thedu://booking?course=${r.category_code}`,
  publishedAt: r.published_at,
  shareSlug: r.share_slug ?? null,
});

async function handleFeed(url: URL): Promise<Response> {
  const category = url.searchParams.get('category');
  if (category && category !== 'ALL' && !(COURSE_CODES as readonly string[]).includes(category)) {
    return fail('BAD_REQUEST', 'Danh mục không hợp lệ', 400, 'category');
  }

  const limitRaw = Number(url.searchParams.get('limit') ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 10;

  const cursorParam = url.searchParams.get('cursor');
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) return fail('BAD_REQUEST', 'Cursor không hợp lệ', 400, 'cursor');

  // Ask for one extra row to know whether another page exists.
  const { data, error } = await publicDb.rpc('get_feed', {
    p_category_code: category && category !== 'ALL' ? category : null,
    p_limit: limit + 1,
    p_before_ts: cursor?.ts ?? null,
    p_before_id: cursor?.id ?? null,
  });
  if (error) throw error;

  const rows = (data ?? []) as VideoRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const body: FeedPageResponse = {
    items: page.map(toVideoDTO),
    nextCursor: rows.length > limit && last ? encodeCursor(last.published_at, last.id) : null,
  };
  return json(body, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });
}

// ─── POST /api/leads/submit ─────────────────────────────────────────────────

async function handleLeadSubmit(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('BAD_REQUEST', 'Body phải là JSON', 400);
  }

  const parsed = validateLeadRequest(body);
  if (!parsed.ok) return fail('VALIDATION', parsed.message, 422, parsed.field);
  const r = parsed.value;

  const { data, error } = await adminDb.rpc('submit_lead', {
    p: {
      id: r.id,
      parent_name: r.parentName.trim(),
      phone_number: normalizePhone(r.phone),
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
    // submit_lead raises with a machine-readable HINT.
    if (error.hint?.startsWith('VALIDATION:')) return fail('VALIDATION', error.message, 422, error.hint.slice(11));
    if (error.hint === 'RATE_LIMITED') return fail('RATE_LIMITED', error.message, 429);
    throw error;
  }

  const result = data as { id: string; code: string; created_at: string; duplicate: boolean };
  const response: LeadSubmitResponse = {
    id: result.id,
    code: result.code,
    createdAt: result.created_at,
    duplicate: result.duplicate,
    // Only promise a ZNS when everything needed to send one is configured.
    confirmation:
      notifyConfig.zaloAccessToken && notifyConfig.znsParentTemplateId && notifyConfig.centreHotline ? 'ZNS' : 'NONE',
  };

  // Notify admins without making the parent wait. Duplicates were already notified.
  if (!result.duplicate) {
    const task = notifyNewLead(adminDb, result.id, notifyConfig).catch((e) => console.error('[notify]', e));
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(task);
    else await task;
  }

  return json(response, result.duplicate ? 200 : 201);
}

// ─── Router ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Supabase passes "/api/feed"; strip everything up to and including the function name.
  const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, '') || '/';

  try {
    switch (path) {
      case '/feed':
        return req.method === 'GET' ? await handleFeed(url) : fail('METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET', 405);
      case '/leads/submit':
        return req.method === 'POST' ? await handleLeadSubmit(req) : fail('METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ POST', 405);
      default:
        return fail('NOT_FOUND', `Không tìm thấy ${path}`, 404);
    }
  } catch (e) {
    console.error('[api]', path, e);
    return fail('INTERNAL', 'Đã có lỗi xảy ra, vui lòng thử lại sau.', 500);
  }
});
