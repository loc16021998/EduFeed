import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uuidv4 } from '@/utils/helpers';

export type NotificationKind = 'BOOKING' | 'REMINDER' | 'REWARD' | 'SYSTEM';

/** Where tapping the notification goes (resolved by the notification center). */
export type NotificationLink = 'MANAGE_BOOKINGS' | 'BOOKING' | 'PARENT_CLUB';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link?: NotificationLink;
  /** Same key = same event: never shown twice (e.g. one reminder per appointment). */
  key: string;
}

interface NotificationState {
  items: AppNotification[];
  /** Adds a notification unless one with the same key already exists. Returns whether it was added. */
  add: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
}

const MAX = 50;

/**
 * In-app notification history, kept on this device. Every entry comes from a real event:
 * a booking the parent sent, a status change from the centre, an upcoming appointment,
 * or a CLB Phụ huynh reward — nothing is invented to drive taps.
 */
export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (n) => {
        if (get().items.some((x) => x.key === n.key)) return false;
        const item: AppNotification = { ...n, id: uuidv4(), createdAt: new Date().toISOString(), read: false };
        set({ items: [item, ...get().items].slice(0, MAX) });
        return true;
      },
      markRead: (id) => set({ items: get().items.map((x) => (x.id === id ? { ...x, read: true } : x)) }),
      markAllRead: () => set({ items: get().items.map((x) => (x.read ? x : { ...x, read: true })) }),
      remove: (id) => set({ items: get().items.filter((x) => x.id !== id) }),
    }),
    { name: 'thedu.notifications', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const selectUnreadCount = (s: Pick<NotificationState, 'items'>) => s.items.reduce((n, x) => n + (x.read ? 0 : 1), 0);
