import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useUpdateStore } from '@/store/useUpdateStore';

/** First check a moment after launch, so it never competes with the first screen's data. */
const LAUNCH_DELAY_MS = 4000;

/**
 * Runs the update checks: once after launch, then whenever the app returns to the foreground (web: the
 * tab becomes visible), throttled by CHECK_THROTTLE_MS. Mount once (AppUpdates host).
 */
export function useAppUpdates() {
  const check = useUpdateStore((s) => s.check);
  useEffect(() => {
    const t = setTimeout(() => check(), LAUNCH_DELAY_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [check]);
}
