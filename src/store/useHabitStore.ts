import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { checkIn, localDay } from '@/utils/habitStreak';

/** "Thử thách 21 Ngày" ticks, per child, per challenge — kept on this device only. */
interface HabitState {
  /** studentId → challengeKey → ticked days ("YYYY-MM-DD"). */
  days: Record<string, Record<string, string[]>>;
  /** studentId → the challenge shown. */
  active: Record<string, string>;
  tick: (studentId: string, key: string) => string[];
  choose: (studentId: string, key: string) => void;
  restart: (studentId: string, key: string) => void;
}

export const useHabitStore = create<HabitState>()(
  persist(
    (set, get) => ({
      days: {},
      active: {},
      tick: (studentId, key) => {
        const cur = get().days[studentId]?.[key] ?? [];
        const next = checkIn(cur, localDay());
        if (next !== cur) set((s) => ({ days: { ...s.days, [studentId]: { ...s.days[studentId], [key]: next } } }));
        return next;
      },
      choose: (studentId, key) => set((s) => ({ active: { ...s.active, [studentId]: key } })),
      restart: (studentId, key) => set((s) => ({ days: { ...s.days, [studentId]: { ...s.days[studentId], [key]: [] } } })),
    }),
    { name: 'thedu.habits', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
