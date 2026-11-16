import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { supabase } from '@/lib/supabase';
import { fetchPortal, isDemoParentSignedIn, signOutParent, type PortalData } from '@/services/parentPortal';

/**
 * Signed-in parent (phone + Zalo OTP) and the portal data.
 * The session itself is Supabase's (persisted by supabase-js); this store mirrors whether it is a parent
 * session (app_metadata.role = 'parent') and keeps the chosen child between visits.
 */
type Status = 'unknown' | 'signedOut' | 'signedIn';

interface ParentState {
  status: Status;
  portal: PortalData | null;
  loading: boolean;
  error: string | null;
  /** Child shown in the portal (persisted). */
  selectedStudentId: string | null;
  init: () => void;
  /** After a successful OTP sign-in (the session is already set). */
  onSignedIn: () => Promise<void>;
  load: () => Promise<void>;
  selectStudent: (id: string) => void;
  signOut: () => Promise<void>;
}

const isParentSession = (s: Session | null) => (s?.user.app_metadata as { role?: string } | undefined)?.role === 'parent';
let initialised = false;

export const useParentStore = create<ParentState>()(
  persist(
    (set, get) => ({
      status: 'unknown',
      portal: null,
      loading: false,
      error: null,
      selectedStudentId: null,

      init: () => {
        if (initialised) return;
        initialised = true;
        if (!supabase) {
          set({ status: isDemoParentSignedIn() ? 'signedIn' : 'signedOut' });
          return;
        }
        const apply = (s: Session | null) => {
          const signedIn = isParentSession(s);
          set((st) => ({ status: signedIn ? 'signedIn' : 'signedOut', portal: signedIn ? st.portal : null }));
        };
        supabase.auth.getSession().then(({ data }) => apply(data.session));
        supabase.auth.onAuthStateChange((_e, s) => apply(s));
      },

      onSignedIn: async () => {
        set({ status: 'signedIn', portal: null });
        await get().load();
      },

      load: async () => {
        set({ loading: true, error: null });
        try {
          const portal = await fetchPortal();
          const keep = portal.students.some((s) => s.id === get().selectedStudentId);
          set({ portal, selectedStudentId: keep ? get().selectedStudentId : portal.students[0]?.id ?? null });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Không tải được dữ liệu';
          // Account locked / session gone: back to sign-in.
          if (/Cần đăng nhập|UNAUTHORIZED/i.test(msg)) set({ status: 'signedOut', portal: null });
          set({ error: msg });
        } finally {
          set({ loading: false });
        }
      },

      selectStudent: (id) => set({ selectedStudentId: id }),

      signOut: async () => {
        await signOutParent();
        set({ status: 'signedOut', portal: null, error: null });
      },
    }),
    {
      name: 'thedu.parent-portal',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ selectedStudentId: s.selectedStudentId }),
    },
  ),
);
