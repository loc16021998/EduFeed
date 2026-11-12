/**
 * Public runtime config, inlined at build time from `.env.local` / `.env` by
 * babel-plugin-transform-inline-environment-variables (native: babel.config.js, web: vite.config.mjs).
 * Only keys listed in scripts/env.js are inlined. Never put secrets here — the Supabase anon key
 * is safe to ship; Zalo tokens are NOT.
 *
 * After changing .env on native, restart Metro with `npm start -- --reset-cache`.
 */
export const ENV = {
  supabaseUrl: process.env.PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Zalo Official Account ID — used for the QR code / "Mở Zalo" link. */
  zaloOAId: process.env.PUBLIC_ZALO_OA_ID ?? '',
  /** Public address of the web app, e.g. https://app.thedu.vn — used for video share links. */
  webUrl: (process.env.PUBLIC_WEB_URL ?? '').replace(/\/+$/, ''),
  /** Centre hotline for parents (digits only), e.g. 0987654321. Empty = call buttons hidden. */
  hotline: (process.env.PUBLIC_HOTLINE ?? '').replace(/[^\d+]/g, ''),
} as const;

export const hasSupabase = !!(ENV.supabaseUrl && ENV.supabaseAnonKey);

/** A real hotline is configured (never call a placeholder number). */
export const hasHotline = /^(0|\+84)\d{8,10}$/.test(ENV.hotline);
