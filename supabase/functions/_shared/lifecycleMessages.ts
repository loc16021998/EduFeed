/**
 * Parent messages for the four post-course stages (see migrations/20261122090000_lifecycle_upsell.sql).
 * Pure functions (no I/O) so they can be unit-tested; sending reuses sendZaloMessage().
 *
 * ZNS template params (must match the templates approved on Zalo):
 *   COMPLETION_CERT   C_NAME, STUDENT_NAME, COURSE, CERT_CODE, CERT_URL
 *   TEACHER_REVIEW    C_NAME, STUDENT_NAME, COURSE, TEACHER_NOTE, NEXT_COURSE
 *   ALUMNI_DISCOUNT   C_NAME, STUDENT_NAME, VOUCHER, NEXT_COURSE, EXPIRY, PHONE
 *   FINAL_CALL        C_NAME, STUDENT_NAME, NEXT_COURSE, PHONE
 *
 * Honesty rules: the alumni offer is only sent when ALUMNI_VOUCHER holds a real offer; the final message
 * announces a call from an advisor — it never claims "few seats left" (we have no seat data).
 */
import { courseTitle, recommendNextCourses, type NextCourseCode } from './recommendations.ts';
import { toZaloPhone, type OaTextMessage, type ZnsMode, type ZnsPayload } from './zaloPayloads.ts';

export const LIFECYCLE_STAGES = ['COMPLETION_CERT', 'TEACHER_REVIEW', 'ALUMNI_DISCOUNT', 'FINAL_CALL'] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Shape returned by the `lifecycle_context()` database function. */
export interface LifecycleContext {
  automation_id: string;
  stage: LifecycleStage;
  attempt: number;
  enrollment: {
    id: string;
    student_name: string;
    course_code: string;
    course_name: string;
    level: number;
    start_date: string;
    end_date: string | null;
    teacher_note: string | null;
    certificate_code: string | null;
    status: string;
  };
  family: { lead_id: string; parent_name: string; phone_number: string; zalo_user_id: string | null } | null;
  branch: { code: string; name: string; address: string };
}

export interface LifecycleConfig {
  accessToken: string;
  mode: ZnsMode;
  templates: Record<LifecycleStage, string>;
  hotline: string;
  /** Public web app address (certificate link). */
  webUrl: string;
  /** Real alumni offer, e.g. "Giảm 500.000đ học phí khóa tiếp theo". Empty = ALUMNI_DISCOUNT is skipped. */
  alumniVoucher: string;
  /** Offer validity in days after it is sent. */
  alumniVoucherDays: number;
}

export const LIFECYCLE_TEMPLATE_ENV: Record<LifecycleStage, string> = {
  COMPLETION_CERT: 'ZNS_TEMPLATE_COMPLETION_CERT',
  TEACHER_REVIEW: 'ZNS_TEMPLATE_TEACHER_REVIEW',
  ALUMNI_DISCOUNT: 'ZNS_TEMPLATE_ALUMNI_DISCOUNT',
  FINAL_CALL: 'ZNS_TEMPLATE_FINAL_CALL',
};

export type LifecyclePlan = { channel: 'ZNS'; payload: ZnsPayload } | { channel: 'OA'; payload: OaTextMessage } | { skip: string };

