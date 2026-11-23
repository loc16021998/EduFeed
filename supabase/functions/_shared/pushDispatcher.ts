/**
 * Push dispatcher — runs in the Edge Function (POST /api/cron/push, every minute). Never ships in the app:
 * it uses the service role and sees every device token.
 *
 * Flow (outbox pattern — app actions never wait for, or fail because of, push delivery):
 *   database triggers / push_enqueue_scheduled  → push_outbox (PENDING, de-duplicated)
 *   push_claim_batch   → rows + the recipient's enabled tokens + preferences (row-locked, skip locked)
 *   planPush           → send / skip (opted out, no device) / defer (quiet hours, promotions only)
 *   Expo Push API      → chunks of 100 messages; tickets mapped back to rows
 *   push_finish        → SENT / SKIPPED / FAILED (retried up to 3 attempts) / deferred
 *   push_disable_tokens← tokens Expo reports as DeviceNotRegistered (app uninstalled / token rotated)
 *
 * Dependencies are injected so the same code runs in Deno and in Node unit tests.
 */
import { isPushEvent, renderPush, type PushCategory, type PushParams } from './notificationTemplates.ts';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_CHUNK = 100;
export const MAX_ATTEMPTS = 3;
/** Quiet hours (Vietnam time): promotions wait until 07:00. Urgent / class updates are never delayed. */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 7;
const VN_OFFSET_MS = 7 * 3600_000;

export interface NotificationPrefs {
  allow_class_updates: boolean;
  allow_reminders_and_billing: boolean;
  allow_promotions_and_streaks: boolean;
  quiet_hours_enabled: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  allow_class_updates: true,
  allow_reminders_and_billing: true,
  allow_promotions_and_streaks: true,
  quiet_hours_enabled: true,
};

export interface OutboxRow {
  id: string;
  event_type: string;
  params: PushParams | null;
  category: PushCategory;
  urgent: boolean;
  attempts: number;
  tokens: string[] | null;
  prefs: Partial<NotificationPrefs> | null;
}

export type PushPlan = { send: true } | { skip: 'NO_DEVICE' | 'OPTED_OUT' | 'UNKNOWN_EVENT' } | { defer: Date };

const PREF_FOR: Record<PushCategory, keyof NotificationPrefs> = {
  CLASS: 'allow_class_updates',
  REMINDER: 'allow_reminders_and_billing',
  PROMO: 'allow_promotions_and_streaks',
};

/** Vietnam wall-clock hour of an instant. */
export const vnHour = (d: Date) => new Date(d.getTime() + VN_OFFSET_MS).getUTCHours();

/** Next 07:00 Vietnam time after `now`. */
export function nextQuietEnd(now: Date): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const target = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), QUIET_END_HOUR) - VN_OFFSET_MS;
  return new Date(target > now.getTime() ? target : target + 86400_000);
}

export const inQuietHours = (now: Date) => {
  const h = vnHour(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
};

/** Pure decision for one outbox row (unit-tested). */
export function planPush(row: OutboxRow, now: Date): PushPlan {
  if (!isPushEvent(row.event_type)) return { skip: 'UNKNOWN_EVENT' };
  const prefs = { ...DEFAULT_PREFS, ...(row.prefs ?? {}) };
  if (!prefs[PREF_FOR[row.category] ?? 'allow_class_updates']) return { skip: 'OPTED_OUT' };
  if (!row.tokens?.length) return { skip: 'NO_DEVICE' };
  if (row.category === 'PROMO' && !row.urgent && prefs.quiet_hours_enabled && inQuietHours(now)) return { defer: nextQuietEnd(now) };
  return { send: true };
}

export const chunk = <T,>(list: T[], size = EXPO_CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default' | null;
  channelId: string;
  priority: 'default' | 'high';
  ttl: number;
}

type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };

export interface PushDeps {
  /** Service-role RPC; must throw on error. */
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  fetch: typeof fetch;
  now: () => Date;
  /** Optional Expo access token (enhanced push security in the Expo dashboard). */
  expoAccessToken?: string;
}

export interface PushTickSummary {
  enqueued: number;
  claimed: number;
  sent: number;
  skipped: number;
  deferred: number;
  failed: number;
  invalidTokens: number;
}

