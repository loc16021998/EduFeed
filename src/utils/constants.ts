import type { CampusLocation, Category, CourseCategory } from '@/types';

/** Mirrors tailwind.config.js — for props that need raw colours (icons, nav). */
export const COLORS = {
  brand: '#2F6BFF',
  brandDark: '#1A44B3',
  brandLight: '#EEF4FF',
  accent: '#F97316',
  ink: '#0F172A',
  muted: '#64748B',
  subtle: '#94A3B8',
  surface: '#F8FAFC',
  white: '#FFFFFF',
} as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  ALL: 'Tất cả',
  TIEN_TIEU_HOC: 'Tiền tiểu học',
  LUYEN_CHU_DEP: 'Luyện chữ đẹp',
  TOAN_TU_DUY: 'Toán tư duy',
  BOI_DUONG_TOAN_TV: 'Bồi dưỡng Toán & TV',
};

export const CATEGORY_COLORS: Record<CourseCategory, string> = {
  TIEN_TIEU_HOC: '#8B5CF6',
  LUYEN_CHU_DEP: '#EC4899',
  TOAN_TU_DUY: '#10B981',
  BOI_DUONG_TOAN_TV: '#F59E0B',
};

export const FEED_FILTERS: Category[] = [
  'ALL',
  'TIEN_TIEU_HOC',
  'LUYEN_CHU_DEP',
  'TOAN_TU_DUY',
  'BOI_DUONG_TOAN_TV',
];

export const COURSE_CATEGORIES: CourseCategory[] = [
  'TIEN_TIEU_HOC',
  'LUYEN_CHU_DEP',
  'TOAN_TU_DUY',
  'BOI_DUONG_TOAN_TV',
];

export const CAMPUS_LABELS: Record<CampusLocation, string> = {
  XA_LA: 'Cơ sở Xa La',
  NGO_THI_NHAM: 'Cơ sở Ngô Thì Nhậm',
};

// TODO: replace with the centre's real hotline / Zalo OA before release.
export const CONTACT = {
  hotline: '0900000000',
} as const;

/** Welcome gift per course (lead-conversion incentive, ~200k VND). */
export { GIFT_BY_COURSE } from '../../supabase/functions/_shared/contracts';

export const SOURCE_LABELS = {
  FEED: 'EduFeed',
  QUIZ: 'Quiz chẩn đoán',
  PORTFOLIO: 'Nhật ký tiến bộ',
  DIRECT: 'Đăng ký trực tiếp',
  SHARE_LINK: 'Link chia sẻ video',
} as const;

export const STORAGE_KEYS = {
  user: 'thedu.user',
  booking: 'thedu.booking',
} as const;
