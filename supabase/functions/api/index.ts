/**
 * TH EDU API — Supabase Edge Function `api`.
 *
 * Public (parents, anonymous):
 *   GET  /api/feed?category=TOAN_TU_DUY&limit=10&cursor=…   → FeedPageResponse
 *   POST /api/leads/submit   (LeadSubmitRequest)             → LeadSubmitResponse (201 | 200 duplicate)
 *
 * Admin (Authorization: Bearer <admin user JWT>, app_metadata.role = 'admin'):
 *   POST /api/admin/users                 (CreateStaffRequest) → StaffAccountDTO (201)
 *   POST /api/admin/users/:id/password    { password }        → { id }
 *
 * Staff (Authorization: Bearer <staff or admin user JWT>, app_metadata.role = 'staff' | 'admin'):
 *   POST /api/leads/:id/complete-trial  (CompleteTrialRequest)  → CompleteTrialResponse
 *   POST /api/leads/:id/status          (SetLeadStatusRequest)  → { id, status }
 *
 * Scheduler (pg_cron every 15 min, header x-cron-secret: CRON_SECRET):
 *   POST /api/cron/reminders                                  → TickSummary
 *
 * Deployed URL: https://<project-ref>.supabase.co/functions/v1/api/…
 * Deploy:       supabase functions deploy api --no-verify-jwt   (auth is checked here, per route)
 * Secrets:      see .env.example ("Edge Function `api` secrets").
 * (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

import {
  COURSE_CODES,
  normalizePhone,
  STAFF_SETTABLE_STATUSES,
  staffPasswordProblem,
  validateCreateStaff,
  validateLeadRequest,
  type ApiErrorBody,
  type ApiErrorCode,
  type CompleteTrialResponse,
  type FeedPageResponse,
  type LeadSubmitResponse,
  type StaffAccountDTO,
  type VideoDTO,
} from '../_shared/contracts.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { notifyNewLead, parseAdminContacts, type NotifyConfig } from '../_shared/notify.ts';
import { runReminderTick, sendCrmMessage, type CrmDeps } from '../_shared/reminderCron.ts';
import { bearerToken, verifyCronSecret } from '../_shared/security.ts';
import { getAccessToken } from '../_shared/zaloToken.ts';
import { isQuietHour, sendZaloMessage, type MessagingConfig } from '../_shared/znsService.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

const SUPABASE_URL = env('SUPABASE_URL');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = env('CRON_SECRET');

/** Service-role client: bypasses RLS — lead submission, CRM bookkeeping, auth checks. */
const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
/** Anon client: RLS applies — used for public reads so policies stay the single source of truth. */
const publicDb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const ZNS_MODE = env('ZNS_MODE') === 'development' ? 'development' : 'production';

const notifyConfig: NotifyConfig = {
  zaloAccessToken: '', // resolved per request by liveConfig()
  znsAdminTemplateId: env('ZNS_ADMIN_TEMPLATE_ID'),
  znsMode: ZNS_MODE,
  adminWebhookUrl: env('ADMIN_WEBHOOK_URL'),
  adminContacts: parseAdminContacts(env('ADMIN_CONTACTS')),
};

/** Base config; the access token is resolved per request by liveConfig() (auto-refresh). */
const messagingConfig: MessagingConfig = {
  accessToken: '',
  templates: {
    // ZNS_PARENT_TEMPLATE_ID kept for backwards compatibility.
    CONFIRMATION: env('ZNS_TEMPLATE_CONFIRMATION') || env('ZNS_PARENT_TEMPLATE_ID'),
    REMINDER_24H: env('ZNS_TEMPLATE_REMINDER_24H'),
    REMINDER_2H: env('ZNS_TEMPLATE_REMINDER_2H'),
    POST_TRIAL: env('ZNS_TEMPLATE_POST_TRIAL'),
  },
  mode: ZNS_MODE,
  hotline: env('CENTRE_HOTLINE'),
  webUrl: env('WEB_URL').replace(/\/+$/, ''),
  voucherText: env('POST_TRIAL_VOUCHER'),
  voucherDays: Number(env('POST_TRIAL_VOUCHER_DAYS')) || 7,
};

