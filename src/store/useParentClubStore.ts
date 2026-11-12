import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { haptics } from '@/utils/haptics';
import { BADGES, PARENT_CLUB_REWARD, type BadgeId } from '@/utils/parentClub';

import { useNotificationStore } from './useNotificationStore';

type Celebration = { kind: 'badge'; id: BadgeId } | { kind: 'reward' };

interface ParentClubState {
  quizDone: boolean;
  /** Video ids watched ≥ VIDEO_WATCH_MS (unique). */
  watched: string[];
  /** Portfolio ids whose before/after slider was dragged to a full reveal. */
  revealed: string[];
  unlockedAt: Partial<Record<BadgeId, string>>;
  /** Queue of unlock celebrations to show (not persisted). */
  celebrations: Celebration[];
  /** Badge sheet visibility (not persisted). */
  sheetOpen: boolean;

  markQuizDone: () => void;
  markVideoWatched: (videoId: string) => void;
  markProgressRevealed: (portfolioId: string) => void;
  /** Remove the celebration currently shown. */
  shiftCelebration: () => void;
  openSheet: () => void;
  closeSheet: () => void;
}

/** Actions done for a badge, capped at its goal. */
export function badgeProgress(s: Pick<ParentClubState, 'quizDone' | 'watched' | 'revealed'>, id: BadgeId): number {
  const goal = BADGES.find((b) => b.id === id)!.goal;
  const n = id === 'WISE_PARENT' ? (s.quizDone ? 1 : 0) : id === 'COMPANION' ? s.watched.length : s.revealed.length;
  return Math.min(n, goal);
}

export const allBadgesUnlocked = (s: Pick<ParentClubState, 'unlockedAt'>) => BADGES.every((b) => !!s.unlockedAt[b.id]);

/** The reward is usable once every badge is collected (and a reward is configured). */
export const rewardUnlocked = (s: Pick<ParentClubState, 'unlockedAt'>) => !!PARENT_CLUB_REWARD && allBadgesUnlocked(s);

export const useParentClubStore = create<ParentClubState>()(
  persist(
    (set, get) => {
      /** Recompute unlocks after any progress change; queue celebrations for new ones. */
      const settle = () => {
        const s = get();
        const unlockedAt = { ...s.unlockedAt };
        const fresh: Celebration[] = [];
        for (const b of BADGES) {
          if (!unlockedAt[b.id] && badgeProgress(s, b.id) >= b.goal) {
            unlockedAt[b.id] = new Date().toISOString();
            fresh.push({ kind: 'badge', id: b.id });
          }
        }
        if (!fresh.length) return;
        if (PARENT_CLUB_REWARD && !allBadgesUnlocked(s) && allBadgesUnlocked({ unlockedAt })) fresh.push({ kind: 'reward' });
        haptics.success();
        set({ unlockedAt, celebrations: [...s.celebrations, ...fresh] });
        const add = useNotificationStore.getState().add;
        for (const c of fresh) {
          if (c.kind === 'reward' && PARENT_CLUB_REWARD) {
            add({ key: 'club:reward', kind: 'REWARD', title: `Ưu đãi đã mở khóa: ${PARENT_CLUB_REWARD.title}`, body: PARENT_CLUB_REWARD.detail, link: 'PARENT_CLUB' });
          } else if (c.kind === 'badge') {
            const b = BADGES.find((x) => x.id === c.id)!;
            add({ key: `club:${b.id}`, kind: 'SYSTEM', title: `Huy hiệu mới: ${b.title}`, body: 'Xem bộ sưu tập CLB Phụ huynh TH EDU.', link: 'PARENT_CLUB' });
          }
        }
      };

      return {
        quizDone: false,
        watched: [],
        revealed: [],
        unlockedAt: {},
        celebrations: [],
        sheetOpen: false,

        markQuizDone: () => {
          if (get().quizDone) return;
          set({ quizDone: true });
          settle();
        },
        markVideoWatched: (videoId) => {
          const { watched } = get();
          if (watched.includes(videoId) || watched.length >= 50) return;
          set({ watched: [...watched, videoId] });
          settle();
        },
        markProgressRevealed: (portfolioId) => {
          const { revealed } = get();
          if (revealed.includes(portfolioId) || revealed.length >= 50) return;
          set({ revealed: [...revealed, portfolioId] });
          settle();
        },
        shiftCelebration: () => set((s) => ({ celebrations: s.celebrations.slice(1) })),
        openSheet: () => set({ sheetOpen: true }),
        closeSheet: () => set({ sheetOpen: false }),
      };
    },
    {
      name: 'thedu.parentClub',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ quizDone, watched, revealed, unlockedAt }) => ({ quizDone, watched, revealed, unlockedAt }),
    },
  ),
);
