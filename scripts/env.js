// Shared by babel.config.js (native), vite.config.mjs (web) and scripts/check-env.js.
// Only PUBLIC_* keys listed here are inlined into the app bundle — never put secrets here.
const path = require('path');

const PUBLIC_ENV_KEYS = [
  'PUBLIC_APP_ENV', // development | preview | production
  'PUBLIC_APP_VERSION', // filled from package.json when not set
  'PUBLIC_BUILD_ID', // unique per build (EAS build id / Vercel commit / time) — web OTA compares it
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_ANON_KEY',
  'PUBLIC_ZALO_OA_ID',
  'PUBLIC_WEB_URL',
  'PUBLIC_HOTLINE',
  'PUBLIC_SENTRY_DSN', // optional: crash reports to Sentry (DSN is public by design)
  'PUBLIC_TELEMETRY_URL', // optional: custom error endpoint (JSON POST)
];

/**
 * Names that must NEVER reach the client bundle. scripts/check-env.js fails if any of them is set
 * with a PUBLIC_ prefix, and src/config/env.ts refuses a service-role key passed as the anon key.
 */
const SERVER_ONLY_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'VNPAY_HASH_SECRET',
  'BANK_WEBHOOK_API_KEY',
  'OTP_PEPPER',
  'ANTHROPIC_API_KEY',
  'ZALO_APP_SECRET',
  'ZALO_OA_ACCESS_TOKEN',
  'SENTRY_AUTH_TOKEN',
  'EXPO_ACCESS_TOKEN',
];

let loaded = false;
function loadEnv() {
  if (loaded) return;
  loaded = true;
  const root = path.resolve(__dirname, '..');
  // Existing process env (EAS / Vercel / CI) wins over .env.local, which wins over .env.
  require('dotenv').config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
  if (!process.env.PUBLIC_APP_VERSION) process.env.PUBLIC_APP_VERSION = require(path.join(root, 'package.json')).version;
  if (!process.env.PUBLIC_BUILD_ID) {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.EAS_BUILD_GIT_COMMIT_HASH || '';
    // Commit + time: two deploys of the same commit (e.g. env change) still count as a new build.
    process.env.PUBLIC_BUILD_ID = `${sha.slice(0, 7) || 'local'}-${Date.now().toString(36)}`;
  }
}

module.exports = { PUBLIC_ENV_KEYS, SERVER_ONLY_KEYS, loadEnv };
