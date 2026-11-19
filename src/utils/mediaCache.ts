/**
 * Media cache helpers: poster prefetch, a registry of in-app caches, and
 * a "clear cached media" action for the data settings screen.
 *
 * What we can and cannot clear (honest limits):
 *  - In-app caches (signed photo URLs, prefetch bookkeeping) → cleared here. The next feed clip is
 *    warmed by mounting a paused player (OptimizedVideoFeedItem), which is released on scroll.
 *  - Web: Cache Storage entries and the browser's own HTTP cache for images are managed by the
 *    browser; we clear Cache Storage and report `navigator.storage.estimate()`, the HTTP cache
 *    itself is evicted by the browser when space is low.
 *  - Native: React Native's image cache (Fresco on Android, NSURLCache on iOS) is bounded by the OS
 *    and is not clearable from JS without an extra native module; react-native-video does not keep
 *    a disk cache in this app (no `bufferConfig` cache), so streamed video is not stored.
 */
import { Image, Platform } from 'react-native';

// ─── Registry of in-app caches ──────────────────────────────────────────────

export interface MediaCacheEntry {
  id: string;
  label: string;
  /** Number of cached entries right now. */
  size: () => number;
  clear: () => void;
}

const registry = new Map<string, MediaCacheEntry>();

/** Services register their caches (e.g. signed photo URLs) so settings can show and clear them. */
export function registerMediaCache(entry: MediaCacheEntry): void {
  registry.set(entry.id, entry);
}

// ─── Poster prefetch ────────────────────────────────────────────────────────

const PREFETCH_CAP = 150;
const prefetched = new Set<string>();
const inFlight = new Set<string>();

/**
 * Warm the image cache for upcoming posters. De-duplicated and capped, fire-and-forget: failures are
 * ignored (the <Image> will simply load normally). Runs off the scroll handler via setTimeout(0).
 */
export function prefetchImages(urls: (string | null | undefined)[]): void {
  const todo = urls.filter((u): u is string => !!u && /^https?:/i.test(u) && !prefetched.has(u) && !inFlight.has(u));
  if (todo.length === 0) return;
  setTimeout(() => {
    for (const url of todo) {
      inFlight.add(url);
      Image.prefetch(url)
        .then(() => {
          prefetched.add(url);
          // Simple FIFO cap so the bookkeeping never grows without bound.
          if (prefetched.size > PREFETCH_CAP) prefetched.delete(prefetched.values().next().value as string);
        })
        .catch(() => {})
        .finally(() => inFlight.delete(url));
    }
  }, 0);
}

// ─── Report & clear ─────────────────────────────────────────────────────────

export interface MediaCacheReport {
  prefetchedImages: number;
  caches: { id: string; label: string; size: number }[];
  /** Web only: bytes used / quota for this site (images, Cache Storage, IndexedDB…). */
  storage?: { usageBytes: number; quotaBytes: number };
}

export async function getMediaCacheReport(): Promise<MediaCacheReport> {
  const report: MediaCacheReport = {
    prefetchedImages: prefetched.size,
    caches: [...registry.values()].map((c) => ({ id: c.id, label: c.label, size: c.size() })),
  };
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const e = await navigator.storage.estimate();
      report.storage = { usageBytes: e.usage ?? 0, quotaBytes: e.quota ?? 0 };
    } catch {
      /* not available in this browser */
    }
  }
  return report;
}

/** Clear everything the app can clear. Never touches sign-in, bookings or settings. */
export async function clearMediaCache(): Promise<number> {
  let cleared = prefetched.size;
  prefetched.clear();
  for (const c of registry.values()) {
    cleared += c.size();
    c.clear();
  }
  if (Platform.OS === 'web' && typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      cleared += keys.length;
    } catch {
      /* Cache Storage unavailable (private mode) */
    }
  }
  return cleared;
}

export const formatBytes = (n: number): string =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
