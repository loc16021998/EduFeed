/**
 * Cross-sell / upsell rules: the best next course after a completed one.
 * Import-free — shared by the app (src/services/recommendationService.ts) and the Edge Function.
 *
 * Courses have levels (1…MAX_LEVEL) instead of separate "nâng cao" courses:
 *   "Luyện chữ đẹp nâng cao" = LUYEN_CHU_DEP level 2+, "Toán tư duy cấp 2" = TOAN_TU_DUY level 2.
 * Keep the rules honest: recommend only courses the centre actually teaches.
 */

export type NextCourseCode = 'TIEN_TIEU_HOC' | 'LUYEN_CHU_DEP' | 'TOAN_TU_DUY' | 'BOI_DUONG_TOAN_TV';

export const MAX_LEVEL = 3;

export const COURSE_TITLES: Record<NextCourseCode, string> = {
  TIEN_TIEU_HOC: 'Tiền tiểu học',
  LUYEN_CHU_DEP: 'Luyện chữ đẹp',
  TOAN_TU_DUY: 'Toán tư duy',
  BOI_DUONG_TOAN_TV: 'Bồi dưỡng Toán & Tiếng Việt',
};

export interface NextCourse {
  courseCode: NextCourseCode;
  level: number;
  /** "Luyện chữ đẹp nâng cao (cấp 2)" */
  title: string;
  /** One line for the parent message / staff card. */
  reason: string;
}

/** "Toán tư duy cấp 2", "Luyện chữ đẹp nâng cao (cấp 2)", "Tiền tiểu học". */
export function courseTitle(code: NextCourseCode, level = 1): string {
  if (level <= 1) return COURSE_TITLES[code];
  if (code === 'LUYEN_CHU_DEP') return `Luyện chữ đẹp nâng cao (cấp ${level})`;
  return `${COURSE_TITLES[code]} cấp ${level}`;
}

const next = (courseCode: NextCourseCode, level: number, reason: string): NextCourse => ({
  courseCode,
  level,
  title: courseTitle(courseCode, level),
  reason,
});

/**
 * Ordered recommendations (best first) for a completed course. Never returns the same course + level.
 * Unknown codes → [] (no recommendation rather than a guess).
 */
export function recommendNextCourses(completed: { courseCode: string; level?: number }): NextCourse[] {
  const level = Math.min(Math.max(Math.trunc(completed.level ?? 1), 1), MAX_LEVEL);
  switch (completed.courseCode) {
    case 'TIEN_TIEU_HOC':
      return [
        next('LUYEN_CHU_DEP', 1, 'Giữ nếp viết đúng tư thế, chữ đều nét ngay từ lớp 1'),
        next('TOAN_TU_DUY', 1, 'Phát triển tư duy logic và phản xạ tính nhẩm'),
      ];
    case 'LUYEN_CHU_DEP':
      return level < MAX_LEVEL
        ? [next('LUYEN_CHU_DEP', level + 1, 'Luyện chữ nghiêng, nét thanh nét đậm và tốc độ viết')]
        : [next('BOI_DUONG_TOAN_TV', 1, 'Củng cố Tiếng Việt: chính tả, đọc hiểu, viết đoạn văn')];
    case 'TOAN_TU_DUY':
      return level < MAX_LEVEL
        ? [
            next('TOAN_TU_DUY', level + 1, 'Bài toán tư duy nhiều bước, toán có lời văn khó hơn'),
            next('BOI_DUONG_TOAN_TV', 1, 'Bám sát chương trình trên lớp, nâng điểm Toán & Tiếng Việt'),
          ]
        : [next('BOI_DUONG_TOAN_TV', 1, 'Bám sát chương trình trên lớp, nâng điểm Toán & Tiếng Việt')];
    case 'BOI_DUONG_TOAN_TV':
      return level < MAX_LEVEL
        ? [
            next('BOI_DUONG_TOAN_TV', level + 1, 'Tiếp tục lộ trình bồi dưỡng theo chương trình lớp trên'),
            next('TOAN_TU_DUY', 1, 'Phát triển tư duy logic ngoài chương trình'),
          ]
        : [next('TOAN_TU_DUY', 1, 'Phát triển tư duy logic ngoài chương trình')];
    default:
      return [];
  }
}
