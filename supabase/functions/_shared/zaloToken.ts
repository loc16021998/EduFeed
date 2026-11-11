/**
 * Zalo OA access token with automatic refresh.
 *
 * Refresh API (Zalo OAuth v4):
 *   POST https://oauth.zaloapp.com/v4/oa/access_token
 *   header  secret_key: <App Secret Key>
 *   body    (form) refresh_token, app_id, grant_type=refresh_token
 *   → { access_token, refresh_token, expires_in }
 * Zalo rotates the pair on every refresh (the old refresh token dies), so refreshes are serialised
 * with a database lock (zalo_token_begin_refresh) and the new pair is stored immediately.
 *
 * The token lifetime differs between sources (1h vs 25h), so we trust `expires_in` and refresh
 * when less than `minValidityMs` remains. The 15-minute cron calls this every tick, which also
 * keeps the refresh token alive.
 *
 * Fallback: if no token is stored in the database, the static ZALO_OA_ACCESS_TOKEN secret is used.
 */
export const ZALO_OAUTH_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';

export interface TokenDeps {
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  fetch: typeof fetch;
  now: () => Date;
  appId: string;
  appSecret: string;
  /** Legacy/static token from env, used only when nothing is stored in the database. */
  staticToken: string;
  /** Wait before re-reading when another caller holds the refresh lock. */
  sleep?: (ms: number) => Promise<void>;
}

type TokenRow = { access_token: string; access_expires_at: string; refresh_locked: boolean; last_error: string | null };

const DEFAULT_MIN_VALIDITY_MS = 20 * 60_000; // > one cron interval

async function readRow(deps: TokenDeps): Promise<TokenRow | null> {
  const rows = await deps.rpc<TokenRow[] | TokenRow | null>('zalo_token_get', {});
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ?? null;
}

const remainingMs = (row: TokenRow, now: Date) => new Date(row.access_expires_at).getTime() - now.getTime();

/** Exchange a refresh token. Throws with Zalo's error description on failure. */
export async function requestTokenRefresh(
  deps: Pick<TokenDeps, 'fetch' | 'appId' | 'appSecret'>,
  refreshToken: string,
  timeoutMs = 15_000,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await deps.fetch(ZALO_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: deps.appSecret },
      body: new URLSearchParams({ refresh_token: refreshToken, app_id: deps.appId, grant_type: 'refresh_token' }).toString(),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
    const newRefresh = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    const expiresIn = Number(body.expires_in);
    if (!res.ok || !accessToken || !newRefresh || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      const reason = body.error_description ?? body.error_name ?? body.message ?? body.error ?? `HTTP ${res.status}`;
      throw new Error(`Zalo token refresh failed: ${String(reason)}`);
    }
    return { accessToken, refreshToken: newRefresh, expiresIn };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A usable access token: the stored one if it has enough validity left, otherwise a freshly
 * refreshed one. Returns '' when no token is configured at all (callers then skip sending).
 */
export async function getAccessToken(deps: TokenDeps, { minValidityMs = DEFAULT_MIN_VALIDITY_MS } = {}): Promise<string> {
  let row = await readRow(deps);
  if (!row) return deps.staticToken;

  const now = deps.now();
  if (remainingMs(row, now) > minValidityMs) return row.access_token;
  if (!deps.appId || !deps.appSecret) {
    console.warn('[zalo-token] token near expiry but ZALO_APP_ID / ZALO_APP_SECRET not set — cannot refresh');
    return remainingMs(row, now) > 0 ? row.access_token : '';
  }

  const refreshToken = await deps.rpc<string | null>('zalo_token_begin_refresh', { p_lock_seconds: 60 });
  if (!refreshToken) {
    // Another request is refreshing right now: give it a moment, then use whatever is stored.
    await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(2_000);
    row = await readRow(deps);
    return row && remainingMs(row, deps.now()) > 0 ? row.access_token : '';
  }

  try {
    const fresh = await requestTokenRefresh(deps, refreshToken);
    // Store immediately: the old refresh token is already dead at Zalo.
    let stored = false;
    for (let i = 0; i < 3 && !stored; i++) {
      try {
        await deps.rpc('zalo_token_store', { p_access: fresh.accessToken, p_refresh: fresh.refreshToken, p_expires_in: fresh.expiresIn });
        stored = true;
      } catch (e) {
        if (i === 2) {
          console.error('[zalo-token] CRITICAL: refreshed but could not store the new tokens — re-authorise the OA', e);
        }
      }
    }
    return fresh.accessToken;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await deps.rpc('zalo_token_fail', { p_error: msg }).catch(() => {});
    console.error('[zalo-token]', msg);
    return remainingMs(row, deps.now()) > 0 ? row.access_token : '';
  }
}
