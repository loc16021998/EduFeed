import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Which first-time guides (coachmarks) this device has already finished or skipped. */
interface OnboardingState {
  seen: Record<string, true>;
  markSeen: (tour: string) => void;
  reset: (tour?: string) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      seen: {},
      markSeen: (tour) => set((s) => ({ seen: { ...s.seen, [tour]: true } })),
      reset: (tour) =>
        set((s) => {
          if (!tour) return { seen: {} };
          const next = { ...s.seen };
          delete next[tour];
          return { seen: next };
        }),
    }),
    { name: 'thedu.onboarding', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
