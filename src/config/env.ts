/**
 * Public runtime config, inlined at build time from `.env.local` / `.env` / the build server's env by
 * babel-plugin-transform-inline-environment-variables (native: babel.config.js, web: vite.config.mjs).
 * Only keys listed in scripts/env.js are inlined.
 *
 * PUBLIC vs SERVER-ONLY: everything here ships inside the app and can be read by anyone. The Supabase
 * anon / publishable key and a Sentry DSN are designed to be public. Service-role keys, VNPay / bank /
 * OTP secrets, Zalo tokens and the Anthropic key live ONLY in Supabase Edge Function secrets.
 *
 * Validation: `ENV_ISSUES` lists problems found at startup. Development shows them loudly (console.error
 * → red LogBox + a banner); production never crashes — it degrades (e.g. a malformed Supabase config
 * falls back to the clearly-labelled demo mode) and reports the issue to observability.
 *
 * After changing .env on native, restart Metro with `npm start -- --reset-cache`.
 */

export type AppEnv = 'development' | 'preview' | 'production';

export interface EnvIssue {
  key: string;
  level: 'error' | 'warning';
  message: string;
}

export interface PublicEnv {
  appEnv: AppEnv;
  appVersion: string;
  /** Unique per build (web OTA compares it with /version.json). */
  buildId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Zalo Official Account ID — used for the QR code / "Mở Zalo" link. */
  zaloOAId: string;
  /** Public address of the web app, e.g. https://app.thedu.vn — used for share links. */
  webUrl: string;
  /** Centre hotline for parents (digits only). Empty = call buttons hidden. */
  hotline: string;
  /** Sentry DSN (public by design). Empty = no Sentry. */
  sentryDsn: string;
  /** Optional custom error endpoint (JSON POST). */
  telemetryUrl: string;
}

export type RawEnv = Partial<Record<
  | 'PUBLIC_APP_ENV'
  | 'PUBLIC_APP_VERSION'
  | 'PUBLIC_BUILD_ID'
  | 'PUBLIC_SUPABASE_URL'
  | 'PUBLIC_SUPABASE_ANON_KEY'
  | 'PUBLIC_ZALO_OA_ID'
  | 'PUBLIC_WEB_URL'
  | 'PUBLIC_HOTLINE'
  | 'PUBLIC_SENTRY_DSN'
  | 'PUBLIC_TELEMETRY_URL',
  string | undefined
>>;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** base64url → string without relying on atob (not on every engine). */
function b64urlDecode(s: string): string {
  const clean = s.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const ch of clean) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

/** Role claim of a Supabase JWT key, or null when it is not a JWT. */
export function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(b64urlDecode(parts[1])) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

