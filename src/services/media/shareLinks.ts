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
