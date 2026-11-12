/**
 * Quick Diagnostic Quiz engine — pure functions, no React, easy to unit-test.
 *
 * Scoring: every selected option adds its `weights` to each course category.
 * The top category is the primary recommendation; if the runner-up scores within
 * COMBO_THRESHOLD of it, we recommend a combo ("Luyện Chữ Đẹp & Tiền Tiểu Học").
 */
import type {
  CourseCategory,
  CourseFormat,
  QuizAnswers,
  QuizQuestion,
  QuizResult,
  QuizSummary,
  Teacher,
} from '@/types';

import { COURSE_CATEGORIES } from './constants';
import { COURSES, TEACHERS } from './mockData';

const COMBO_THRESHOLD = 0.7;
/** Pain-point count at which we suggest 1:1 instead of a group class. */
const ONE_ON_ONE_PAIN_POINTS = 3;

export const COURSE_TITLE: Record<CourseCategory, string> = {
  TIEN_TIEU_HOC: 'Tiền Tiểu Học',
  LUYEN_CHU_DEP: 'Luyện Chữ Đẹp',
  TOAN_TU_DUY: 'Toán Tư Duy',
  BOI_DUONG_TOAN_TV: 'Bồi Dưỡng Toán & TV',
};

export const FORMAT_INFO: Record<CourseFormat, { suffix: string; description: string }> = {
  ONE_ON_ONE: { suffix: '1:1', description: 'Kèm 1:1 · lộ trình cá nhân hoá theo từng buổi' },
  SMALL_GROUP: { suffix: 'nhóm nhỏ', description: 'Nhóm nhỏ 6–8 bé · giáo viên sát sao từng con' },
};

export const isAnswered = (q: QuizQuestion, answers: QuizAnswers) => (answers[q.id]?.length ?? 0) > 0;

/** Single-select replaces; multi-select toggles. */
export function applyAnswer(q: QuizQuestion, current: string[] = [], optionId: string): string[] {
  if (q.mode === 'single') return [optionId];
  return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
}

const selectedOptions = (q: QuizQuestion, answers: QuizAnswers) =>
  q.options.filter((o) => answers[q.id]?.includes(o.id));

export function buildSummary(questions: QuizQuestion[], answers: QuizAnswers, recommendation: string): QuizSummary {
  const labels = (id: string) => {
    const q = questions.find((x) => x.id === id);
    return q ? selectedOptions(q, answers).map((o) => o.label) : [];
  };
  return {
    ageGroup: labels('age')[0] ?? '',
    painPoints: labels('pain'),
    goal: labels('goal')[0] ?? '',
    recommendation,
  };
}

export function computeQuizResult(questions: QuizQuestion[], answers: QuizAnswers): QuizResult {
  const scores = Object.fromEntries(COURSE_CATEGORIES.map((c) => [c, 0])) as Record<CourseCategory, number>;
  const picked = questions.flatMap((q) => selectedOptions(q, answers));

  for (const o of picked) {
    for (const [cat, pts] of Object.entries(o.weights) as [CourseCategory, number][]) scores[cat] += pts;
  }

  // Stable sort: ties resolve by COURSE_CATEGORIES order (younger-learner courses first).
  const ranked = [...COURSE_CATEGORIES].sort((a, b) => scores[b] - scores[a]);
  const [primary, runnerUp] = ranked;
  const secondary =
    scores[runnerUp] > 0 && scores[runnerUp] >= scores[primary] * COMBO_THRESHOLD ? runnerUp : undefined;

  const painCount = answers.pain?.length ?? 0;
  const format: CourseFormat = secondary || painCount >= ONE_ON_ONE_PAIN_POINTS ? 'ONE_ON_ONE' : 'SMALL_GROUP';

  const courseName = secondary
    ? `${COURSE_TITLE[primary]} & ${COURSE_TITLE[secondary]}`
    : COURSE_TITLE[primary];
  const title = `Khóa ${courseName} ${FORMAT_INFO[format].suffix}`;

  // Reasons from answers that actually point at the recommended course(s).
  const targets = [primary, secondary].filter(Boolean) as CourseCategory[];
  const reasons = [
    ...new Set(
      picked
        .filter((o) => o.reason && targets.some((t) => (o.weights[t] ?? 0) > 0))
        .map((o) => o.reason!),
    ),
  ].slice(0, 3);
  if (reasons.length === 0) {
    reasons.push(COURSES.find((c) => c.id === primary)?.shortDescription ?? '');
  }

  return {
    primary,
    secondary,
    format,
    title,
    reasons,
    scores,
    summary: buildSummary(questions, answers, title),
  };
}

/** Teacher best suited to lead the recommended course. */
export const teacherFor = (course: CourseCategory): Teacher | undefined =>
  TEACHERS.find((t) => t.specialties[0] === course) ?? TEACHERS.find((t) => t.specialties.includes(course));
