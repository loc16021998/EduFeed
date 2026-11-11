import { normalizePhone } from '../../supabase/functions/_shared/contracts';

// Vietnamese phone rules are shared with the API so client and server always agree.
export { isValidVNPhone, normalizePhone } from '../../supabase/functions/_shared/contracts';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** RFC4122 v4-shaped id. Not cryptographically strong — fine for lead ids. */
export const uuidv4 = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** 0912345678 → 0912 345 678 */
export const formatPhone = (raw: string): string =>
  normalizePhone(raw).replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');

/** Unicode "Combining Diacritical Marks" block (U+0300–U+036F). */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** Lower-case + strip Vietnamese diacritics so "toan tu duy" matches "Toán tư duy". */
export const normalizeVN = (s: string): string =>
  s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export const generateId = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Parse `thedu://booking?course=X` style CTA links. */
export function parseDeepLink(link: string): { route: string; params: Record<string, string> } {
  const match = link.match(/^thedu:\/\/([^?]+)(?:\?(.*))?$/);
  if (!match) return { route: '', params: {} };
  const params: Record<string, string> = {};
  (match[2] ?? '').split('&').filter(Boolean).forEach((pair) => {
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  return { route: match[1], params };
}
