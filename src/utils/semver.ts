/**
 * Minimal semantic-version helpers for update gating (unit-tested).
 * Accepts "1.2.3", "v1.2", "1.2.3-beta.1", "1.2.3+45" — missing parts count as 0. Pre-release
 * versions sort before the release ("1.2.0-beta" < "1.2.0"). Build metadata (+45) is ignored.
 * Anything unparsable returns null, and callers treat null as "do not gate" (never block on bad data).
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

export function parseSemver(input: string | null | undefined): SemVer | null {
  const m = String(input ?? '')
    .trim()
    .match(/^v?(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2] ?? 0), patch: Number(m[3] ?? 0), pre: m[4] ? m[4].split('.') : [] };
}

/** -1 if a < b, 0 if equal, 1 if a > b; null when either side is unparsable. */
export function compareSemver(a: string | null | undefined, b: string | null | undefined): -1 | 0 | 1 | null {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return null;
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.pre.length && !y.pre.length) return 0;
  if (!x.pre.length) return 1; // release > pre-release
  if (!y.pre.length) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1; // numeric identifiers sort first
    return p < q ? -1 : 1;
  }
  return 0;
}

export const isOlderThan = (current: string, target: string) => compareSemver(current, target) === -1;
