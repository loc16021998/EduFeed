import { create } from 'zustand';

import type { QuizAnswers, QuizResult } from '@/types';
import { QUIZ_QUESTIONS } from '@/utils/mockData';
import { applyAnswer, computeQuizResult, isAnswered } from '@/utils/quiz';

interface QuizState {
  /** 0-based index into QUIZ_QUESTIONS. */
  step: number;
  /** 1 = moving forward, -1 = moving back. Drives the slide direction. */
  direction: 1 | -1;
  answers: QuizAnswers;
  result: QuizResult | null;

  selectOption: (questionId: string, optionId: string) => void;
  /** Advance; on the last step computes the result. No-op if the step is unanswered. */
  next: () => void;
  back: () => void;
  reset: () => void;
}

const initial = { step: 0, direction: 1 as const, answers: {}, result: null };

export const useQuizStore = create<QuizState>()((set, get) => ({
  ...initial,

  selectOption: (questionId, optionId) => {
    const q = QUIZ_QUESTIONS.find((x) => x.id === questionId);
    if (!q) return;
    set((s) => ({ answers: { ...s.answers, [q.id]: applyAnswer(q, s.answers[q.id], optionId) } }));
  },

  next: () => {
    const { step, answers } = get();
    const q = QUIZ_QUESTIONS[step];
    if (!q || !isAnswered(q, answers)) return;
    if (step >= QUIZ_QUESTIONS.length - 1) {
      set({ result: computeQuizResult(QUIZ_QUESTIONS, answers), direction: 1 });
    } else {
      set({ step: step + 1, direction: 1 });
    }
  },

  back: () =>
    set((s) =>
      s.result
        ? { result: null, direction: -1 } // from result → back to last question
        : { step: Math.max(0, s.step - 1), direction: -1 },
    ),

  reset: () => set(initial),
}));

// ─── Selectors ──────────────────────────────────────────────────────────────

export const selectCurrentQuestion = (s: QuizState) => QUIZ_QUESTIONS[s.step];
export const selectCanContinue = (s: QuizState) => {
  const q = QUIZ_QUESTIONS[s.step];
  return !!q && isAnswered(q, s.answers);
};
export const QUIZ_TOTAL_STEPS = QUIZ_QUESTIONS.length;