/** Service-role RPC that throws on error. */
const rpc = async <T>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await adminDb.rpc(fn as never, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
};

/**
 * Configs + CRM deps with a currently valid Zalo access token (refreshed automatically when it is
 * close to expiry — see _shared/zaloToken.ts). Falls back to the static ZALO_OA_ACCESS_TOKEN secret.
 */
async function liveConfig(): Promise<{ messaging: MessagingConfig; notify: NotifyConfig; deps: CrmDeps }> {
  const token = await getAccessToken({
    rpc,
    fetch,
    now: () => new Date(),
    appId: env('ZALO_APP_ID'),
    appSecret: env('ZALO_APP_SECRET'),
    staticToken: env('ZALO_OA_ACCESS_TOKEN'),
  }).catch((e) => {
    console.error('[zalo-token]', e);
    return env('ZALO_OA_ACCESS_TOKEN');
  });
  return {
    messaging: { ...messagingConfig, accessToken: token },
    notify: { ...notifyConfig, zaloAccessToken: token },
    deps: { rpc, send: (plan) => sendZaloMessage(plan, token), now: () => new Date() },
  };
}

/** Run work after the response is sent (Supabase Edge Runtime), or inline elsewhere. */
async function inBackground(task: Promise<unknown>) {
  const guarded = task.catch((e) => console.error('[background]', e));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(guarded);
  else await guarded;
}

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

/** Map database errors raised with a HINT (VALIDATION:field, FORBIDDEN, CONFLICT, NOT_FOUND…) to HTTP. */
function failFromDb(error: { message: string; hint?: string | null }): Response | null {
  const hint = error.hint ?? '';
  if (hint.startsWith('VALIDATION:')) return fail('VALIDATION', error.message, 422, hint.slice(11));
  if (hint === 'RATE_LIMITED') return fail('RATE_LIMITED', error.message, 429);
  if (hint === 'FORBIDDEN') return fail('FORBIDDEN', error.message, 403);
  if (hint === 'CONFLICT') return fail('CONFLICT', error.message, 409);
  if (hint === 'NOT_FOUND') return fail('NOT_FOUND', error.message, 404);
  return null;
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ─── Staff authentication ───────────────────────────────────────────────────

/**
 * Verify the caller is a signed-in staff member. Returns a client acting AS that user, so the
 * database's own checks (is_staff(), RLS) apply too — defence in depth.
 */
async function requireStaff(req: Request): Promise<{ db: SupabaseClient; userId: string } | Response> {
  const token = bearerToken(req);
  if (!token) return fail('UNAUTHORIZED', 'Cần đăng nhập tài khoản nhân viên', 401);
  const { data, error } = await adminDb.auth.getUser(token);
  if (error || !data.user) return fail('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401);
  const role = (data.user.app_metadata as { role?: string } | undefined)?.role;
  if (role !== 'staff' && role !== 'admin') {
    return fail('FORBIDDEN', 'Tài khoản không có quyền nhân viên', 403);
  }
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { db, userId: data.user.id };
}

/** Verify the caller is an admin (manages staff accounts). */
async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const token = bearerToken(req);
  if (!token) return fail('UNAUTHORIZED', 'Cần đăng nhập tài khoản quản trị', 401);
  const { data, error } = await adminDb.auth.getUser(token);
  if (error || !data.user) return fail('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401);
  if ((data.user.app_metadata as { role?: string } | undefined)?.role !== 'admin') {
    return fail('FORBIDDEN', 'Chỉ quản trị viên được quản lý tài khoản', 403);
  }
  return { userId: data.user.id };
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
  const body = await readJson(req);
  if (!body) return fail('BAD_REQUEST', 'Body phải là JSON', 400);

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
      utm_source: r.utmSource ?? null,
      utm_medium: r.utmMedium ?? null,
      utm_campaign: r.utmCampaign ?? null,
    },
  });

  if (error) {
    const mapped = failFromDb(error);
    if (mapped) return mapped;
    throw error;
  }

  const result = data as { id: string; code: string; created_at: string; duplicate: boolean };
  const live = await liveConfig();
  const willConfirmByZns = !!(live.messaging.accessToken && live.messaging.templates.CONFIRMATION && live.messaging.hotline);
  const response: LeadSubmitResponse = {
    id: result.id,
    code: result.code,
    createdAt: result.created_at,
    duplicate: result.duplicate,
    // Only promise a ZNS when everything needed to send one is configured.
    confirmation: willConfirmByZns ? 'ZNS' : 'NONE',
  };

  // After responding: staff alerts + T+0 confirmation to the parent (logged in crm_logs;
  // success moves the lead NEW → CONFIRMED). Duplicates were already handled.
  if (!result.duplicate) {
    await inBackground(
      Promise.allSettled([
        notifyNewLead(adminDb, result.id, live.notify),
        sendCrmMessage(live.deps, live.messaging, result.id, 'CONFIRMATION'),
      ]),
    );
  }

  return json(response, result.duplicate ? 200 : 201);
}

