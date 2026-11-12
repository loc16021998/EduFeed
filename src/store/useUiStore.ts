import { create } from 'zustand';

interface UiState {
  /**
   * Web only: let the current screen use the full browser width instead of the phone-width column
   * (the admin dashboard on a desktop). Set by that screen while it is focused.
   */
  wideLayout: boolean;
  setWideLayout: (wide: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  wideLayout: false,
  setWideLayout: (wideLayout) => set({ wideLayout }),
}));
