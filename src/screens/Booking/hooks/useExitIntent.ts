import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

import { useTrustStore } from '@/store/useTrustStore';

interface Options {
  /** Parent has interacted with the form this visit and hasn't submitted. */
  inProgress: boolean;
  focused: boolean;
  /** Any value that changes on interaction (e.g. the form object) — resets the idle timer. */
  activity: unknown;
  /** Hesitation threshold: no interaction for this long → offer. */
  idleMs?: number;
}

/**
 * Exit-intent / hesitation detection for the Booking form. Three triggers, all funnelled through
 * `shouldOfferOnLeave()` so the offer appears at most once per session:
 *   1. idle for `idleMs` with a half-filled form
 *   2. Android hardware back
 *   3. switching tabs (handled in TabNavigator via the same store)
 */
export function useExitIntent({ inProgress, focused, activity, idleMs = 30_000 }: Options) {
  const setBookingInProgress = useTrustStore((s) => s.setBookingInProgress);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setBookingInProgress(inProgress);
  }, [inProgress, setBookingInProgress]);

  // Clear the flag when the screen unmounts so other screens never see a stale "in progress".
  useEffect(() => () => setBookingInProgress(false), [setBookingInProgress]);

  // 1. Hesitation timer — restarts on every interaction.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!focused || !inProgress) return;
    timer.current = setTimeout(() => {
      const s = useTrustStore.getState();
      if (s.shouldOfferOnLeave()) s.showExitOffer(null);
    }, idleMs);
    return () => clearTimeout(timer.current);
  }, [activity, focused, inProgress, idleMs]);

  // 2. Android back button.
  useEffect(() => {
    if (!focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = useTrustStore.getState();
      if (s.shouldOfferOnLeave()) {
        s.showExitOffer(null);
        return true; // consumed — the next back press proceeds normally
      }
      return false;
    });
    return () => sub.remove();
  }, [focused]);
}