// ─── POST /api/cron/reminders ───────────────────────────────────────────────

async function handleCronReminders(req: Request): Promise<Response> {
  if (!CRON_SECRET) return fail('SERVICE_UNAVAILABLE', 'CRON_SECRET chưa được cấu hình', 503);
  if (!(await verifyCronSecret(req, CRON_SECRET))) return fail('UNAUTHORIZED', 'Sai cron secret', 401);
  // Resolving the token here also refreshes it ahead of expiry, every tick.
  const live = await liveConfig();
  const summary = await runReminderTick(live.deps, live.messaging);
  console.log('[cron] reminders', JSON.stringify(summary));
  return json(summary);
}

// ─── POST /api/leads/:id/complete-trial ─────────────────────────────────────

async function handleCompleteTrial(req: Request, leadId: string): Promise<Response> {
  const staff = await requireStaff(req);
  if (staff instanceof Response) return staff;

  const body = await readJson(req);
  const note = typeof body?.teacherNote === 'string' ? body.teacherNote : '';
  const { data, error } = await staff.db.rpc('crm_complete_trial', { p_lead_id: leadId, p_teacher_note: note });
  if (error) {
    const mapped = failFromDb(error);
    if (mapped) return mapped;
    throw error;
  }

  const result = data as { id: string; status: 'COMPLETED_TRIAL'; post_trial_due_at: string };
  const now = new Date();
  const dueNow = new Date(result.post_trial_due_at) <= now && !isQuietHour(now);

  let postTrialMessage: CompleteTrialResponse['postTrialMessage'] = 'SCHEDULED';
  let detail: string | undefined;
  if (dueNow) {
    // Already ≥ 2h after the trial: send now instead of waiting for the next tick.
    const live = await liveConfig();
    const sent = await sendCrmMessage(live.deps, live.messaging, leadId, 'POST_TRIAL');
    postTrialMessage = sent.outcome === 'SENT' ? 'SENT' : sent.outcome === 'FAILED' ? 'FAILED' : sent.outcome === 'SKIPPED' ? 'SKIPPED' : 'SCHEDULED';
    detail = sent.detail;
  }

  const response: CompleteTrialResponse = {
    id: result.id,
    status: result.status,
    postTrialDueAt: result.post_trial_due_at,
    postTrialMessage,
    ...(detail ? { detail } : {}),
  };
  return json(response);
}

// ─── POST /api/leads/:id/status ─────────────────────────────────────────────

async function handleSetStatus(req: Request, leadId: string): Promise<Response> {
  const staff = await requireStaff(req);
  if (staff instanceof Response) return staff;

  const body = await readJson(req);
  const status = body?.status;
  if (typeof status !== 'string' || !(STAFF_SETTABLE_STATUSES as readonly string[]).includes(status)) {
    return fail('VALIDATION', `status phải là một trong: ${STAFF_SETTABLE_STATUSES.join(', ')}`, 422, 'status');
  }
  const note = typeof body?.note === 'string' ? body.note.slice(0, 1000) : null;
  const { data, error } = await staff.db.rpc('crm_set_status', { p_lead_id: leadId, p_status: status, p_note: note });
  if (error) {
    const mapped = failFromDb(error);
    if (mapped) return mapped;
    throw error;
  }
  return json(data);
}