const isHttpsUrl = (v: string) => /^https:\/\/[^\s/$.?#][^\s]*$/i.test(v);
const isLocalUrl = (v: string) => /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?(\/.*)?$/i.test(v);

/** Pure: raw strings → typed config + issues. Unit-tested; never throws. */
export function parseEnv(raw: RawEnv, isDev: boolean): { env: PublicEnv; issues: EnvIssue[] } {
  const issues: EnvIssue[] = [];
  const s = (k: keyof RawEnv) => (raw[k] ?? '').trim();

  const appEnvRaw = s('PUBLIC_APP_ENV');
  const appEnv: AppEnv = appEnvRaw === 'production' || appEnvRaw === 'preview' || appEnvRaw === 'development' ? appEnvRaw : isDev ? 'development' : 'production';
  if (appEnvRaw && appEnvRaw !== appEnv) issues.push({ key: 'PUBLIC_APP_ENV', level: 'warning', message: `Giá trị "${appEnvRaw}" không hợp lệ (development | preview | production) — dùng "${appEnv}".` });

  // Supabase: both or neither. A half / malformed / secret config is dropped (→ demo mode), never used.
  let supabaseUrl = s('PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  let supabaseAnonKey = s('PUBLIC_SUPABASE_ANON_KEY');
  const dropSupabase = (key: string, message: string, level: EnvIssue['level'] = 'error') => {
    issues.push({ key, level, message });
    supabaseUrl = '';
    supabaseAnonKey = '';
  };
  if (supabaseUrl || supabaseAnonKey) {
    const role = jwtRole(supabaseAnonKey);
    if (/^sb_secret_/i.test(supabaseAnonKey) || role === 'service_role') {
      dropSupabase('PUBLIC_SUPABASE_ANON_KEY', 'Đây là khoá BÍ MẬT (service role / sb_secret_) — tuyệt đối không đưa vào app. Dùng anon / publishable key.');
    } else if (!supabaseUrl || !supabaseAnonKey) {
      dropSupabase(supabaseUrl ? 'PUBLIC_SUPABASE_ANON_KEY' : 'PUBLIC_SUPABASE_URL', 'Thiếu một trong hai: PUBLIC_SUPABASE_URL và PUBLIC_SUPABASE_ANON_KEY phải có cùng nhau.');
    } else if (!isHttpsUrl(supabaseUrl) && !(isDev && isLocalUrl(supabaseUrl))) {
      dropSupabase('PUBLIC_SUPABASE_URL', 'URL Supabase phải bắt đầu bằng https:// (VD: https://xxxx.supabase.co).');
    } else if (!/^sb_publishable_/i.test(supabaseAnonKey) && role !== 'anon') {
      dropSupabase('PUBLIC_SUPABASE_ANON_KEY', 'Anon key không đúng định dạng (cần JWT role "anon" hoặc khoá sb_publishable_…).');
    }
  } else if (appEnv !== 'development') {
    issues.push({ key: 'PUBLIC_SUPABASE_URL', level: 'error', message: 'Bản preview / production chưa cấu hình Supabase — ứng dụng sẽ chạy dữ liệu mẫu.' });
  }

  let webUrl = s('PUBLIC_WEB_URL').replace(/\/+$/, '');
  if (webUrl && !isHttpsUrl(webUrl) && !(isDev && isLocalUrl(webUrl))) {
    issues.push({ key: 'PUBLIC_WEB_URL', level: 'warning', message: 'PUBLIC_WEB_URL phải là https://… — tạm tắt link chia sẻ.' });
    webUrl = '';
  }

  const hotlineRaw = s('PUBLIC_HOTLINE');
  const hotline = hotlineRaw.replace(/[^\d+]/g, '');
  if (hotlineRaw && !/^(0|\+84)\d{8,10}$/.test(hotline)) issues.push({ key: 'PUBLIC_HOTLINE', level: 'warning', message: 'Số hotline không hợp lệ — nút gọi sẽ ẩn.' });

  const zaloOAId = s('PUBLIC_ZALO_OA_ID');
  if (zaloOAId && !/^\d{6,25}$/.test(zaloOAId)) issues.push({ key: 'PUBLIC_ZALO_OA_ID', level: 'warning', message: 'Zalo OA ID chỉ gồm chữ số.' });

  let sentryDsn = s('PUBLIC_SENTRY_DSN');
  if (sentryDsn && !/^https:\/\/[a-f0-9]+@[^/\s]+\/\d+$/i.test(sentryDsn)) {
    issues.push({ key: 'PUBLIC_SENTRY_DSN', level: 'warning', message: 'Sentry DSN không đúng dạng https://<key>@<host>/<project> — tắt gửi lỗi lên Sentry.' });
    sentryDsn = '';
  }
  let telemetryUrl = s('PUBLIC_TELEMETRY_URL');
  if (telemetryUrl && !isHttpsUrl(telemetryUrl) && !(isDev && isLocalUrl(telemetryUrl))) {
    issues.push({ key: 'PUBLIC_TELEMETRY_URL', level: 'warning', message: 'PUBLIC_TELEMETRY_URL phải là https://… — tắt.' });
    telemetryUrl = '';
  }

  return {
    env: { appEnv, appVersion: s('PUBLIC_APP_VERSION') || '0.0.0', buildId: s('PUBLIC_BUILD_ID') || 'dev', supabaseUrl, supabaseAnonKey, zaloOAId, webUrl, hotline, sentryDsn, telemetryUrl },
    issues,
  };
}

// Each key must be read literally (process.env.X) so the Babel plugin can inline it.
const parsed = parseEnv(
  {
    PUBLIC_APP_ENV: process.env.PUBLIC_APP_ENV,
    PUBLIC_APP_VERSION: process.env.PUBLIC_APP_VERSION,
    PUBLIC_BUILD_ID: process.env.PUBLIC_BUILD_ID,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY,
    PUBLIC_ZALO_OA_ID: process.env.PUBLIC_ZALO_OA_ID,
    PUBLIC_WEB_URL: process.env.PUBLIC_WEB_URL,
    PUBLIC_HOTLINE: process.env.PUBLIC_HOTLINE,
    PUBLIC_SENTRY_DSN: process.env.PUBLIC_SENTRY_DSN,
    PUBLIC_TELEMETRY_URL: process.env.PUBLIC_TELEMETRY_URL,
  },
  typeof __DEV__ !== 'undefined' ? __DEV__ : false,
);

export const ENV: Readonly<PublicEnv> = Object.freeze(parsed.env);
export const ENV_ISSUES: readonly EnvIssue[] = parsed.issues;

// Fail loudly in development (red LogBox / console), quietly in production (reported by observability).
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  for (const i of ENV_ISSUES) (i.level === 'error' ? console.error : console.warn)(`[env] ${i.key}: ${i.message}`);
}

export const hasSupabase = !!(ENV.supabaseUrl && ENV.supabaseAnonKey);

/** A real hotline is configured (never call a placeholder number). */
export const hasHotline = /^(0|\+84)\d{8,10}$/.test(ENV.hotline);

export const isProduction = ENV.appEnv === 'production';
