/** Number formatting without Intl (not every Hermes build ships full locale data). */

const group = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const formatInt = (n: number) => (n < 0 ? '-' : '') + group(n);

/** 12500000 → "12.500.000 ₫" */
export const formatVnd = (n: number) => `${formatInt(n)} ₫`;

/** 12500000 → "12,5 tr ₫" (short form for KPI tiles). */
export function formatVndShort(n: number): string {
  const one = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
  if (Math.abs(n) >= 1e9) return `${one(n / 1e9)} tỷ ₫`;
  if (Math.abs(n) >= 1e6) return `${one(n / 1e6)} tr ₫`;
  return formatVnd(n);
}

/** 0.4567 → "45,7%"; null when the denominator is 0. */
export function formatPct(num: number, den: number, digits = 1): string | null {
  if (!den) return null;
  const v = (num / den) * 100;
  const f = digits === 0 || v >= 100 || Number.isInteger(v) ? Math.round(v).toString() : v.toFixed(digits);
  return `${f.replace('.', ',')}%`;
}

/** Relative change; null when there is nothing to compare against. */
export function growth(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const formatDayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
export const monthLabel = (iso: string) => {
  const d = new Date(iso);
  // month_start is midnight Vietnam time; add a few hours so any device timezone lands in the right month.
  const m = new Date(d.getTime() + 12 * 3600_000);
  return `tháng ${m.getMonth() + 1}/${m.getFullYear()}`;
};
