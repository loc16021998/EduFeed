/**
 * "CLB Phụ huynh TH EDU" — badges parents earn by using the app, and the reward for collecting all of them.
 *
 * Design rules (kept on purpose):
 *  - Badges reward useful actions (understanding the child's needs, watching lessons, seeing real progress),
 *    never time spent or daily streaks. No countdowns, no "you'll lose it" pressure.
 *  - Progress lives on this device only (no account needed). It can be earned again after reinstalling,
 *    so the reward must be confirmed by staff — it is sent with the trial booking as a promo code.
 */
import type { PromoCode } from '../../supabase/functions/_shared/contracts';

export type BadgeId = 'WISE_PARENT' | 'COMPANION' | 'PROGRESS_SEEKER';

export interface BadgeDef {
  id: BadgeId;
  title: string;
  /** How to earn it — shown on the locked badge. */
  how: string;
  /** Number of qualifying actions needed. */
  goal: number;
  color: string;
  /** lucide icon name, resolved in the component. */
  icon: 'Brain' | 'HeartHandshake' | 'Sparkles';
}

export const BADGES: BadgeDef[] = [
  { id: 'WISE_PARENT', title: 'Ba Mẹ Thông Thái', how: 'Hoàn thành Quiz chẩn đoán 3 bước', goal: 1, color: '#8B5CF6', icon: 'Brain' },
  { id: 'COMPANION', title: 'Đồng Hành Cùng Con', how: 'Xem 3 video bài học trên EduFeed', goal: 3, color: '#10B981', icon: 'HeartHandshake' },
  { id: 'PROGRESS_SEEKER', title: 'Nhìn Thấy Tiến Bộ', how: 'Kéo hết thanh so sánh Trước / Sau trong Nhật ký tiến bộ', goal: 1, color: '#F97316', icon: 'Sparkles' },
];

/** A video counts as watched after this long on screen (playing, feed focused). */
export const VIDEO_WATCH_MS = 8000;

/**
 * Reward for collecting every badge. Set to null to switch the reward off (badges keep working).
 * The promo code travels with the trial booking so staff see it and apply it at enrolment.
 */
export const PARENT_CLUB_REWARD: { promoCode: PromoCode; title: string; detail: string } | null = {
  promoCode: 'CLB_PHU_HUYNH_100K',
  title: 'Giảm 100.000đ học phí',
  detail: 'Ưu đãi được gửi kèm đăng ký học thử. Trung tâm áp dụng khi con nhập học chính thức.',
};
