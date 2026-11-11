import { create } from 'zustand';

import {
  deleteVideo,
  listAdminVideos,
  saveVideo,
  setPublished,
  type UploadProgress,
} from '@/services/videoAdmin';
import type { AdminVideo, AsyncStatus, VideoDraft } from '@/types';

import { useFeedStore } from './useFeedStore';

interface VideoAdminState {
  videos: AdminVideo[];
  status: AsyncStatus;
  error: string | null;
  saving: boolean;
  progress: UploadProgress | null;
  load: () => Promise<void>;
  /** Create (no existing) or update; returns the saved video, or null with `error` set. */
  save: (draft: VideoDraft, publish: boolean, existing?: AdminVideo) => Promise<AdminVideo | null>;
  togglePublished: (video: AdminVideo) => Promise<void>;
  remove: (video: AdminVideo) => Promise<void>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');

/** After any change, refresh what parents see in EduFeed. */
const refreshFeed = () => useFeedStore.getState().load();

export const useVideoAdminStore = create<VideoAdminState>()((set, get) => ({
  videos: [],
  status: 'idle',
  error: null,
  saving: false,
  progress: null,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      set({ videos: await listAdminVideos(), status: 'success' });
    } catch (e) {
      set({ status: 'error', error: msg(e) });
    }
  },

  save: async (draft, publish, existing) => {
    if (get().saving) return null;
    set({ saving: true, error: null, progress: null });
    try {
      const saved = await saveVideo(draft, publish, existing, (progress) => set({ progress }));
      set((s) => ({ videos: [saved, ...s.videos.filter((v) => v.id !== saved.id)], saving: false, progress: null }));
      refreshFeed();
      return saved;
    } catch (e) {
      set({ saving: false, progress: null, error: msg(e) });
      return null;
    }
  },

  togglePublished: async (video) => {
    try {
      const saved = await setPublished(video, !video.isPublished);
      set((s) => ({ videos: s.videos.map((v) => (v.id === saved.id ? saved : v)), error: null }));
      refreshFeed();
    } catch (e) {
      set({ error: msg(e) });
    }
  },

  remove: async (video) => {
    try {
      await deleteVideo(video);
      set((s) => ({ videos: s.videos.filter((v) => v.id !== video.id), error: null }));
      refreshFeed();
    } catch (e) {
      set({ error: msg(e) });
    }
  },
}));
