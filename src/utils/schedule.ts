import type { TimeSlot } from '@/types';

import { formatDateLongVN, parseISODate } from '../../supabase/functions/_shared/contracts';

export { parseISODate };
/** "Thứ Năm, 12/11/2026" */
export const formatDateLong = formatDateLongVN;

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const pad = (n: number) => String(n).padStart(2, '0');

export interface DayOption {
  /** Local date, YYYY-MM-DD (no timezone drift — built from local parts). */
  iso: string;
  weekday: string;
  dayMonth: string;
  isWeekend: boolean;
  isTomorrow: boolean;
}

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;


const isWeekendDate = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** The next `count` days starting tomorrow (same-day trials aren't offered). */
export function getUpcomingDays(count = 7, from = new Date()): DayOption[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i + 1);
    return {
      iso: toISODate(d),
      weekday: WEEKDAY_SHORT[d.getDay()],
      dayMonth: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
      isWeekend: isWeekendDate(d),
      isTomorrow: i === 0,
    };
  });
}


export function slotsForDate(iso: string | null, slots: TimeSlot[]): TimeSlot[] {
  if (!iso) return [];
  const kind = isWeekendDate(parseISODate(iso)) ? 'WEEKEND' : 'WEEKDAY';
  return slots.filter((s) => s.kind === kind);
}
