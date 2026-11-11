import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ChecklistState {
  /** checklistId → checked item ids */
  checked: Record<string, string[]>;
  /** checklistId → ISO time the parent first completed it (for the one-time celebration). */
  completedAt: Record<string, string>;
  toggle: (checklistId: string, itemId: string) => void;
  markCompleted: (checklistId: string) => void;
  reset: (checklistId: string) => void;
}

/** Parent's checklist progress — persisted locally; nothing is sent to the server. */
export const useChecklistStore = create<ChecklistState>()(
  persist(
    (set) => ({
      checked: {},
      completedAt: {},

      toggle: (checklistId, itemId) =>
        set((s) => {
          const current = s.checked[checklistId] ?? [];
          const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
          return { checked: { ...s.checked, [checklistId]: next } };
        }),

      markCompleted: (checklistId) =>
        set((s) =>
          s.completedAt[checklistId] ? s : { completedAt: { ...s.completedAt, [checklistId]: new Date().toISOString() } },
        ),

      reset: (checklistId) =>
        set((s) => {
          const { [checklistId]: _c, ...checked } = s.checked;
          const { [checklistId]: _d, ...completedAt } = s.completedAt;
          return { checked, completedAt };
        }),
    }),
    { name: 'thedu.checklists', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