const param = (v: string, max = 100) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);
const pad = (n: number) => String(n).padStart(2, '0');
/** dd/mm/yyyy in Vietnam time. */
const vnDate = (d: Date) => {
  const v = new Date(d.getTime() + 7 * 3600_000);
  return `${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
};

type Built = { data: Record<string, string>; text: string } | { missing: string };

export function buildLifecycleMessage(ctx: LifecycleContext, cfg: LifecycleConfig, now = new Date()): Built {
  if (!ctx.family) return { missing: 'thông tin phụ huynh (đăng ký gốc đã bị xóa)' };
  const e = ctx.enrollment;
  const name = param(ctx.family.parent_name, 30);
  const child = param(e.student_name, 30);
  const course = courseTitle(e.course_code as NextCourseCode, e.level) || e.course_name;
  const recs = recommendNextCourses({ courseCode: e.course_code, level: e.level });
  const nextTitle = recs.map((r) => r.title).join(' hoặc ');
  const hotline = cfg.hotline.replace(/\s+/g, '');

  switch (ctx.stage) {
    case 'COMPLETION_CERT': {
      if (!e.certificate_code) return { missing: 'certificate_code' };
      const url = cfg.webUrl ? `${cfg.webUrl}/chung-nhan/${e.certificate_code}` : '';
      return {
        data: { C_NAME: name, STUDENT_NAME: child, COURSE: param(course), CERT_CODE: e.certificate_code, CERT_URL: url || e.certificate_code },
        text:
          `🎓 Chúc mừng bé ${e.student_name} đã hoàn thành khóa ${course} tại TH EDU!\n` +
          `Cảm ơn ba mẹ ${ctx.family.parent_name} đã luôn đồng hành cùng con.\n` +
          (url ? `📜 Chứng nhận của bé: ${url}` : `📜 Mã chứng nhận: ${e.certificate_code}`),
      };
    }
    case 'TEACHER_REVIEW': {
      if (!e.teacher_note) return { missing: 'nhận xét của giáo viên' };
      return {
        data: { C_NAME: name, STUDENT_NAME: child, COURSE: param(course), TEACHER_NOTE: param(e.teacher_note, 250), NEXT_COURSE: param(nextTitle || '—') },
        text:
          `📝 Nhận xét cuối khóa ${course} của bé ${e.student_name}:\n"${e.teacher_note}"\n` +
          (nextTitle ? `👉 Gợi ý lộ trình tiếp theo: ${nextTitle}.` : ''),
      };
    }
    case 'ALUMNI_DISCOUNT': {
      if (!cfg.alumniVoucher) return { missing: 'ALUMNI_VOUCHER (chưa có ưu đãi học viên cũ thật)' };
      if (!hotline) return { missing: 'CENTRE_HOTLINE' };
      if (!nextTitle) return { missing: 'khóa học gợi ý tiếp theo' };
      const expiry = vnDate(new Date(now.getTime() + cfg.alumniVoucherDays * 86400_000));
      return {
        data: { C_NAME: name, STUDENT_NAME: child, VOUCHER: param(cfg.alumniVoucher, 80), NEXT_COURSE: param(nextTitle), EXPIRY: expiry, PHONE: hotline },
        text: `🎁 Ưu đãi dành cho học viên TH EDU: ${cfg.alumniVoucher} khi bé ${e.student_name} đăng ký ${nextTitle}.\nÁp dụng đến ${expiry}. ☎️ ${hotline}`,
      };
    }
    case 'FINAL_CALL': {
      if (!hotline) return { missing: 'CENTRE_HOTLINE' };
      return {
        data: { C_NAME: name, STUDENT_NAME: child, NEXT_COURSE: param(nextTitle || 'lộ trình phù hợp'), PHONE: hotline },
        text:
          `Chào ${ctx.family.parent_name}! Giáo viên tư vấn TH EDU sẽ gọi cho ba mẹ trong vài ngày tới để cùng chọn lộ trình tiếp theo cho bé ${e.student_name}` +
          (nextTitle ? ` (${nextTitle})` : '') +
          `.\nBa mẹ muốn trao đổi sớm hơn, vui lòng gọi ☎️ ${hotline}.`,
      };
    }
  }
}

/** Approved ZNS template → ZNS; else parent linked Zalo → OA message; else skip (with the reason). */
export function planLifecycleDelivery(ctx: LifecycleContext, cfg: LifecycleConfig, now = new Date()): LifecyclePlan {
  if (!cfg.accessToken) return { skip: 'Chưa cấu hình ZALO_OA_ACCESS_TOKEN' };
  const built = buildLifecycleMessage(ctx, cfg, now);
  if ('missing' in built) return { skip: `Thiếu dữ liệu/cấu hình: ${built.missing}` };

  const templateId = cfg.templates[ctx.stage];
  if (templateId) {
    const phone = toZaloPhone(ctx.family!.phone_number);
    if (!/^84[35789]\d{8}$/.test(phone)) return { skip: `Số điện thoại không hợp lệ cho ZNS: ${ctx.family!.phone_number}` };
    return {
      channel: 'ZNS',
      payload: {
        phone,
        template_id: templateId,
        template_data: built.data,
        tracking_id: `${ctx.automation_id}:${ctx.stage}`,
        ...(cfg.mode === 'development' ? { mode: 'development' as const } : {}),
      },
    };
  }
  if (ctx.family!.zalo_user_id) {
    return { channel: 'OA', payload: { recipient: { user_id: ctx.family!.zalo_user_id }, message: { text: built.text } } };
  }
  return { skip: `Chưa cấu hình mẫu ZNS (${LIFECYCLE_TEMPLATE_ENV[ctx.stage]}) và phụ huynh chưa liên kết Zalo OA` };
}
