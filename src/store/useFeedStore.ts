import { create } from 'zustand';

import { fetchFeedPage } from '@/services/feed';
import { fetchSocialState, recordShare, setVideoLike, type ShareChannel } from '@/services/videoSocial';
import type { AsyncStatus, Category, FeedItem } from '@/types';

export interface SocialCounts {
  likes: number;
  comments: number;
  shares: number;
}

interface FeedState {
  items: FeedItem[];
  status: AsyncStatus;
  /** Cursor for the next page; null when the feed is exhausted. */
  nextCursor: string | null;
  loadingMore: boolean;
  selectedCategory: Category;
  /** Videos this viewer liked (server truth once hydrated; optimistic in between). */
  likedIds: string[];
  /** Live counters per video id (optimistic; reconciled with every server answer). */
  social: Record<string, SocialCounts>;
  /** Short message after a failed action (the UI rolled back), e.g. "Mất kết nối…". Cleared by the screen. */
  socialNotice: string | null;
  /** Teacher names the parent follows. */
  followedTeachers: string[];
  /** (Re)load the first page for the selected category — also used for pull-to-refresh. */
  load: () => Promise<void>;
  /** Append the next page (infinite scroll). No-op while loading or when exhausted. */
  loadMore: () => Promise<void>;
  /** Switch category; the server filters, so this reloads from page one. */
  setCategory: (c: Category) => void;
  /** ♥ toggle (button). */
  toggleLike: (id: string) => void;
  /** Like only — double-tap on the video never un-likes. */
  likeVideo: (id: string, mode?: 'toggle' | 'like') => Promise<void>;
  /** Count a share (after the share sheet was opened). */
  shareVideo: (id: string, channel?: ShareChannel) => Promise<void>;
  /** The comments sheet reports the server's exact count (or an optimistic ±1). */
  setCommentsCount: (id: string, n: number) => void;
  bumpComments: (id: string, delta: number) => void;
  /** Fetch counters + "liked" for these videos (after each page). */
  hydrateSocial: (ids: string[]) => Promise<void>;
  clearSocialNotice: () => void;
  toggleFollow: (teacherName: string) => void;
}

const PAGE_SIZE = 6;
const ZERO: SocialCounts = { likes: 0, comments: 0, shares: 0 };

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const withLike = (list: string[], id: string, on: boolean) => (on ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id));
const msg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Không thực hiện được, vui lòng thử lại.');

/** Counters shipped with the feed rows (if the database has them). */
const seed = (items: FeedItem[], prev: Record<string, SocialCounts>) => {
  const next = { ...prev };
  for (const i of items) {
    if (i.likesCount === undefined && next[i.id]) continue;
    next[i.id] = { likes: i.likesCount ?? next[i.id]?.likes ?? 0, comments: i.commentsCount ?? next[i.id]?.comments ?? 0, shares: i.sharesCount ?? next[i.id]?.shares ?? 0 };
  }
  return next;
};

/** Monotonic request id — responses for an outdated category/refresh are dropped. */
let requestSeq = 0;
/** Per-video like request id — only the latest tap's answer (or failure) is applied. */
const likeSeq = new Map<string, number>();

