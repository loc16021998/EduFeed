import { create } from 'zustand';

import { fetchCourseFees, fetchDashboardLeads, fetchDashboardSummary, saveCourseFees } from '@/services/dashboard';
import type {
  AsyncStatus,
  CampusFilter,
  CourseCategory,
  CourseFees,
  DashboardLead,
  DashboardPeriod,
  DashboardSummary,
  LeadStatusGroup,
} from '@/types';

interface DashboardState {
  // Filters
  campus: CampusFilter;
  period: DashboardPeriod;
  group: LeadStatusGroup;
  /** Lead search text (applied after a short pause in typing). */
  search: string;

  summary: DashboardSummary | null;
  summaryStatus: AsyncStatus;
  summaryError: string | null;

  leads: DashboardLead[];
  leadsStatus: AsyncStatus;
  leadsError: string | null;
  page: number;
  hasMore: boolean;
  loadingMore: boolean;

  fees: CourseFees;

  setCampus: (c: CampusFilter) => void;
  setPeriod: (p: DashboardPeriod) => void;
  setGroup: (g: LeadStatusGroup) => void;
  setSearch: (q: string) => void;
  /** Reload KPIs + the first page of leads. */
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadFees: () => Promise<void>;
  /** Returns an error message or null. */
  saveFees: (fees: Partial<Record<CourseCategory, number | null>>) => Promise<string | null>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');

// Request counters: a slow response for an old filter must not overwrite a newer one.
let summarySeq = 0;
let leadsSeq = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

export const useDashboardStore = create<DashboardState>()((set, get) => {
  const loadSummary = async () => {
    const req = ++summarySeq;
    const { campus, period } = get();
    set({ summaryStatus: 'loading', summaryError: null });
    try {
      const summary = await fetchDashboardSummary(campus, period);
      if (req === summarySeq) set({ summary, summaryStatus: 'success' });
    } catch (e) {
      if (req === summarySeq) set({ summaryStatus: 'error', summaryError: msg(e) });
    }
  };

  const loadFirstPage = async () => {
    const req = ++leadsSeq;
    const { campus, period, group, search } = get();
    set({ leadsStatus: 'loading', leadsError: null, loadingMore: false });
    try {
      const res = await fetchDashboardLeads({ campus, days: period, group, search, page: 0 });
      if (req === leadsSeq) set({ leads: res.items, hasMore: res.hasMore, page: 0, leadsStatus: 'success' });
    } catch (e) {
      if (req === leadsSeq) set({ leadsStatus: 'error', leadsError: msg(e) });
    }
  };

  return {
    campus: 'ALL',
    period: 30,
    group: 'ALL',
    search: '',
    summary: null,
    summaryStatus: 'idle',
    summaryError: null,
    leads: [],
    leadsStatus: 'idle',
    leadsError: null,
    page: 0,
    hasMore: false,
    loadingMore: false,
    fees: {},

    setCampus: (campus) => {
      if (campus === get().campus) return;
      set({ campus, leads: [] });
      get().refresh();
    },
    setPeriod: (period) => {
      if (period === get().period) return;
      set({ period, leads: [] });
      get().refresh();
    },
    setGroup: (group) => {
      if (group === get().group) return;
      set({ group, leads: [] });
      loadFirstPage();
    },
    setSearch: (search) => {
      set({ search });
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadFirstPage(), 350);
    },

    refresh: async () => {
      await Promise.all([loadSummary(), loadFirstPage()]);
    },

    loadMore: async () => {
      const { hasMore, loadingMore, leadsStatus, page, campus, period, group, search } = get();
      if (!hasMore || loadingMore || leadsStatus !== 'success') return;
      const req = leadsSeq;
      set({ loadingMore: true });
      try {
        const res = await fetchDashboardLeads({ campus, days: period, group, search, page: page + 1 });
        if (req !== leadsSeq) return;
        const seen = new Set(get().leads.map((l) => l.id));
        set({
          leads: [...get().leads, ...res.items.filter((l) => !seen.has(l.id))],
          hasMore: res.hasMore,
          page: page + 1,
          loadingMore: false,
        });
      } catch (e) {
        if (req === leadsSeq) set({ loadingMore: false, leadsError: msg(e) });
      }
    },

    loadFees: async () => {
      try {
        set({ fees: await fetchCourseFees() });
      } catch {
        /* the fee dialog shows its own error when saving */
      }
    },

    saveFees: async (fees) => {
      try {
        await saveCourseFees(fees);
        await get().loadFees();
        await loadSummary();
        return null;
      } catch (e) {
        return msg(e);
      }
    },
  };
});
