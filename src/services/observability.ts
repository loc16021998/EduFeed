/**
 * Centralised error / crash reporting — no native SDK, works on web, Android and iOS.
 *
 * Transports (both optional, chosen by env):
 *  - Sentry: events are posted to the DSN's envelope endpoint over plain HTTPS (the DSN is public by
 *    design). Trade-off vs @sentry/react-native: no native-crash capture (NDK / iOS signals) and no
 *    automatic breadcrumbs, but zero native setup and a tiny bundle. Native crashes are still visible
 *    in Play Console / App Store Connect.
 *  - Custom endpoint (PUBLIC_TELEMETRY_URL): the same event as JSON POST.
 * With neither configured, reports only go to the console in development.
 *
 * Privacy: every message, stack and context string is scrubbed — phone numbers, e-mails, JWT / API
 * keys, OTP-like codes and URL query strings are replaced before anything leaves the device. Context is
 * limited to: environment, app version, platform, screen name, role and campus. No user id, no name.
 */
import { Platform } from 'react-native';

import { ENV, ENV_ISSUES } from '@/config/env';

export type UserRole = 'PARENT' | 'TEACHER' | 'ADMIN' | 'STAFF' | 'GUEST';
export type Campus = 'XA_LA' | 'NGO_THI_NHAM';
export type ErrorArea = 'render' | 'global' | 'promise' | 'payment' | 'zns' | 'upload' | 'booking' | 'auth' | 'network' | 'config' | 'other';

export interface ObservabilityContext {
  role: UserRole;
  campus: Campus | null;
}

export interface ReportOptions {
  area?: ErrorArea;
  level?: 'fatal' | 'error' | 'warning';
  /** Extra non-PII tags, e.g. { method: 'VNPAY' }. Values are scrubbed too. */
  tags?: Record<string, string | number | boolean | null | undefined>;
}

export interface ErrorEvent {
  event_id: string;
  timestamp: number;
  level: 'fatal' | 'error' | 'warning';
  platform: 'javascript';
  environment: string;
  release: string;
  message: string;
  exception: { values: { type: string; value: string; stacktrace?: { frames: { function?: string; filename?: string; lineno?: number; colno?: number }[] } }[] };
  tags: Record<string, string>;
  contexts: { app: { app_version: string }; os: { name: string } };
}

// ─── Scrubbing (pure, unit-tested) ──────────────────────────────────────────

const SCRUBBERS: [RegExp, string][] = [
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]'],
  [/\b(sb_(?:secret|publishable)_[A-Za-z0-9_-]+|sk-ant-[A-Za-z0-9_-]+|sk_(?:live|test)_[A-Za-z0-9]+)\b/g, '[key]'],
  [/\b(bearer|token|apikey|api_key|access_token|refresh_token|password|otp)\b(["'\s:=]+)([^\s"'&,;]+)/gi, '$1$2[redacted]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  // Vietnamese phones in any common spelling: 0912345678, 0912 345 678, +84 912 345 678, 84912345678
  [/(?:\+?84|\b0)(?:[\s.-]?\d){9}\b/g, '[phone]'],
  // Query strings carry tokens / signed URLs / phone numbers: keep only the path.
  [/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/gi, '$1?[query]'],
];

export function scrub(text: string): string {
  let out = String(text ?? '');
  for (const [re, rep] of SCRUBBERS) out = out.replace(re, rep);
  return out.length > 4000 ? `${out.slice(0, 4000)}…` : out;
}

/** "at fn (file:line:col)" / "fn@file:line:col" → frames (top 30), file paths scrubbed. */
export function parseStack(stack: string | undefined): { function?: string; filename?: string; lineno?: number; colno?: number }[] {
  if (!stack) return [];
  const frames: { function?: string; filename?: string; lineno?: number; colno?: number }[] = [];
  for (const line of stack.split('\n').slice(0, 30)) {
    const m = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/) ?? line.match(/^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/);
    if (m) frames.push({ function: m[1] || undefined, filename: scrub(m[2]), lineno: Number(m[3]), colno: Number(m[4]) });
  }
  // Sentry expects the oldest frame first.
  return frames.reverse();
}

const uuid = () => 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

export function buildEvent(error: unknown, ctx: ObservabilityContext & { route: string | null }, opts: ReportOptions = {}): ErrorEvent {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : safeJson(error));
  const tags: Record<string, string> = {
    area: opts.area ?? 'other',
    role: ctx.role,
    campus: ctx.campus ?? 'unknown',
    route: ctx.route ?? 'unknown',
    platform: Platform.OS,
  };
  for (const [k, v] of Object.entries(opts.tags ?? {})) if (v !== undefined && v !== null) tags[k] = scrub(String(v)).slice(0, 200);
  const message = scrub(err.message || err.name || 'Unknown error');
  return {
    event_id: uuid(),
    timestamp: Date.now() / 1000,
    level: opts.level ?? 'error',
    platform: 'javascript',
    environment: ENV.appEnv,
    release: `thedu-companion@${ENV.appVersion}`,
    message,
    exception: { values: [{ type: err.name || 'Error', value: message, stacktrace: { frames: parseStack(err.stack) } }] },
    tags,
    contexts: { app: { app_version: ENV.appVersion }, os: { name: Platform.OS } },
  };
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)?.slice(0, 500) ?? String(v);
  } catch {
    return String(v);
  }
}

