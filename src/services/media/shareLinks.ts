import { ENV } from '@/config/env';
import { isWeb } from '@/utils/platform';

/**
 * Public link for a video: https://<web-app>/v/<slug>. Opens the video with a booking button;
 * bookings through it are recorded with source SHARE_LINK + the video id.
 * Needs PUBLIC_WEB_URL on native (on web the current site address is used).
 */
export function buildShareUrl(slug: string | undefined | null): string | null {
  if (!slug) return null;
  const base = ENV.webUrl || (isWeb && typeof window !== 'undefined' ? window.location.origin : '');
  return base ? `${base}/v/${slug}` : null;
}

export function shareMessage(title: string, url: string): string {
  return `🎬 ${title}\n👉 Xem video & đăng ký học thử miễn phí tại TH EDU: ${url}`;
}

/** EduFeed share: title, teacher + course, link, and both campuses (for Zalo / Messenger groups). */
export function feedShareMessage(input: { title: string; teacherName: string; courseLabel: string; url: string | null }): string {
  return [
    `🎬 ${input.title}`,
    `👩‍🏫 ${input.teacherName} · ${input.courseLabel}`,
    input.url ? `👉 Xem video & đăng ký học thử miễn phí: ${input.url}` : '👉 Đăng ký học thử miễn phí trên app TH EDU Companion',
    '📍 TH EDU — Cơ sở Xa La & Cơ sở Ngô Thì Nhậm',
  ].join('\n');
}
