import { supabase } from '@/lib/supabase';
import type { CampusLocation, CourseCategory, PortfolioItem, SkillAssessment } from '@/types';
import type { Tables } from '@/types/database';
import { sleep } from '@/utils/helpers';
import { PORTFOLIO_ITEMS } from '@/utils/mockData';

const toPortfolioItem = (r: Tables<'portfolios'>): PortfolioItem => ({
  id: r.id,
  studentName: r.student_name,
  displayName: r.display_name,
  className: r.class_name,
  course: r.course_code as CourseCategory,
  campusLocation: r.branch_location as CampusLocation,
  beforeImageUrl: r.before_image_url,
  afterImageUrl: r.after_image_url,
  beforeLabel: r.before_label,
  afterLabel: r.after_label,
  teacherName: r.teacher_name,
  teacherAvatar: r.teacher_avatar_url ?? '',
  teacherNote: r.teacher_note,
  assessments: (Array.isArray(r.assessments) ? r.assessments : []) as unknown as SkillAssessment[],
  duration: r.duration_label,
});

/**
 * Published + parent-consented portfolios (RLS enforces both — see rls_policies.sql),
 * read straight from PostgREST since no server logic is needed.
 */
export async function fetchPortfolios(course?: CourseCategory): Promise<PortfolioItem[]> {
  if (!supabase) {
    await sleep(400);
    return course ? PORTFOLIO_ITEMS.filter((p) => p.course === course) : PORTFOLIO_ITEMS;
  }

  let query = supabase.from('portfolios').select('*').order('created_at', { ascending: false }).limit(50);
  if (course) query = query.eq('course_code', course);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toPortfolioItem);
}
