/** Request authentication helpers for the Edge Function. Web Crypto only (Deno / modern runtimes). */

/**
 * Constant-time string comparison: both values are hashed first, so the comparison time depends
 * neither on where they differ nor on their lengths.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Shared-secret check for scheduler calls (pg_cron → POST /api/cron/reminders, header x-cron-secret). */
export async function verifyCronSecret(req: Request, expected: string): Promise<boolean> {
  // An unset secret must never mean "open to everyone".
  if (!expected || expected.length < 24) return false;
  return timingSafeEqual(req.headers.get('x-cron-secret') ?? '', expected);
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
