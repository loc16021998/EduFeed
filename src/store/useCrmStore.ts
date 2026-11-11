import { create } from 'zustand';

import { completeTrial, fetchCrmLeads, setLeadStatus, type StaffSettableStatus } from '@/services/crm';
import type { AsyncStatus, CrmFilter, CrmLead } from '@/types';

interface CrmState {
  filter: CrmFilter;
  leads: CrmLead[];
  status: AsyncStatus;
  error: string | null;
  /** Lead id currently being updated (disables its buttons). */
  busyId: string | null;
  setFilter: (f: CrmFilter) => void;
  load: () => Promise<void>;
  changeStatus: (lead: CrmLead, status: StaffSettableStatus, note?: string) => Promise<boolean>;
  complete: (lead: CrmLead, teacherNote: string) => Promise<string | null>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
let seq = 0;

export const useCrmStore = create<CrmState>()((set, get) => ({
  filter: 'TODAY',
  leads: [],
  status: 'idle',
  error: null,
  busyId: null,

  setFilter: (filter) => {
    if (filter === get().filter) return;
    set({ filter, leads: [] });
    get().load();
  },

  load: async () => {
    const req = ++seq;
    set({ status: 'loading', error: null });
    try {
      const leads = await fetchCrmLeads(get().filter);
      if (req === seq) set({ leads, status: 'success' });
    } catch (e) {
      if (req === seq) set({ status: 'error', error: msg(e) });
    }
  },

  changeStatus: async (lead, status, note) => {
    set({ busyId: lead.id, error: null });
    try {
      await setLeadStatus(lead.id, status, note);
      set({ busyId: null });
      await get().load();
      return true;
    } catch (e) {
      set({ busyId: null, error: msg(e) });
      return false;
    }
  },

  /** Returns an error message (shown in the dialog) or null on success. */
  complete: async (lead, teacherNote) => {
    set({ busyId: lead.id });
    try {
      await completeTrial(lead.id, teacherNote);
      set({ busyId: null });
      await get().load();
      return null;
    } catch (e) {
      set({ busyId: null });
      return msg(e);
    }
  },
}));
