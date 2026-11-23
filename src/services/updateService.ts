/**
 * App updates — two independent checks, both best-effort (a failed check never blocks anyone):
 *
 * 1) OTA ("bản cập nhật nóng"): new JS without a store release.
 *    - Web: compares this build's id with /version.json of the live deploy (Vercel). New deploy → the
 *      next reload loads it; `critical` deploys ask to reload right away.
 *    - Native: needs `expo-updates` (EAS Update). This React Native CLI project does not ship it yet —
 *      `nativeOta` reports "unavailable" until it is installed (see docs/RELEASE.md → "Cập nhật OTA").
 *      Runtime safety then comes from EAS Update itself: an update is only served to binaries with the
 *      same runtimeVersion (policy "appVersion" in app.config.ts), so a JS bundle never meets a native
 *      binary it was not built for.
 *
 * 2) Store version gate (Supabase table `app_release_config`, one row per platform):
 *    installed < min_supported_version (or is_force_update) → "force" (blocking screen)
 *    installed < latest_version                              → "soft"  (dismissible card)
 *    Web never gates: it is always the latest deploy.
 */
import { Platform } from 'react-native';

import { ENV, hasSupabase } from '@/config/env';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/services/observability';
import { compareSemver } from '@/utils/semver';

// ─── Store gate ─────────────────────────────────────────────────────────────

export interface ReleaseConfig {
  platform: 'android' | 'ios';
  minSupportedVersion: string;
  latestVersion: string;
  storeUrl: string;
  releaseNotesVi: string;
  isForceUpdate: boolean;
}

export type StoreGate =
  | { kind: 'none' }
  | { kind: 'soft' | 'force'; latestVersion: string; storeUrl: string; notes: string };

/**
 * Pure decision (unit-tested). Never gates on bad data: unparsable versions, no store link, or a
 * dismissed soft prompt for this same latest version → 'none'.
 */
export function decideStoreGate(current: string, cfg: ReleaseConfig | null, dismissedVersion?: string | null): StoreGate {
  if (!cfg || !cfg.storeUrl || !/^https:\/\//i.test(cfg.storeUrl)) return { kind: 'none' };
  const belowMin = compareSemver(current, cfg.minSupportedVersion) === -1;
  const belowLatest = compareSemver(current, cfg.latestVersion) === -1;
  const base = { latestVersion: cfg.latestVersion, storeUrl: cfg.storeUrl, notes: cfg.releaseNotesVi.trim() };
  if (belowMin || (cfg.isForceUpdate && belowLatest)) return { kind: 'force', ...base };
  if (belowLatest && dismissedVersion !== cfg.latestVersion) return { kind: 'soft', ...base };
  return { kind: 'none' };
}

/** Development-only preview of the prompts: open the web app with ?update=soft or ?update=force. */
function devPreviewConfig(): ReleaseConfig | null {
  if (!__DEV__ || Platform.OS !== 'web' || typeof location === 'undefined') return null;
  const mode = new URLSearchParams(location.search).get('update');
  if (mode !== 'soft' && mode !== 'force') return null;
  return {
    platform: 'android',
    minSupportedVersion: mode === 'force' ? '99.0.0' : '0.0.0',
    latestVersion: '99.0.0',
    storeUrl: 'https://play.google.com/store/apps/details?id=vn.thedu.companion',
    releaseNotesVi: 'Cải thiện tốc độ tải video EduFeed và tính năng sổ liên lạc.',
    isForceUpdate: false,
  };
}

const TIMEOUT_MS = 6000;
const withTimeout = <T,>(p: PromiseLike<T>, ms = TIMEOUT_MS) =>
  Promise.race([Promise.resolve(p), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** Release config for this platform, or null (web, demo mode, offline, table not created yet…). */
export async function fetchReleaseConfig(): Promise<ReleaseConfig | null> {
  const preview = devPreviewConfig();
  if (preview) return preview;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (!hasSupabase || !supabase) return null;
  try {
    const { data, error } = await withTimeout(
      supabase.from('app_release_config' as never).select('*').eq('platform', Platform.OS).maybeSingle(),
    );
    if (error) {
      // 42P01 = table missing (upgrade not run yet) — expected, not an incident.
      if (!/42P01|does not exist|schema cache/i.test(`${error.code} ${error.message}`)) reportError(new Error(`release config: ${error.message}`), { area: 'network', level: 'warning' });
      return null;
    }
    const r = data as unknown as {
      platform: 'android' | 'ios';
      min_supported_version: string;
      latest_version: string;
      store_url: string;
      release_notes_vi: string;
      is_force_update: boolean;
    } | null;
    return r
      ? {
          platform: r.platform,
          minSupportedVersion: r.min_supported_version,
          latestVersion: r.latest_version,
          storeUrl: r.store_url,
          releaseNotesVi: r.release_notes_vi,
          isForceUpdate: !!r.is_force_update,
        }
      : null;
  } catch {
    return null; // offline / timeout: never block
  }
}

// ─── OTA ────────────────────────────────────────────────────────────────────

export type OtaCheck =
  | { status: 'unavailable'; reason: string }
  | { status: 'up-to-date' }
  | { status: 'ready'; critical: boolean; notes: string; version: string | null }
  | { status: 'error' };

export interface OtaProvider {
  /** Where updates come from, for the version footer. */
  channel: string;
  check: () => Promise<OtaCheck>;
  /** Restart into the downloaded update. */
  apply: () => void;
}

interface VersionManifest {
  buildId?: string;
  version?: string;
  critical?: boolean;
  notes?: string;
}

const webOta: OtaProvider = {
  channel: `web-${ENV.appEnv}`,
  async check() {
    if (__DEV__ && ENV.buildId === 'dev') return { status: 'unavailable', reason: 'Bản phát triển' };
    try {
      const res = await withTimeout(fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' }));
      if (!res.ok) return { status: res.status === 404 ? 'unavailable' : 'error', ...(res.status === 404 ? { reason: 'Chưa có version.json' } : {}) } as OtaCheck;
      const m = (await res.json()) as VersionManifest;
      if (!m.buildId || m.buildId === ENV.buildId) return { status: 'up-to-date' };
      // The new deploy's assets are fetched on reload; warm its entry page now so the reload is instant.
      fetch('/', { cache: 'reload' }).catch(() => {});
      return { status: 'ready', critical: !!m.critical, notes: (m.notes ?? '').trim(), version: m.version ?? null };
    } catch {
      return { status: 'error' };
    }
  },
  apply() {
    if (typeof location !== 'undefined') location.reload();
  },
};

/**
 * Native OTA placeholder. When `expo-updates` is added (docs/RELEASE.md), replace this with:
 *   check: Updates.checkForUpdateAsync() → Updates.fetchUpdateAsync() (silent download), critical flag
 *          from the update manifest's `extra.critical`; apply: Updates.reloadAsync().
 * Keeping it a no-op means today's binaries never call a native module that is not there.
 */
const nativeOta: OtaProvider = {
  channel: ENV.appEnv,
  async check() {
    return { status: 'unavailable', reason: 'Cập nhật qua cửa hàng ứng dụng' };
  },
  apply() {},
};

export const ota: OtaProvider = Platform.OS === 'web' ? webOta : nativeOta;

/** Short build label for support: "0.1.0 · build a1b2c3d". */
export const buildLabel = () => {
  const id = ENV.buildId === 'dev' ? 'dev' : ENV.buildId.split('-')[0] === 'local' ? ENV.buildId : ENV.buildId.split('-')[0];
  return `${ENV.appVersion} · build ${id}`;
};
