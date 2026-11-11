/**
 * Zalo Quick Auth — auto-fill parent name / phone.
 *
 * Current state: MOCK in development, disabled in production.
 *
 * To go live:
 *  1. Add `react-native-zalo-kit` and follow its Android/iOS setup (app id in
 *     AndroidManifest.xml / Info.plist, URL scheme), then `npm run pods` for iOS.
 *  2. Replace `mockProfile()` with `login()` + `getUserProfile()` from the SDK.
 *  3. Phone number access requires Zalo's separate phone-permission approval; without it,
 *     only name/avatar are returned and the parent types the phone manually.
 */
import { sleep } from '@/utils/helpers';

export interface ZaloProfile {
  id: string;
  name: string;
  phone?: string;
  avatarUrl?: string;
}

export const isZaloQuickAuthAvailable = __DEV__;

export async function requestZaloProfile(): Promise<ZaloProfile | null> {
  if (!isZaloQuickAuthAvailable) return null;
  return mockProfile();
}

async function mockProfile(): Promise<ZaloProfile> {
  await sleep(700);
  return { id: 'zalo-mock-8812', name: 'Nguyễn Thu Trang', phone: '0912345678' };
}
