import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appointmentDate, cancelBooking, fetchBookingState, rescheduleBooking, type BookingState } from '@/services/myBookings';
import type { BookingRecord } from '@/types';
import { TIME_SLOTS } from '@/utils/mockData';
import { formatDateLong } from '@/utils/schedule';

import { useBookingStore } from './useBookingStore';
import { useNotificationStore } from './useNotificationStore';

interface MyBookingsState {
  /** Latest known server state per booking id. */
  states: Record<string, BookingState>;
  refreshing: boolean;
  lastRefresh: number;
  error: string | null;
  busyId: string | null;
  /** Refresh all bookings on this device (throttled unless force). */
  refresh: (force?: boolean) => Promise<void>;
  /** Returns an error message, or null on success. */
  reschedule: (b: BookingRecord, date: string, slotId: string) => Promise<string | null>;
  cancel: (b: BookingRecord, reason?: string) => Promise<string | null>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const slotLabel = (id: string | null) => TIME_SLOTS.find((s) => s.id === id)?.label ?? '';
const when = (s: BookingState) => `${slotLabel(s.preferredSlotId).slice(0, 5)} · ${s.preferredDate ? formatDateLong(s.preferredDate) : ''}`;

/** Turn real changes into notifications (deduplicated by key). */
function notifyChanges(b: BookingRecord, prev: BookingState | undefined, next: BookingState) {
  const add = useNotificationStore.getState().add;
  const who = b.studentName.replace(/^Bé\s+/i, '');
  if (prev && prev.status !== next.status) {
    if (next.status === 'CONFIRMED' && (prev.status === 'NEW' || prev.status === 'CONTACTED')) {
      add({ key: `confirmed:${b.id}`, kind: 'BOOKING', title: 'Lịch học thử đã được xác nhận', body: `Bé ${who} · ${when(next)}`, link: 'MANAGE_BOOKINGS' });
    } else if (next.status === 'CANCELLED') {
      add({ key: `cancelled:${b.id}`, kind: 'BOOKING', title: 'Lịch học thử đã hủy', body: `Lịch của bé ${who} (${b.code}) đã được hủy.`, link: 'MANAGE_BOOKINGS' });
    } else if (next.status === 'COMPLETED_TRIAL') {
      add({ key: `done:${b.id}`, kind: 'SYSTEM', title: 'Cảm ơn ba mẹ đã cho con học thử', body: `Giáo viên sẽ gửi nhận xét về buổi học của bé ${who}.`, link: 'MANAGE_BOOKINGS' });
    }
  }
  // Reminder: appointment within the next 24 h (one per appointment time).
  const at = appointmentDate(next.preferredDate, next.preferredSlotId)?.getTime();
  const active = next.status !== 'CANCELLED' && next.status !== 'COMPLETED_TRIAL' && next.status !== 'ENROLLED';
  if (at && active && at > Date.now() && at - Date.now() < 24 * 3600_000) {
    add({ key: `remind:${b.id}:${next.preferredDate}:${next.preferredSlotId}`, kind: 'REMINDER', title: 'Nhắc lịch học thử', body: `Bé ${who} học thử lúc ${when(next)} — ${b.display.campus}.`, link: 'MANAGE_BOOKINGS' });
  }
}

export const useMyBookingsStore = create<MyBookingsState>()(
  persist(
    (set, get) => ({
      states: {},
      refreshing: false,
      lastRefresh: 0,
      error: null,
      busyId: null,

      refresh: async (force = false) => {
        const { refreshing, lastRefresh } = get();
        if (refreshing || (!force && Date.now() - lastRefresh < 60_000)) return;
        const history = useBookingStore.getState().history;
        if (!history.length) return;
        set({ refreshing: true, error: null });
        try {
          const states = { ...get().states };
          for (const b of history) {
            const next = await fetchBookingState(b, states[b.id]);
            if (!next) continue;
            notifyChanges(b, states[b.id], next);
            states[b.id] = next;
          }
          set({ states, refreshing: false, lastRefresh: Date.now() });
        } catch (e) {
          set({ refreshing: false, error: msg(e) });
        }
      },

      reschedule: async (b, date, slotId) => {
        set({ busyId: b.id, error: null });
        try {
          const next = await rescheduleBooking(b, date, slotId, get().states[b.id]);
          useNotificationStore.getState().add({
            key: `resched:${b.id}:${date}:${slotId}`,
            kind: 'BOOKING',
            title: 'Đã đổi lịch học thử',
            body: `Bé ${b.studentName.replace(/^Bé\s+/i, '')} · lịch mới ${when(next)}. Trung tâm sẽ nhắc lịch trước buổi học.`,
            link: 'MANAGE_BOOKINGS',
          });
          set({ states: { ...get().states, [b.id]: next }, busyId: null });
          return null;
        } catch (e) {
          set({ busyId: null });
          return msg(e);
        }
      },

      cancel: async (b, reason) => {
        set({ busyId: b.id, error: null });
        try {
          const next = await cancelBooking(b, reason, get().states[b.id]);
          // Cancelled by the parent: record it without a second "trung tâm đã hủy" notification.
          useNotificationStore.getState().add({ key: `cancelled:${b.id}`, kind: 'BOOKING', title: 'Đã hủy lịch học thử', body: `Lịch của bé ${b.studentName} (${b.code}) đã được hủy.`, link: 'MANAGE_BOOKINGS' });
          set({ states: { ...get().states, [b.id]: next }, busyId: null });
          return null;
        } catch (e) {
          set({ busyId: null });
          return msg(e);
        }
      },
    }),
    {
      name: 'thedu.myBookings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ states }) => ({ states }),
    },
  ),
);
