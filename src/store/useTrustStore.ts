import { create } from 'zustand';

import { fetchRecentActivity, fetchTestimonials, fetchTrustStats } from '@/services/trust';
import type { ActivityEvent, Testimonial, TrustDataOrigin, TrustStat } from '@/types';

import type { TabParamList } from '@/navigation/types';

const ACTIVITY_TTL_MS = 60_000;
const STATIC_TTL_MS = 10 * 60_000;

interface Slice<T> {
  data: T;
  origin: TrustDataOrigin;
  fetchedAt: number;
}

const empty = <T>(data: T): Slice<T> => ({ data, origin: 'NONE', fetchedAt: 0 });

/**
 * Exit-intent offer — ethical guardrails:
 *  • shown at most ONCE per app session, never after a successful booking
 *  • only when the parent has started the form (real hesitation, not a cold visit)
 *  • dismissing always lets the parent continue where they were going
 */
interface ExitOfferState {
  visible: boolean;
  shownThisSession: boolean;
  claimed: boolean;
  /** Tab the parent was heading to when we intercepted — continue there on dismiss. */
  pendingTab: keyof TabParamList | null;
}

interface TrustState {
  stats: Slice<TrustStat[]>;
  activity: Slice<ActivityEvent[]>;
  testimonials: Slice<Testimonial[]>;
  loadStats: () => Promise<void>;
  loadActivity: (force?: boolean) => Promise<void>;
  loadTestimonials: () => Promise<void>;

  exitOffer: ExitOfferState;
  /** Set by BookingScreen: parent has typed/selected something and not yet submitted. */
  bookingInProgress: boolean;
  setBookingInProgress: (v: boolean) => void;
  /** True if leaving Booking right now should trigger the offer. */
  shouldOfferOnLeave: () => boolean;
  showExitOffer: (pendingTab?: keyof TabParamList | null) => void;
  claimExitOffer: () => void;
  dismissExitOffer: () => keyof TabParamList | null;
  /** After a successful booking the claimed promo is consumed. */
  consumeExitOffer: () => void;
}

const fresh = (s: Slice<unknown>, ttl: number) => s.fetchedAt > 0 && Date.now() - s.fetchedAt < ttl;

export const useTrustStore = create<TrustState>()((set, get) => ({
  stats: empty([]),
  activity: empty([]),
  testimonials: empty([]),

  loadStats: async () => {
    if (fresh(get().stats, STATIC_TTL_MS)) return;
    try {
      const r = await fetchTrustStats();
      set({ stats: { ...r, fetchedAt: Date.now() } });
    } catch {
      /* trust content is non-critical — keep whatever we had */
    }
  },

  loadActivity: async (force = false) => {
    if (!force && fresh(get().activity, ACTIVITY_TTL_MS)) return;
    try {
      const r = await fetchRecentActivity();
      set({ activity: { ...r, fetchedAt: Date.now() } });
    } catch {
      /* non-critical */
    }
  },

  loadTestimonials: async () => {
    if (fresh(get().testimonials, STATIC_TTL_MS)) return;
    try {
      const r = await fetchTestimonials();
      set({ testimonials: { ...r, fetchedAt: Date.now() } });
    } catch {
      /* non-critical */
    }
  },

  exitOffer: { visible: false, shownThisSession: false, claimed: false, pendingTab: null },
  bookingInProgress: false,
  setBookingInProgress: (v) => {
    if (get().bookingInProgress !== v) set({ bookingInProgress: v });
  },

  shouldOfferOnLeave: () => {
    const { bookingInProgress, exitOffer } = get();
    return bookingInProgress && !exitOffer.shownThisSession && !exitOffer.claimed && !exitOffer.visible;
  },

  showExitOffer: (pendingTab = null) =>
    set((s) => ({ exitOffer: { ...s.exitOffer, visible: true, shownThisSession: true, pendingTab } })),

  claimExitOffer: () => set((s) => ({ exitOffer: { ...s.exitOffer, visible: false, claimed: true, pendingTab: null } })),

  dismissExitOffer: () => {
    const target = get().exitOffer.pendingTab;
    set((s) => ({ exitOffer: { ...s.exitOffer, visible: false, pendingTab: null } }));
    return target;
  },

  consumeExitOffer: () => set((s) => ({ exitOffer: { ...s.exitOffer, claimed: false, visible: false } })),
}));