export const useFeedStore = create<FeedState>()((set, get) => ({
  items: [],
  status: 'idle',
  nextCursor: null,
  loadingMore: false,
  selectedCategory: 'ALL',
  likedIds: [],
  social: {},
  socialNotice: null,
  followedTeachers: [],

  load: async () => {
    const req = ++requestSeq;
    set({ status: 'loading' });
    try {
      const page = await fetchFeedPage({ category: get().selectedCategory, limit: PAGE_SIZE });
      if (req !== requestSeq) return;
      set((s) => ({ items: page.items, nextCursor: page.nextCursor, status: 'success', loadingMore: false, social: seed(page.items, s.social) }));
      get().hydrateSocial(page.items.map((i) => i.id));
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
      const seen = new Set(get().items.map((i) => i.id));
      const fresh = page.items.filter((i) => !seen.has(i.id));
      set((s) => ({ items: [...s.items, ...fresh], nextCursor: page.nextCursor, loadingMore: false, social: seed(fresh, s.social) }));
      get().hydrateSocial(fresh.map((i) => i.id));
    } catch {
      if (req === requestSeq) set({ loadingMore: false });
    }
  },

  setCategory: (selectedCategory) => {
    if (selectedCategory === get().selectedCategory) return;
    set({ selectedCategory, items: [], nextCursor: null });
    get().load();
  },

  hydrateSocial: async (ids) => {
    if (ids.length === 0) return;
    try {
      const rows = await fetchSocialState(ids);
      set((s) => {
        const social = { ...s.social };
        let likedIds = s.likedIds;
        for (const r of rows) {
          if (likeSeq.has(r.id)) continue; // a tap is in flight: its own answer will reconcile
          social[r.id] = { likes: r.likes, comments: r.comments, shares: r.shares };
          likedIds = withLike(likedIds, r.id, r.liked);
        }
        return { social, likedIds };
      });
    } catch {
      /* counters stay as shipped with the feed; liking still works */
    }
  },

  likeVideo: async (id, mode = 'toggle') => {
    const wasLiked = get().likedIds.includes(id);
    const want = mode === 'like' ? true : !wasLiked;
    if (want === wasLiked) return; // double-tap on an already-liked video: nothing to do
    const before = get().social[id] ?? ZERO;
    const seq = (likeSeq.get(id) ?? 0) + 1;
    likeSeq.set(id, seq);
    // Optimistic: the heart and the number change in the same frame as the tap.
    set((s) => ({
      likedIds: withLike(s.likedIds, id, want),
      social: { ...s.social, [id]: { ...before, likes: Math.max(0, before.likes + (want ? 1 : -1)) } },
    }));
    try {
      const r = await setVideoLike(id, want);
      if (likeSeq.get(id) !== seq) return;
      set((s) => ({ likedIds: withLike(s.likedIds, id, r.liked), social: { ...s.social, [id]: { ...(s.social[id] ?? before), likes: r.likes } } }));
    } catch (e) {
      if (likeSeq.get(id) !== seq) return;
      // Roll back to exactly what was shown before the tap.
      set((s) => ({ likedIds: withLike(s.likedIds, id, wasLiked), social: { ...s.social, [id]: { ...(s.social[id] ?? before), likes: before.likes } }, socialNotice: msg(e) }));
    } finally {
      if (likeSeq.get(id) === seq) likeSeq.delete(id);
    }
  },

  toggleLike: (id) => {
    get().likeVideo(id, 'toggle');
  },

  shareVideo: async (id, channel = 'NATIVE') => {
    const before = get().social[id] ?? ZERO;
    set((s) => ({ social: { ...s.social, [id]: { ...before, shares: before.shares + 1 } } }));
    try {
      const n = await recordShare(id, channel);
      if (n !== null) set((s) => ({ social: { ...s.social, [id]: { ...(s.social[id] ?? before), shares: n } } }));
    } catch {
      // The share itself happened; only the counter failed → quietly restore it.
      set((s) => ({ social: { ...s.social, [id]: { ...(s.social[id] ?? before), shares: before.shares } } }));
    }
  },

  setCommentsCount: (id, n) => set((s) => ({ social: { ...s.social, [id]: { ...(s.social[id] ?? ZERO), comments: Math.max(0, n) } } })),
  bumpComments: (id, delta) =>
    set((s) => {
      const c = s.social[id] ?? ZERO;
      return { social: { ...s.social, [id]: { ...c, comments: Math.max(0, c.comments + delta) } } };
    }),

  clearSocialNotice: () => set({ socialNotice: null }),

  toggleFollow: (name) => set((s) => ({ followedTeachers: toggle(s.followedTeachers, name) })),
}));
