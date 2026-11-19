/**
 * Live formatting for Vietnamese phone numbers while the parent types:
 *   "0912345678"   → "0912 345 678"
 *   "+84912345678" → "+84 912 345 678"
 *   "84912345678"  → "84 912 345 678"
 * Never adds a trailing space (so backspace never "fights" the user) and keeps at most 12 digits.
 * Validation stays with isValidVNPhone / normalizeVnMobile, which ignore the spaces.
 */
export function formatPhoneInput(raw: string): string {
  const plus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  if (!digits) return plus ? '+' : '';

  const group = (s: string, sizes: number[]) => {
    const parts: string[] = [];
    let i = 0;
    for (const n of sizes) {
      if (i >= s.length) break;
      parts.push(s.slice(i, i + n));
      i += n;
    }
    if (i < s.length) parts.push(s.slice(i));
    return parts.join(' ');
  };

  if (plus || (digits.startsWith('84') && digits.length > 10)) {
    const cc = digits.slice(0, 2);
    const rest = digits.slice(2);
    return `${plus ? '+' : ''}${cc}${rest ? ' ' + group(rest, [3, 3, 3]) : ''}`;
  }
  return group(digits, [4, 3, 3]);
}
