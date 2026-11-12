import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { FeedItem } from '@/types';

/** Minimal copy of a saved video, so the list still renders before the feed has loaded. */
export type SavedVideo = Pick<FeedItem, 'id' | 'title' | 'thumbnailUrl' | 'videoUrl' | 'category' | 'teacherName' | 'shareSlug' | 'ctaLink' | 'ctaText'> & {
  savedAt: string;
};

interface BookmarkState {
  saved: SavedVideo[];
  isSaved: (id: string) => boolean;
  /** Returns true when the video is now saved. */
  toggle: (item: FeedItem) => boolean;
}

/** "Lưu video" — favourites kept on this device (parents have no account). */
export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      saved: [],
      isSaved: (id) => get().saved.some((v) => v.id === id),
      toggle: (item) => {
        if (get().isSaved(item.id)) {
          set({ saved: get().saved.filter((v) => v.id !== item.id) });
          return false;
        }
        const { id, title, thumbnailUrl, videoUrl, category, teacherName, shareSlug, ctaLink, ctaText } = item;
        set({ saved: [{ id, title, thumbnailUrl, videoUrl, category, teacherName, shareSlug, ctaLink, ctaText, savedAt: new Date().toISOString() }, ...get().saved].slice(0, 100) });
        return true;
      },
    }),
    { name: 'thedu.bookmarks', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