export async function runPushTick(deps: PushDeps, opts: { batchSize?: number } = {}): Promise<PushTickSummary> {
  const now = deps.now();
  const summary: PushTickSummary = { enqueued: 0, claimed: 0, sent: 0, skipped: 0, deferred: 0, failed: 0, invalidTokens: 0 };
  summary.enqueued = (await deps.rpc<number | null>('push_enqueue_scheduled', { p_now: now.toISOString() })) ?? 0;

  const rows = (await deps.rpc<OutboxRow[] | null>('push_claim_batch', { p_limit: opts.batchSize ?? 200 })) ?? [];
  summary.claimed = rows.length;
  if (rows.length === 0) return summary;

  // 1) Plan each row; build one Expo message per device token.
  const messages: { rowId: string; msg: ExpoMessage }[] = [];
  const finished: { id: string; status: 'SENT' | 'SKIPPED' | 'FAILED' | 'DEFER'; detail: string | null; notBefore?: string }[] = [];
  for (const row of rows) {
    const plan = planPush(row, now);
    if ('skip' in plan) {
      finished.push({ id: row.id, status: 'SKIPPED', detail: plan.skip });
      summary.skipped++;
      continue;
    }
    if ('defer' in plan) {
      finished.push({ id: row.id, status: 'DEFER', detail: 'QUIET_HOURS', notBefore: plan.defer.toISOString() });
      summary.deferred++;
      continue;
    }
    const r = renderPush(row.event_type as never, row.params ?? {});
    for (const to of row.tokens ?? []) {
      messages.push({
        rowId: row.id,
        msg: {
          to,
          title: r.title,
          body: r.body,
          data: r.data as unknown as Record<string, unknown>,
          sound: r.category === 'PROMO' ? null : 'default',
          channelId: r.channelId,
          priority: r.urgent ? 'high' : 'default',
          // Stale reminders are useless: drop them if the phone is offline for long.
          ttl: r.urgent ? 3600 : 86400,
        },
      });
    }
  }

  // 2) Send in chunks of 100; map tickets back to rows and tokens.
  const okRows = new Set<string>();
  const errRows = new Map<string, string>();
  const invalid = new Set<string>();
  for (const part of chunk(messages)) {
    let tickets: ExpoTicket[] | null = null;
    let failure = '';
    try {
      const res = await deps.fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(deps.expoAccessToken ? { Authorization: `Bearer ${deps.expoAccessToken}` } : {}),
        },
        body: JSON.stringify(part.map((m) => m.msg)),
      });
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: { message?: string }[] } | null;
      if (res.ok && Array.isArray(json?.data)) tickets = json!.data!;
      else failure = `HTTP ${res.status}${json?.errors?.[0]?.message ? `: ${json.errors[0].message}` : ''}`;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    part.forEach((m, i) => {
      const t = tickets?.[i];
      if (t?.status === 'ok') okRows.add(m.rowId);
      else {
        const code = t && t.status === 'error' ? t.details?.error ?? t.message ?? 'ERROR' : failure || 'NO_TICKET';
        if (code === 'DeviceNotRegistered') invalid.add(m.msg.to);
        if (!errRows.has(m.rowId)) errRows.set(m.rowId, code);
      }
    });
  }

  // 3) Record outcomes: a row counts as SENT if at least one of the recipient's devices accepted it.
  const sentIds = new Set(messages.map((m) => m.rowId));
  for (const id of sentIds) {
    if (okRows.has(id)) {
      finished.push({ id, status: 'SENT', detail: errRows.has(id) ? `partial: ${errRows.get(id)}` : null });
      summary.sent++;
    } else {
      const detail = errRows.get(id) ?? 'UNKNOWN';
      // Only dead devices → nothing to retry.
      finished.push({ id, status: detail === 'DeviceNotRegistered' ? 'SKIPPED' : 'FAILED', detail });
      if (detail === 'DeviceNotRegistered') summary.skipped++;
      else summary.failed++;
    }
  }

  for (const f of finished) {
    await deps.rpc('push_finish', { p_id: f.id, p_status: f.status, p_detail: f.detail, p_not_before: f.notBefore ?? null });
  }
  if (invalid.size) {
    await deps.rpc('push_disable_tokens', { p_tokens: [...invalid] });
    summary.invalidTokens = invalid.size;
  }
  return summary;
}
