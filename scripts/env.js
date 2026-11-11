// Shared by babel.config.js (native) and vite.config.mjs (web).
// Only these keys are inlined into the app bundle — never put secrets here.
const path = require('path');

const PUBLIC_ENV_KEYS = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY', 'PUBLIC_ZALO_OA_ID', 'PUBLIC_WEB_URL'];

let loaded = false;
function loadEnv() {
  if (loaded) return;
  loaded = true;
  const root = path.resolve(__dirname, '..');
  // .env.local wins over .env; existing process env wins over both.
  require('dotenv').config({ path: [path.join(root, '.env.local'), path.join(root, '.env')], quiet: true });
}

module.exports = { PUBLIC_ENV_KEYS, loadEnv };