// ─── Context providers (set by the app shell; no store imports here → no cycles) ─

let currentRoute: string | null = null;
let contextProvider: () => ObservabilityContext = () => ({ role: 'GUEST', campus: null });

export const setCurrentRoute = (name: string | null | undefined) => {
  currentRoute = name ?? null;
};
export const setContextProvider = (fn: () => ObservabilityContext) => {
  contextProvider = fn;
};

// ─── Transport ──────────────────────────────────────────────────────────────

/** Max events per app session, and no repeat of the same error within 60 s (crash loops, retries). */
const SESSION_CAP = 30;
const DEDUPE_MS = 60_000;
let sent = 0;
const recent = new Map<string, number>();

function sentryEndpoint(dsn: string): { url: string; key: string } | null {
  const m = dsn.match(/^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/i);
  return m ? { url: `https://${m[2]}/api/${m[3]}/envelope/?sentry_key=${m[1]}&sentry_version=7`, key: m[1] } : null;
}

async function send(event: ErrorEvent): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  const sentry = ENV.sentryDsn ? sentryEndpoint(ENV.sentryDsn) : null;
  if (sentry) {
    const body = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
    jobs.push(fetch(sentry.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body }));
  }
  if (ENV.telemetryUrl) {
    jobs.push(fetch(ENV.telemetryUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) }));
  }
  // Reporting must never throw or block the UI.
  await Promise.allSettled(jobs);
}

export const isReportingEnabled = () => !!(ENV.sentryDsn || ENV.telemetryUrl);

/**
 * Report an unexpected error. Returns a short reference shown to the user ("Mã lỗi: ab12cd34") so the
 * centre can find it, or null when skipped (duplicate / cap reached). Never throws.
 */
export function reportError(error: unknown, opts: ReportOptions = {}): string | null {
  try {
    let ctx: ObservabilityContext;
    try {
      ctx = contextProvider();
    } catch {
      ctx = { role: 'GUEST', campus: null };
    }
    const event = buildEvent(error, { ...ctx, route: currentRoute }, opts);
    const key = `${event.tags.area}|${event.message}|${event.tags.route}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - DEDUPE_MS) return null;
    recent.set(key, now);
    if (sent >= SESSION_CAP) return null;
    sent++;
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[observability] ${event.tags.area}: ${event.message}`);
    if (isReportingEnabled()) void send(event);
    return event.event_id.slice(0, 8);
  } catch {
    return null;
  }
}

const EXPECTED_CODES = new Set(['BAD_REQUEST', 'VALIDATION', 'RATE_LIMITED', 'NOT_FOUND', 'CONFLICT', 'FORBIDDEN', 'UNAUTHORIZED', 'NETWORK', 'NOT_CONFIGURED']);

/**
 * Business outcomes the UI already explains (wrong OTP, invalid field, rate limit, offline, demo mode)
 * are not incidents. Server faults (INTERNAL, 5xx, function not deployed, unknown exceptions) are.
 */
export function isExpectedError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 500) return false;
  return typeof code === 'string' && EXPECTED_CODES.has(code);
}

/**
 * Wrap a key flow (payment, upload, ZNS / OTP…): reports unexpected failures and rethrows.
 * Expected business errors (validation, "wrong OTP", rate limit) are passed through `isExpected`
 * so they are not reported as incidents.
 */
export async function trackFailure<T>(area: ErrorArea, fn: () => Promise<T>, opts: { tags?: ReportOptions['tags']; isExpected?: (e: unknown) => boolean } = {}): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!opts.isExpected?.(e)) reportError(e, { area, tags: opts.tags });
    throw e;
  }
}

// ─── Global handlers ────────────────────────────────────────────────────────

type GlobalErrorUtils = { getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void };
type HermesTracker = { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void; onHandled?: () => void }) => void };

let installed = false;
/** Install once at startup: uncaught JS errors, unhandled promise rejections, config problems. */
export function initObservability(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as { ErrorUtils?: GlobalErrorUtils; HermesInternal?: HermesTracker; addEventListener?: Window['addEventListener'] };

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('error', (e) => reportError(e.error ?? e.message, { area: 'global', level: 'fatal' }));
    window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { area: 'promise' }));
  } else {
    const eu = g.ErrorUtils;
    if (eu) {
      const prev = eu.getGlobalHandler();
      eu.setGlobalHandler((e, isFatal) => {
        reportError(e, { area: 'global', level: isFatal ? 'fatal' : 'error' });
        prev(e, isFatal); // keep React Native's default (red box in dev, crash in release when fatal)
      });
    }
    // Hermes: unhandled promise rejections (dev keeps LogBox's own tracker).
    if (!__DEV__ && g.HermesInternal?.enablePromiseRejectionTracker) {
      g.HermesInternal.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: (_id, e) => reportError(e, { area: 'promise' }) });
    }
  }

  // Misconfigured production builds degrade (demo mode, hidden buttons) — make sure someone hears about it.
  if (ENV.appEnv !== 'development') {
    for (const i of ENV_ISSUES.filter((x) => x.level === 'error')) reportError(new Error(`Config ${i.key}: ${i.message}`), { area: 'config', level: 'warning' });
  }
}

/** Test hook: reset dedupe / cap state. */
export function __resetObservabilityForTests() {
  sent = 0;
  recent.clear();
}
