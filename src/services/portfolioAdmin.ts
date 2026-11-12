/**
 * Teachers publish student progress ("Nhật ký tiến bộ") from the app:
 * before / after photos → Storage (feed-media/portfolios/…), then a row in `portfolios` (staff RLS).
 * Parents only ever see rows that are BOTH published and parent-consented (RLS + app).
 */
import { supabase } from '@/lib/supabase';
import type { CampusLocation, CourseCategory, PickedMedia } from '@/types';
import { sleep, uuidv4 } from '@/utils/helpers';

import { checkMedia, removeMedia, uploadMedia } from './media/storageUpload';

export interface PortfolioDraft {
  displayName: string;
  studentName: string;
  className: string;
  course: CourseCategory | null;
  campus: CampusLocation | null;
  teacherName: string;
  teacherNote: string;
  duration: string;
  before: PickedMedia | null;
  after: PickedMedia | null;
  /** Parent gave written consent to publish (keep the signed form on file). */
  parentConsent: boolean;
  /** Show it to parents now (only possible with consent). */
  publish: boolean;
}

export type DraftErrors = Partial<Record<keyof PortfolioDraft | 'form', string>>;

const isName = (s: string, min = 2) => s.trim().length >= min && s.trim().length <= 60;

export function validateDraft(d: PortfolioDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!isName(d.displayName)) e.displayName = 'Tên hiển thị 2–60 ký tự (VD: Bé Gia Bảo)';
  if (!isName(d.studentName)) e.studentName = 'Nhập họ tên học sinh (chỉ nhân viên thấy)';
  if (d.className.trim().length > 40) e.className = 'Tối đa 40 ký tự';
  if (!d.course) e.course = 'Chọn khóa học';
  if (!d.campus) e.campus = 'Chọn cơ sở';
  if (!isName(d.teacherName)) e.teacherName = 'Nhập tên giáo viên';
  const note = d.teacherNote.trim().length;
  if (note < 20 || note > 600) e.teacherNote = 'Nhận xét 20–600 ký tự, cụ thể về tiến bộ của con';
  if (!d.duration.trim() || d.duration.trim().length > 30) e.duration = 'VD: 2 tháng';
  if (!d.before) e.before = 'Chọn ảnh TRƯỚC khi học';
  else e.before = checkMedia(d.before, 'image') ?? undefined;
  if (!d.after) e.after = 'Chọn ảnh SAU khi học';
  else e.after = checkMedia(d.after, 'image') ?? undefined;
  if (d.publish && !d.parentConsent) e.parentConsent = 'Chỉ đăng công khai khi đã có đồng ý bằng văn bản của phụ huynh';
  for (const k of Object.keys(e) as (keyof DraftErrors)[]) if (!e[k]) delete e[k];
  return e;
}

const ext = (m: PickedMedia) => (m.type === 'image/png' ? 'png' : m.type === 'image/webp' ? 'webp' : 'jpg');

export interface SaveResult {
  id: string;
  published: boolean;
}

/** Uploads both photos then inserts the row; cleans up the photos if the insert fails. */
export async function savePortfolio(d: PortfolioDraft, onProgress?: (fraction: number) => void): Promise<SaveResult> {
  const errors = validateDraft(d);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
  const published = d.publish && d.parentConsent;

  if (!supabase) {
    // Demo mode: nothing leaves the device.
    for (let i = 1; i <= 10; i++) {
      await sleep(80);
      onProgress?.(i / 10);
    }
    return { id: uuidv4(), published };
  }

  const id = uuidv4();
  const paths = [`portfolios/${id}-before.${ext(d.before!)}`, `portfolios/${id}-after.${ext(d.after!)}`];
  const beforeUrl = await uploadMedia(paths[0], d.before!, (f) => onProgress?.(f * 0.45));
  const afterUrl = await uploadMedia(paths[1], d.after!, (f) => onProgress?.(0.45 + f * 0.45));

  const { error } = await supabase.from('portfolios').insert({
    id,
    student_name: d.studentName.trim(),
    display_name: d.displayName.trim(),
    class_name: d.className.trim(),
    course_code: d.course!,
    branch_location: d.campus!,
    before_image_url: beforeUrl,
    after_image_url: afterUrl,
    teacher_name: d.teacherName.trim(),
    teacher_note: d.teacherNote.trim(),
    duration_label: d.duration.trim(),
    parent_consent: d.parentConsent,
    is_published: published,
  });
  if (error) {
    await removeMedia(paths).catch(() => {});
    if (/row-level security|permission/i.test(error.message)) throw new Error('Tài khoản không có quyền đăng nhật ký. Liên hệ quản trị viên.');
    throw new Error('Không lưu được nhật ký, vui lòng thử lại.');
  }
  onProgress?.(1);
  return { id, published };
}
