/**
 * Role-aware first-login walkthrough state.
 *
 * Completion is stored per account AND role — key `onboarding_completed_<userId>_<role>` — so:
 *  - each role sees its own walkthrough once on its first sign-in on this device,
 *  - a second parent / teacher signing in on the same phone (shared device at the centre) still gets it,
 *  - a staff member whose role changes (giáo viên → tư vấn) sees the new role's guide.
 * Values are plain AsyncStorage strings (no PII: ids are opaque UUIDs).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { OnboardingRole } from '@/config/onboardingSlides';

export const onboardingKey = (userId: string, role: OnboardingRole) => `onboarding_completed_${userId}_${role}`;

export interface OnboardingSession {
  userId: string | null;
  role: OnboardingRole;
  /** Replay from Settings: closing never writes completion for another account. */
  preview: boolean;
}

interface RoleOnboardingState {
  /** The walkthrough on screen right now, or null. */
  active: OnboardingSession | null;
  /** Role of whoever is signed in (set by OnboardingGate) — Settings replays this one. */
  currentRole: OnboardingRole | null;
  setCurrentRole: (role: OnboardingRole | null) => void;
  /** Returns true (and presents it) when this user has not completed this role's walkthrough. */
  checkShouldShowOnboarding: (userId: string, role: OnboardingRole) => Promise<boolean>;
  completeOnboarding: (userId: string | null, role: OnboardingRole) => Promise<void>;
  /** Replay any role's guide (Settings → "Xem lại hướng dẫn sử dụng"). */
  resetOnboardingForPreview: (role: OnboardingRole) => void;
  /** Close without completing (e.g. sign-out while it is open). */
  dismiss: () => void;
}

// Avoid presenting twice when several triggers fire together (auth event + portal load).
const inFlight = new Set<string>();

export const useRoleOnboardingStore = create<RoleOnboardingState>()((set, get) => ({
  active: null,
  currentRole: null,
  setCurrentRole: (currentRole) => set({ currentRole }),

  checkShouldShowOnboarding: async (userId, role) => {
    if (!userId) return false;
    const key = onboardingKey(userId, role);
    const cur = get().active;
    if ((cur && !cur.preview && cur.userId === userId && cur.role === role) || inFlight.has(key)) return true;
    inFlight.add(key);
    try {
      const done = await AsyncStorage.getItem(key).catch(() => '1'); // storage error → never nag
      if (done) return false;
      if (!get().active) set({ active: { userId, role, preview: false } });
      return true;
    } finally {
      inFlight.delete(key);
    }
  },

  completeOnboarding: async (userId, role) => {
    const cur = get().active;
    set({ active: null });
    if (!userId || cur?.preview) return;
    await AsyncStorage.setItem(onboardingKey(userId, role), new Date().toISOString()).catch(() => {});
  },

  resetOnboardingForPreview: (role) => set({ active: { userId: null, role, preview: true } }),

  dismiss: () => set({ active: null }),
}));

/** Used by smaller in-screen tips (Coachmarks) to stay hidden while the walkthrough is open. */
export const isOnboardingPresenting = () => !!useRoleOnboardingStore.getState().active;
