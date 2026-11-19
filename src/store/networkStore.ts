import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_SNAPSHOT,
  resolvePolicy,
  type ConnectionKind,
  type DataSaverMode,
  type EffectiveType,
  type MediaPolicy,
  type NetworkSnapshot,
} from '@/utils/networkPolicy';

interface NetworkState {
  net: NetworkSnapshot;
  /** User setting ("Chế độ tiết kiệm dữ liệu"). AUTO protects mobile data by default. */
  mode: DataSaverMode;
  /** Videos shown as poster instead of auto-playing because of Data Saver (for the savings estimate). */
  autoplaySkipped: number;
  setMode: (m: DataSaverMode) => void;
  countSkippedAutoplay: () => void;
  resetStats: () => void;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      net: DEFAULT_SNAPSHOT,
      mode: 'AUTO',
      autoplaySkipped: 0,
      setMode: (mode) => set({ mode }),
      countSkippedAutoplay: () => set((s) => ({ autoplaySkipped: s.autoplaySkipped + 1 })),
      resetStats: () => set({ autoplaySkipped: 0 }),
    }),
    {
      name: 'thedu.network',
      storage: createJSONStorage(() => AsyncStorage),
      // The live connection is never persisted — only the parent's choice and the counter.
      partialize: (s) => ({ mode: s.mode, autoplaySkipped: s.autoplaySkipped }),
    },
  ),
);

/** Current media policy. Recomputed only when the connection or the setting changes. */
export function useMediaPolicy(): MediaPolicy {
  const net = useNetworkStore((s) => s.net);
  const mode = useNetworkStore((s) => s.mode);
  return useMemo(() => resolvePolicy(net, mode), [net, mode]);
}

/** Same, outside React (services, upload helpers). */
export const getMediaPolicy = (): MediaPolicy => {
  const { net, mode } = useNetworkStore.getState();
  return resolvePolicy(net, mode);
};

// ─── NetInfo → snapshot ─────────────────────────────────────────────────────

type WebConnection = { effectiveType?: string; saveData?: boolean; type?: string };
const webConnection = (): WebConnection | undefined =>
  Platform.OS === 'web' && typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: WebConnection }).connection : undefined;

const toEffective = (v: string | null | undefined): EffectiveType => {
  if (v === 'slow-2g' || v === '2g' || v === '3g' || v === '4g') return v;
  if (v === '5g') return '4g';
  return 'unknown';
};

export function toSnapshot(s: NetInfoState): NetworkSnapshot {
  const kind: ConnectionKind =
    s.type === 'wifi' || s.type === 'cellular' || s.type === 'ethernet' || s.type === 'none' ? s.type : s.type === 'wimax' ? 'cellular' : 'unknown';
  const details = (s.details ?? {}) as { isConnectionExpensive?: boolean; cellularGeneration?: string | null };
  const web = webConnection();
  return {
    kind,
    metered: !!details.isConnectionExpensive,
    effectiveType: toEffective(web?.effectiveType ?? (kind === 'cellular' ? details.cellularGeneration : null)),
    osSaveData: !!web?.saveData,
    // Web: reachability pings are disabled (see startNetworkMonitor), so NetInfo reports
    // isInternetReachable=false there — rely on navigator.onLine (isConnected) instead.
    // Native: isInternetReachable comes from the OS; null while unknown → treat as online.
    online: s.isConnected !== false && (Platform.OS === 'web' || s.isInternetReachable !== false),
  };
}

let started = false;
/** Start listening once (App root). Returns an unsubscribe for tests / hot reload. */
export function startNetworkMonitor(): () => void {
  if (started) return () => {};
  started = true;
  // No extra traffic just to detect the network: by default NetInfo pings a URL every minute on web
  // (HEAD "/") to test reachability; navigator.onLine is enough for our policy. Native keeps the OS
  // reachability (no pings from JS) and never reads the Wi-Fi name (would need location permission).
  if (Platform.OS === 'web') NetInfo.configure({ reachabilityShouldRun: () => false, shouldFetchWiFiSSID: false });
  const unsub = NetInfo.addEventListener((s) => {
    const next = toSnapshot(s);
    const cur = useNetworkStore.getState().net;
    // Avoid re-rendering every subscriber when nothing that matters changed.
    if (JSON.stringify(cur) !== JSON.stringify(next)) useNetworkStore.setState({ net: next });
  });
  return () => {
    started = false;
    unsub();
  };
}
