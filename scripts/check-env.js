#!/usr/bin/env node
/**
 * Pre-build config check. Never prints values — only key names and problems.
 *
 *   node scripts/check-env.js                     # current .env.local / shell, as a development build
 *   node scripts/check-env.js --profile preview   # rules for an internal test build
 *   node scripts/check-env.js --profile production
 *
 * Fails (exit 1) when:
 *   - a server-only secret is exposed with a PUBLIC_ prefix, or any PUBLIC_ value looks like a secret
 *     (service-role JWT, sb_secret_, sk-ant-…),
 *   - preview / production config has an error-level issue (same rules as src/config/env.ts).
 */
const fs = require('fs');
const path = require('path');
const { PUBLIC_ENV_KEYS, SERVER_ONLY_KEYS, loadEnv } = require('./env');

const args = process.argv.slice(2);
const profile = args[args.indexOf('--profile') + 1] && args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'development';
if (!['development', 'preview', 'production'].includes(profile)) {
  console.error(`Unknown profile "${profile}" (development | preview | production)`);
  process.exit(2);
}
if (!process.env.PUBLIC_APP_ENV) process.env.PUBLIC_APP_ENV = profile;
loadEnv();

const problems = [];

// 1) Secrets must never be PUBLIC_.
for (const k of SERVER_ONLY_KEYS) if (process.env[`PUBLIC_${k}`]) problems.push(`PUBLIC_${k} is set — server-only secret exposed to the app bundle. Remove it.`);
for (const [k, v] of Object.entries(process.env)) {
  if (!k.startsWith('PUBLIC_') || !v) continue;
  if (/sb_secret_|sk-ant-|sk_live_/.test(v)) problems.push(`${k} contains a secret-looking key.`);
  const parts = v.split('.');
  if (parts.length === 3 && v.startsWith('eyJ')) {
    try {
      const role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role;
      if (role === 'service_role') problems.push(`${k} is a SERVICE ROLE key — never ship it.`);
    } catch {
      /* not a JWT */
    }
  }
}

// 2) Same validation as the app (src/config/env.ts → parseEnv), transpiled on the fly.
const { transformSync } = require('esbuild');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'env.ts'), 'utf8');
const { code } = transformSync(src, { loader: 'ts', format: 'cjs', define: { __DEV__: 'false' } });
const mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', 'require', 'process', 'console', code)(mod, mod.exports, require, { env: {} }, { error() {}, warn() {} });
const raw = Object.fromEntries(PUBLIC_ENV_KEYS.map((k) => [k, process.env[k]]));
const { env, issues } = mod.exports.parseEnv(raw, profile === 'development');

console.log(`\nTH EDU config check — profile: ${profile} (app env: ${env.appEnv}, version ${env.appVersion})`);
for (const k of PUBLIC_ENV_KEYS) console.log(`  ${process.env[k] ? '✓' : '·'} ${k}${process.env[k] ? '' : ' (empty)'}`);
for (const i of issues) console.log(`  ${i.level === 'error' ? '✗' : '!'} ${i.key}: ${i.message}`);
for (const p of problems) console.log(`  ✗ ${p}`);

const blocking = problems.length + (profile === 'development' ? 0 : issues.filter((i) => i.level === 'error').length);
if (profile !== 'development' && !env.sentryDsn && !env.telemetryUrl) console.log('  ! No PUBLIC_SENTRY_DSN / PUBLIC_TELEMETRY_URL — crashes will not be reported.');
console.log(blocking ? `\n✗ ${blocking} blocking problem(s).\n` : '\n✓ OK\n');
process.exit(blocking ? 1 : 0);
