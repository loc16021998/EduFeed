/**
 * Push notifications on the device: registration, tap → screen routing, and notification preferences.
 *
 * Provider model: the OS-level part (permission prompt, Expo push token, Android channels, tap events) is
 * behind `PushProvider`. This React Native CLI build does not include `expo-notifications` yet, so the
 * active provider reports `available: false` and every call is a safe no-op — nothing here can throw in
 * development, on a simulator, on the web or in a build without the module. When the module is added
 * (docs/RELEASE.md → "Thông báo đẩy"), only `nativeProvider` changes; routing, registration with the
 * server and the settings UI stay as they are.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { ANDROID_CHANNELS, isPushEvent, type PushData, type PushRole, type PushRoute } from '@/config/notificationTemplates';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/services/observability';

// ─── Provider ───────────────────────────────────────────────────────────────

export interface PushProvider {
  available: boolean;
  /** Why push is not available (shown in settings). */
  reason: string;
  /** Ask permission (only when the user turns notifications on) and return the Expo push token. */
  getToken: () => Promise<{ token: string; platform: 'ios' | 'android' } | null>;
  /** Android 8+: create ANDROID_CHANNELS. */
  setupChannels: () => Promise<void>;
  /** Tap on a notification (app in background or closed). Returns an unsubscribe. */
  onOpen: (handler: (data: unknown) => void) => () => void;
}

/**
 * Placeholder until expo-notifications is installed. The real one:
 *   getToken:      Notifications.requestPermissionsAsync() → getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })
 *   setupChannels: Notifications.setNotificationChannelAsync(c.id, { name: c.name, importance, vibrationPattern })
 *   onOpen:        Notifications.addNotificationResponseReceivedListener(r => handler(r.notification.request.content.data))
 *                  + Notifications.getLastNotificationResponseAsync() for a cold start from a tap
 */
const nativeProvider: PushProvider = {
  available: false,
  reason: 'Thông báo đẩy sẽ có trong bản cập nhật app sắp tới. Thông báo trong app (chuông 🔔) vẫn hoạt động.',
  getToken: async () => null,
  setupChannels: async () => {
    void ANDROID_CHANNELS; // channels defined in config/notificationTemplates.ts
  },
  onOpen: () => () => {},
};

const webProvider: PushProvider = {
  available: false,
  reason: 'Trên trình duyệt, thông báo hiển thị trong chuông 🔔 của ứng dụng. Cài app TH EDU để nhận thông báo đẩy.',
  getToken: async () => null,
  setupChannels: async () => {},
  onOpen: () => () => {},
};

export const push: PushProvider = Platform.OS === 'web' ? webProvider : nativeProvider;

// ─── Server registration ────────────────────────────────────────────────────

const TOKEN_KEY = 'thedu.pushToken';

/** Register this device for the signed-in account (call after sign-in and when the user enables push). */
export async function registerDevice(campus?: 'XA_LA' | 'NGO_THI_NHAM' | null): Promise<'registered' | 'unavailable' | 'denied' | 'error'> {
  if (!push.available) return 'unavailable';
  try {
    await push.setupChannels();
    const t = await push.getToken();
    if (!t) return 'denied';
    if (supabase) {
      const { error } = await supabase.rpc('push_register_token' as never, { p_token: t.token, p_platform: t.platform, p_campus: campus ?? null } as never);
      if (error) throw new Error(error.message);
    }
    await AsyncStorage.setItem(TOKEN_KEY, t.token).catch(() => {});
    return 'registered';
  } catch (e) {
    reportError(e, { area: 'network', level: 'warning', tags: { step: 'push_register' } });
    return 'error';
  }
}

/** Sign-out: this phone must stop receiving the previous account's notifications. */
export async function unregisterDevice(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    if (supabase) await supabase.rpc('push_unregister_token' as never, { p_token: token } as never);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* best effort — the server also drops tokens Expo reports as dead */
  }
}

// ─── Tap → screen ───────────────────────────────────────────────────────────

const ROUTES: readonly PushRoute[] = ['ParentPortal', 'Referral', 'TeacherDashboard', 'AdvisorTasks', 'StaffTrials'];
const ROUTE_ROLES: Record<PushRoute, PushRole[]> = {
  ParentPortal: ['PARENT'],
  Referral: ['PARENT'],
  TeacherDashboard: ['TEACHER', 'MANAGER'],
  AdvisorTasks: ['ADVISOR', 'MANAGER', 'TEACHER'],
  StaffTrials: ['ADVISOR', 'MANAGER'],
};

export type PushTarget = { name: PushRoute } | { name: 'Home' };

/** Defensive parse of a notification's data payload. Anything unexpected → null (ignored). */
export function parsePushData(raw: unknown): PushData | null {
  const d = (typeof raw === 'string' ? safeJson(raw) : raw) as Partial<PushData> | null;
  if (!d || typeof d !== 'object' || !isPushEvent(d.eventType) || !ROUTES.includes(d.deepLinkRoute as PushRoute)) return null;
  return {
    eventType: d.eventType,
    deepLinkRoute: d.deepLinkRoute as PushRoute,
    roleTarget: Array.isArray(d.roleTarget) ? (d.roleTarget.filter((r) => typeof r === 'string') as PushRole[]) : [],
    params: d.params && typeof d.params === 'object' ? Object.fromEntries(Object.entries(d.params).filter(([, v]) => typeof v === 'string')) : {},
  };
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/**
 * Where a tap should go. A notification meant for another role (e.g. a parent's notification on a phone
 * where a teacher is now signed in) opens the home feed instead of a screen that would bounce to a login.
 */
export function routeForPush(data: PushData | null, currentRole: PushRole | null): PushTarget {
  if (!data) return { name: 'Home' };
  const allowed = ROUTE_ROLES[data.deepLinkRoute];
  if (!currentRole || !allowed.includes(currentRole)) return { name: 'Home' };
  return { name: data.deepLinkRoute };
}

// ─── Preferences ────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  allowClassUpdates: boolean;
  allowRemindersAndBilling: boolean;
  allowPromotionsAndStreaks: boolean;
  quietHoursEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  allowClassUpdates: true,
  allowRemindersAndBilling: true,
  allowPromotionsAndStreaks: true,
  quietHoursEnabled: true,
};

let demoPrefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };

export async function fetchNotificationPrefs(): Promise<NotificationPrefs> {
  if (!supabase) return { ...demoPrefs };
  const { data, error } = await supabase.rpc('notification_prefs_get' as never);
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? 'Máy chủ chưa bật tính năng thông báo (chạy bản nâng cấp 20261130).' : error.message);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, boolean> | undefined;
  return r
    ? {
        allowClassUpdates: r.allow_class_updates !== false,
        allowRemindersAndBilling: r.allow_reminders_and_billing !== false,
        allowPromotionsAndStreaks: r.allow_promotions_and_streaks !== false,
        quietHoursEnabled: r.quiet_hours_enabled !== false,
      }
    : { ...DEFAULT_NOTIFICATION_PREFS };
}

export async function saveNotificationPrefs(p: NotificationPrefs): Promise<void> {
  if (!supabase) {
    demoPrefs = { ...p };
    return;
  }
  const { error } = await supabase.rpc('notification_prefs_set' as never, {
    p_class: p.allowClassUpdates,
    p_reminders: p.allowRemindersAndBilling,
    p_promos: p.allowPromotionsAndStreaks,
    p_quiet: p.quietHoursEnabled,
  } as never);
  if (error) throw new Error(error.message);
}