// ─── Admin: staff accounts ──────────────────────────────────────────────────

async function handleCreateStaff(req: Request): Promise<Response> {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = validateCreateStaff(await readJson(req));
  if (!parsed.ok) return fail('VALIDATION', parsed.message, 422, parsed.field);
  const r = parsed.value;

  const { data, error } = await adminDb.auth.admin.createUser({
    email: r.email,
    password: r.password,
    email_confirm: true, // created by an admin: no confirmation e-mail round trip
    app_metadata: { role: r.role },
    user_metadata: r.displayName ? { display_name: r.displayName } : {},
  });
  if (error || !data.user) {
    const msg = error?.message ?? '';
    if (/already|registered|exists/i.test(msg)) return fail('CONFLICT', 'Email này đã có tài khoản', 409, 'email');
    if (/password/i.test(msg)) return fail('VALIDATION', 'Mật khẩu chưa đủ mạnh theo cấu hình Supabase', 422, 'password');
    throw error ?? new Error('createUser returned no user');
  }
  const u = data.user;
  const account: StaffAccountDTO = {
    id: u.id,
    email: u.email ?? r.email,
    role: r.role,
    displayName: r.displayName ?? null,
    createdAt: u.created_at,
    lastSignInAt: null,
  };
  console.log('[admin] account created', { by: admin.userId, id: u.id, role: r.role });
  return json(account, 201);
}

async function handleResetPassword(req: Request, userId: string): Promise<Response> {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const problem = staffPasswordProblem(body?.password);
  if (problem) return fail('VALIDATION', problem, 422, 'password');

  // Only accounts that are staff / admin — never arbitrary users.
  const { data: found, error: getErr } = await adminDb.auth.admin.getUserById(userId);
  if (getErr || !found.user) return fail('NOT_FOUND', 'Không tìm thấy tài khoản', 404);
  const role = (found.user.app_metadata as { role?: string } | undefined)?.role;
  if (role !== 'staff' && role !== 'admin') return fail('FORBIDDEN', 'Tài khoản này không phải nhân viên', 403);

  const { error } = await adminDb.auth.admin.updateUserById(userId, { password: body!.password as string });
  if (error) {
    if (/password/i.test(error.message)) return fail('VALIDATION', 'Mật khẩu chưa đủ mạnh theo cấu hình Supabase', 422, 'password');
    throw error;
  }
  console.log('[admin] password reset', { by: admin.userId, id: userId });
  return json({ id: userId });
}

// ─── Router ─────────────────────────────────────────────────────────────────

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LEAD_ACTION = new RegExp(`^/leads/(${UUID})/(complete-trial|status)$`, 'i');
const USER_PASSWORD = new RegExp(`^/admin/users/(${UUID})/password$`, 'i');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  // Supabase passes "/api/feed"; strip everything up to and including the function name.
  const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, '') || '/';
  const postOnly = () => fail('METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ POST', 405);

  try {
    if (path === '/feed') {
      return req.method === 'GET' ? await handleFeed(url) : fail('METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ GET', 405);
    }
    if (path === '/leads/submit') return req.method === 'POST' ? await handleLeadSubmit(req) : postOnly();
    if (path === '/cron/reminders') return req.method === 'POST' ? await handleCronReminders(req) : postOnly();

    if (path === '/admin/users') return req.method === 'POST' ? await handleCreateStaff(req) : postOnly();
    const pw = USER_PASSWORD.exec(path);
    if (pw) return req.method === 'POST' ? await handleResetPassword(req, pw[1]) : postOnly();

    const action = LEAD_ACTION.exec(path);
    if (action) {
      if (req.method !== 'POST') return postOnly();
      const [, leadId, op] = action;
      return op === 'complete-trial' ? await handleCompleteTrial(req, leadId) : await handleSetStatus(req, leadId);
    }

    return fail('NOT_FOUND', `Không tìm thấy ${path}`, 404);
  } catch (e) {
    console.error('[api]', path, e);
    return fail('INTERNAL', 'Đã có lỗi xảy ra, vui lòng thử lại sau.', 500);
  }
});
