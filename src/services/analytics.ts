/**
 * Marketing attribution + anonymous funnel events for the admin dashboard.
 *
 *  - Attribution: UTM parameters of the link a parent arrived through
 *    (e.g. https://app.thedu.vn/feed?utm_source=facebook&utm_medium=cpc&utm_campaign=khai-giang-t11).
 *    Kept on the device for 30 days (latest tagged link wins) and attached to the booking.
 *    Facebook / TikTok click ids (fbclid / ttclid) count as that network when no UTM is present.
 *  - Funnel events: "opened the app" and "watched a video for 3 s", at most once per session (and per
 *    video). The session id is random and is not linked to the parent or the booking — no personal data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { Attribution } from '@/types';
import { STORAGE_KEYS } from '@/utils/constants';
import { uuidv4 } from '@/utils/helpers';
import { isWeb } from '@/utils/platform';

const TTL_MS = 30 * 24 * 3600 * 1000;

// Web: read the address before the router rewrites it.
const INITIAL_WEB_URL = isWeb && typeof window !== 'undefined' ? window.location.href : null;

/** Parse the query string by hand: React Native's URLSearchParams does not implement get(). */
function queryParams(url: string): Record<string, string> {
  const q = url.indexOf('?');
  if (q < 0) return {};
  const out: Record<string, string> = {};
  for (const part of url.slice(q + 1).split('#')[0].split('&')) {
    const [k, v = ''] = part.split('=');
    if (!k) continue;
    try {
      out[decodeURIComponent(k).toLowerCase()] = decodeURIComponent(v.replace(/\+/g, ' ')).trim();
    } catch {
      /* malformed escape — ignore this parameter */
    }
  }
  return out;
}

export function parseAttribution(url: string | null | undefined): Attribution | null {
  if (!url) return null;
  const p = queryParams(url);
  let source = p.utm_source || '';
  let medium = p.utm_medium || '';
  if (!source && p.fbclid) source = 'facebook';
  if (!source && p.ttclid) source = 'tiktok';
  if (!source && p.ref) {
    source = 'referral';
    medium ||= 'referral';
  }
  if (!source) return null;
  const a: Attribution = { source: source.slice(0, 100) };
  if (medium) a.medium = medium.slice(0, 100);
  if (p.utm_campaign) a.campaign = p.utm_campaign.slice(0, 150);
  return a;
}

let attribution: Promise<Attribution | null> | null = null;

async function resolveAttribution(): Promise<Attribution | null> {
  const url = INITIAL_WEB_URL ?? (await Linking.getInitialURL().catch(() => null));
  const fresh = parseAttribution(url);
  try {
    if (fresh) {
      await AsyncStorage.setItem(STORAGE_KEYS.attribution, JSON.stringify({ ...fresh, at: Date.now() }));
      return fresh;
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.attribution);
    if (!raw) return null;
    const { at, ...saved } = JSON.parse(raw) as Attribution & { at: number };
    return Date.now() - at < TTL_MS ? saved : null;
  } catch {
    return fresh;
  }
}

/** UTM of the link that brought this visitor (cached for the app session). */
export function getAttribution(): Promise<Attribution | null> {
  attribution ??= resolveAttribution();
  return attribution;
}

// ─── Funnel events ──────────────────────────────────────────────────────────

let sessionId: string | null = null;
function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    // Web: survive reloads within the same tab so a refresh isn't counted as a new visit.
    const stored = isWeb ? window.sessionStorage.getItem('thedu.session') : null;
    sessionId = stored ?? uuidv4();
    if (isWeb && !stored) window.sessionStorage.setItem('thedu.session', sessionId);
  } catch {
    sessionId ??= uuidv4();
  }
  return sessionId;
}

const sent = new Set<string>();

/** Fire-and-forget; never throws, never blocks the UI. Deduplicated here and again in the database. */
export function trackEvent(kind: 'APP_OPEN' | 'VIDEO_VIEW', videoId?: string): void {
  if (!supabase) return;
  const key = `${kind}:${videoId ?? ''}`;
  if (sent.has(key)) return;
  sent.add(key);
  const client = supabase;
  getAttribution()
    .then((a) =>
      client.rpc('track_event', {
        p_session_id: getSessionId(),
        p_kind: kind,
        p_video_id: videoId ?? null,
        p_utm_source: a?.source ?? null,
        p_utm_medium: a?.medium ?? null,
      }),
    )
    .then(
      () => {},
      () => sent.delete(key),
    );
}
