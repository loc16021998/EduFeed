/**
 * Cross-sell / upsell: the best next course after a completed one.
 * The rules live in supabase/functions/_shared/recommendations.ts so the app and the Edge Function
 * (parent messages) always recommend the same thing.
 */
export {
  courseTitle,
  MAX_LEVEL,
  recommendNextCourses,
  type NextCourse,
  type NextCourseCode,
} from '../../supabase/functions/_shared/recommendations';
