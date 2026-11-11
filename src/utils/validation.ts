import type { CampusLocation, CourseCategory } from '@/types';

import { isValidVNPhone } from './helpers';
import { COURSES, TIME_SLOTS } from './mockData';
import { slotsForDate } from './schedule';

export interface BookingForm {
  course: CourseCategory;
  campus: CampusLocation;
  parentName: string;
  phone: string;
  childName: string;
  childAge: number | null;
  preferredDate: string | null;
  preferredSlotId: string | null;
}

export type BookingField = keyof BookingForm;
export type BookingErrors = Partial<Record<BookingField, string>>;

/** Display order — used to scroll to the first invalid field. */
export const FIELD_ORDER: BookingField[] = [
  'course',
  'campus',
  'preferredDate',
  'preferredSlotId',
  'parentName',
  'phone',
  'childName',
  'childAge',
];

export const CHILD_AGE_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11];

const hasDigit = /\d/;

function validateName(value: string, who: string): string | undefined {
  const v = value.trim();
  if (!v) return `Vui lòng nhập họ tên ${who}`;
  if (v.length < 2) return 'Họ tên quá ngắn';
  if (v.length > 60) return 'Họ tên quá dài';
  if (hasDigit.test(v)) return 'Họ tên không được chứa chữ số';
  return undefined;
}

export function validateField(field: BookingField, f: BookingForm): string | undefined {
  switch (field) {
    case 'course':
      return f.course ? undefined : 'Vui lòng chọn khóa học';
    case 'campus': {
      const offered = COURSES.find((c) => c.id === f.course)?.campuses ?? [];
      return offered.includes(f.campus) ? undefined : 'Cơ sở này chưa mở lớp cho khóa học đã chọn';
    }
    case 'preferredDate':
      return f.preferredDate ? undefined : 'Vui lòng chọn ngày học thử';
    case 'preferredSlotId':
      if (!f.preferredSlotId) return 'Vui lòng chọn khung giờ';
      return slotsForDate(f.preferredDate, TIME_SLOTS).some((s) => s.id === f.preferredSlotId)
        ? undefined
        : 'Khung giờ không có vào ngày đã chọn';
    case 'parentName':
      return validateName(f.parentName, 'phụ huynh');
    case 'phone':
      if (!f.phone.trim()) return 'Vui lòng nhập số điện thoại';
      return isValidVNPhone(f.phone) ? undefined : 'Số điện thoại chưa đúng (VD: 0912 345 678 hoặc +84 912 345 678)';
    case 'childName':
      return validateName(f.childName, 'của bé');
    case 'childAge':
      return f.childAge ? undefined : 'Vui lòng chọn tuổi của bé';
  }
}

export function validateBookingForm(f: BookingForm): BookingErrors {
  const errors: BookingErrors = {};
  for (const field of FIELD_ORDER) {
    const msg = validateField(field, f);
    if (msg) errors[field] = msg;
  }
  return errors;
}
