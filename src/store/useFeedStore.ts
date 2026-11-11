import { create } from 'zustand';

import { fetchFeedPage } from '@/services/feed';
import type { AsyncStatus, Category, FeedItem } from '@/types';

interface FeedState {
  items: FeedItem[];
  status: AsyncStatus;
  /** Cursor for the next page; null when the feed is exhausted. */
  nextCursor: string | null;
  loadingMore: boolean;
  selectedCategory: Category;
  likedIds: string[];
  /** Teacher names the parent follows. */
  followedTeachers: string[];
  /** (Re)load the first page for the selected category — also used for pull-to-refresh. */
  load: () => Promise<void>;
  /** Append the next page (infinite scroll). No-op while loading or when exhausted. */
  loadMore: () => Promise<void>;
  /** Switch category; the server filters, so this reloads from page one. */
  setCategory: (c: Category) => void;
  toggleLike: (id: string) => void;
  toggleFollow: (teacherName: string) => void;
}

const PAGE_SIZE = 6;

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Monotonic request id — responses for an outdated category/refresh are dropped. */
let requestSeq = 0;

export const useFeedStore = create<FeedState>()((set, get) => ({
  items: [],
  status: 'idle',
  nextCursor: null,
  loadingMore: false,
  selectedCategory: 'ALL',
  likedIds: [],
  followedTeachers: [],

  load: async () => {
    const req = ++requestSeq;
    set({ status: 'loading' });
    try {
      const page = await fetchFeedPage({ category: get().selectedCategory, limit: PAGE_SIZE });
      if (req !== requestSeq) return;
      set({ items: page.items, nextCursor: page.nextCursor, status: 'success', loadingMore: false });
    } catch {
      if (req === requestSeq) set({ status: 'error' });
    }
  },

  loadMore: async () => {
    const { nextCursor, loadingMore, status, selectedCategory } = get();
    if (!nextCursor || loadingMore || status === 'loading') return;
    const req = requestSeq;
    set({ loadingMore: true });
    try {
      const page = await fetchFeedPage({ category: selectedCategory, cursor: nextCursor, limit: PAGE_SIZE });
      if (req !== requestSeq) return; // category changed / refreshed meanwhile
      set((s) => {
        const seen = new Set(s.items.map((i) => i.id));
        return {
          items: [...s.items, ...page.items.filter((i) => !seen.has(i.id))],
          nextCursor: page.nextCursor,
          loadingMore: false,
        };
      });
    } catch {
      if (req === requestSeq) set({ loadingMore: false });
    }
  },

  setCategory: (selectedCategory) => {
    if (selectedCategory === get().selectedCategory) return;
    set({ selectedCategory, items: [], nextCursor: null });
    get().load();
  },

  toggleLike: (id) => set((s) => ({ likedIds: toggle(s.likedIds, id) })),

  toggleFollow: (name) => set((s) => ({ followedTeachers: toggle(s.followedTeachers, name) })),
}));
