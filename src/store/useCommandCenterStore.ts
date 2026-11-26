import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CommandRange } from '@/services/commandCenter';
import type { CampusFilter } from '@/types';

export type CommandModule = 'OVERVIEW' | 'LEADS_CRM' | 'ACADEMIC_OPS' | 'CONTENT_FEED' | 'ACCOUNTS_RBAC' | 'SYSTEM_RELEASE';

interface CommandCenterState {
  branch: CampusFilter;
  range: CommandRange;
  module: CommandModule;
  /** Bumped by "Làm mới": every module reloads. */
  refreshKey: number;
  setBranch: (b: CampusFilter) => void;
  setRange: (r: CommandRange) => void;
  setModule: (m: CommandModule) => void;
  refresh: () => void;
}

/** Global filters of the Admin Command Center — kept between visits (branch, time range, last module). */
export const useCommandCenterStore = create<CommandCenterState>()(
  persist(
    (set) => ({
      branch: 'ALL',
      range: '7D',
      module: 'OVERVIEW',
      refreshKey: 0,
      setBranch: (branch) => set({ branch }),
      setRange: (range) => set({ range }),
      setModule: (module) => set({ module }),
      refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
    }),
    {
      name: 'thedu.command-center',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ branch: s.branch, range: s.range, module: s.module }),
    },
  ),
);
