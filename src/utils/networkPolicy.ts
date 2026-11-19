/**
 * Network-aware media policy — pure logic (unit-tested), no React / native imports.
 *
 * Trade-offs, in one place:
 *  - Autoplay makes the feed feel alive but a 30 s 720p clip costs ~3–6 MB. On mobile data with
 *    Data Saver on, the active card shows its poster (≈ 60–150 KB) and plays only when tapped.
 *  - Warming the NEXT video makes swipes start instantly but spends data on a clip the parent may
 *    never watch → only on Wi-Fi / unmetered, fast connections, and only one item ahead.
 *  - Poster prefetch is cheap (small JPEGs) and hides the "grey box" on fast scrolls → kept on,
 *    except on very slow (2G) or Data Saver links, where only the very next poster is fetched.
 *  - Uploads: phone photos are 3–8 MB. Resizing to 1600 px @ 0.8 keeps notebook text readable;
 *    Data Saver goes to 1280 px @ 0.7 (≈ 4–6× smaller, still sharp on a phone screen).
 */

export type ConnectionKind = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
/** Network Information API effective type (web) or derived from the cellular generation (native). */
export type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
/** AUTO = save data only on metered / mobile connections (default). */
export type DataSaverMode = 'AUTO' | 'ON' | 'OFF';

export interface NetworkSnapshot {
  kind: ConnectionKind;
  /** Metered connection (mobile data, hotspot). Native: NetInfo `isConnectionExpensive`. */
  metered: boolean;
  effectiveType: EffectiveType;
  /** The OS / browser asked apps to save data (Android Data Saver, Chrome "Lite"). */
  osSaveData: boolean;
  online: boolean;
}

export interface MediaPolicy {
  /** Data Saver is in effect right now (mode ON, or AUTO on a metered link). */
  dataSaver: boolean;
  /** Start the centred video by itself. */
  autoplay: boolean;
  /** Buffer the next video in the feed while the current one plays. */
  warmNextVideo: boolean;
  /** How many posters ahead to prefetch. */
  posterLookahead: number;
  /** Prefer the low-resolution stream when a video has one. */
  preferLowRes: boolean;
  /** Image upload resize target. */
  upload: { maxSide: number; quality: number };
  /** Short label for the UI. */
  label: string;
}

export const DEFAULT_SNAPSHOT: NetworkSnapshot = { kind: 'unknown', metered: false, effectiveType: 'unknown', osSaveData: false, online: true };

const slow = (e: EffectiveType) => e === 'slow-2g' || e === '2g';

/** Is this connection mobile data (or otherwise metered)? */
export const isMeteredLink = (n: NetworkSnapshot) => n.metered || n.kind === 'cellular';

export function resolvePolicy(n: NetworkSnapshot, mode: DataSaverMode): MediaPolicy {
  const metered = isMeteredLink(n);
  const dataSaver = mode === 'ON' || (mode === 'AUTO' && (metered || n.osSaveData || slow(n.effectiveType)));
  const fastUnmetered = !metered && (n.kind === 'wifi' || n.kind === 'ethernet' || n.kind === 'unknown') && !slow(n.effectiveType) && n.effectiveType !== '3g';

  return {
    dataSaver,
    autoplay: n.online && !dataSaver,
    warmNextVideo: n.online && !dataSaver && fastUnmetered,
    posterLookahead: !n.online ? 0 : dataSaver || slow(n.effectiveType) ? 1 : 3,
    preferLowRes: dataSaver || n.effectiveType === '3g' || slow(n.effectiveType),
    upload: dataSaver ? { maxSide: 1280, quality: 0.7 } : { maxSide: 1600, quality: 0.8 },
    label: !n.online
      ? 'Không có mạng'
      : dataSaver
        ? metered
          ? 'Đang tiết kiệm dữ liệu di động'
          : 'Đang bật tiết kiệm dữ liệu'
        : n.kind === 'wifi'
          ? 'Wi-Fi · phát video tự động'
          : 'Phát video tự động',
  };
}

/** Choose the stream for a video: the low-resolution file when the policy asks for it and one exists. */
export function pickStreamUrl(v: { videoUrl: string; videoUrlLow?: string }, policy: Pick<MediaPolicy, 'preferLowRes'>): string {
  return policy.preferLowRes && v.videoUrlLow ? v.videoUrlLow : v.videoUrl;
}

/** Target size for a resize that keeps the aspect ratio and never upscales. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxSide) return { width, height, scaled: false };
  const k = maxSide / longest;
  return { width: Math.round(width * k), height: Math.round(height * k), scaled: true };
}

/** Rough data cost used for the "đã tiết kiệm" estimate: a typical 30 s feed clip at 720p. */
export const EST_VIDEO_MB = 4;
