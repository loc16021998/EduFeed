import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CampusLocation } from '@/types';
import { STORAGE_KEYS } from '@/utils/constants';

interface Profile {
  parentName: string;
  phone: string;
  childName: string;
  childAge: number | null;
  preferredCampus: CampusLocation | null;
  zaloUserId: string | null;
}

interface UserState extends Profile {
  setProfile: (p: Partial<Profile>) => void;
  clear: () => void;
}

const initial: Profile = {
  parentName: '',
  phone: '',
  childName: '',
  childAge: null,
  preferredCampus: null,
  zaloUserId: null,
};

/** Parent profile — persisted so the next booking is pre-filled (one-tap re-booking). */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      ...initial,
      setProfile: (p) => set(p),
      clear: () => set(initial),
    }),
    {
      name: STORAGE_KEYS.user,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
