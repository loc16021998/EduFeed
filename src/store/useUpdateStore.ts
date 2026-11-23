import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { decideStoreGate, fetchReleaseConfig, ota, type OtaCheck, type StoreGate } from '@/services/updateService';
import { ENV } from '@/config/env';

/** Background re-checks (app back to foreground) at most this often. Manual checks ignore it. */
export const CHECK_THROTTLE_MS = 15 * 60_000;

interface UpdateState {
  ota: OtaCheck | null;
  gate: StoreGate;
  checking: boolean;
  lastCheckAt: number;
  /** "Để sau" on a soft prompt hides it until a newer latest_version is published. */
  dismissedVersion: string | null;
  /** The OTA banner was closed for this session. */
  otaBannerHidden: boolean;
  /** Run both checks. `force` skips the throttle (manual "Kiểm tra cập nhật"). */
  check: (opts?: { force?: boolean }) => Promise<void>;
  dismissSoft: () => void;
  hideOtaBanner: () => void;
  applyOta: () => void;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      ota: null,
      gate: { kind: 'none' },
      checking: false,
      lastCheckAt: 0,
      dismissedVersion: null,
      otaBannerHidden: false,

      check: async ({ force = false } = {}) => {
        const { checking, lastCheckAt } = get();
        if (checking || (!force && Date.now() - lastCheckAt < CHECK_THROTTLE_MS)) return;
        set({ checking: true, lastCheckAt: Date.now() });
        try {
          // Independent: one failing never hides the other's result.
          const [otaRes, cfg] = await Promise.all([ota.check().catch((): OtaCheck => ({ status: 'error' })), fetchReleaseConfig().catch(() => null)]);
          const gate = decideStoreGate(ENV.appVersion, cfg, force ? null : get().dismissedVersion);
          set({ ota: otaRes, gate, ...(force ? { otaBannerHidden: false } : {}) });
        } finally {
          set({ checking: false });
        }
      },
      dismissSoft: () => {
        const g = get().gate;
        set({ dismissedVersion: g.kind === 'soft' ? g.latestVersion : get().dismissedVersion, gate: g.kind === 'soft' ? { kind: 'none' } : g });
      },
      hideOtaBanner: () => set({ otaBannerHidden: true }),
      applyOta: () => ota.apply(),
    }),
    {
      name: 'thedu.updates',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ dismissedVersion: s.dismissedVersion }),
    },
  ),
);
