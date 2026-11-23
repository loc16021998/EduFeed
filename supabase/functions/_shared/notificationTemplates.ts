/**
 * Push notification templates — shared by the Edge Function (renders + sends) and the app (routing,
 * settings copy). Pure TypeScript: no Deno / React Native imports.
 *
 * Privacy on the lock screen: titles / bodies may be seen by anyone near the phone, so they carry only
 * what the recipient needs at a glance. Phone numbers are masked ("0912 *** 678"); the full number is
 * one tap away inside the app. `data.params` only carries ids needed for navigation.
 */

export type PushRole = 'PARENT' | 'TEACHER' | 'ADVISOR' | 'MANAGER' | 'GUEST';

export type PushEvent =
  | 'DAILY_REPORT_POSTED'
  | 'ATTENDANCE_CHECKIN'
  | 'STREAK_OR_VOUCHER'
  | 'UPCOMING_CLASS_REMINDER'
  | 'NEW_LEAVE_REQUEST'
  | 'HOT_LEAD_ASSIGNED'
  | 'TRIAL_REMINDER_ACTION';

/** Maps to the three switches in "Cài đặt thông báo" (notification_preferences). */
export type PushCategory = 'CLASS' | 'REMINDER' | 'PROMO';

export type AndroidChannelId = 'default' | 'urgent_reminders' | 'class_updates';

/** App screens a notification can open (names from src/navigation/types.ts). */
export type PushRoute = 'ParentPortal' | 'Referral' | 'TeacherDashboard' | 'AdvisorTasks' | 'StaffTrials';

export interface AndroidChannelDef {
  id: AndroidChannelId;
  name: string;
  description: string;
  importance: 'DEFAULT' | 'HIGH';
  vibrate: boolean;
}

/** Created on Android 8+ when push is enabled (users can tune each one in system settings). */
export const ANDROID_CHANNELS: AndroidChannelDef[] = [
  { id: 'class_updates', name: 'Cập nhật lớp học', description: 'Sổ liên lạc, ảnh bài vở, điểm danh của bé', importance: 'DEFAULT', vibrate: true },
  { id: 'urgent_reminders', name: 'Nhắc lịch & học phí', description: 'Giờ dạy, lịch học thử cần xác nhận, khách mới đăng ký', importance: 'HIGH', vibrate: true },
  { id: 'default', name: 'Tin tức & ưu đãi', description: 'Thử thách 21 ngày, quà và ưu đãi học phí', importance: 'DEFAULT', vibrate: false },
];

export type PushParams = Record<string, string | number | null | undefined>;

interface TemplateDef {
  roles: PushRole[];
  category: PushCategory;
  channel: AndroidChannelId;
  /** Urgent = high priority + never delayed by quiet hours. */
  urgent: boolean;
  route: PushRoute;
  title: (p: PushParams) => string;
  body: (p: PushParams) => string;
  /** Params safe to put in the data payload (ids for navigation). */
  dataKeys: string[];
}

const s = (v: unknown, fallback: string) => {
  const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  return t || fallback;
};

export const TEMPLATES: Record<PushEvent, TemplateDef> = {
  DAILY_REPORT_POSTED: {
    roles: ['PARENT'],
    category: 'CLASS',
    channel: 'class_updates',
    urgent: false,
    route: 'ParentPortal',
    title: () => 'Sổ liên lạc mới 📒',
    body: (p) => `Cô giáo vừa cập nhật sổ liên lạc & ảnh bài vở của bé ${s(p.studentName, 'nhà mình')}`,
    dataKeys: ['studentId', 'reportId'],
  },
  ATTENDANCE_CHECKIN: {
    roles: ['PARENT'],
    category: 'CLASS',
    channel: 'class_updates',
    urgent: false,
    route: 'ParentPortal',
    title: () => 'Bé đã đến lớp ✅',
    body: (p) => `Bé ${s(p.studentName, 'nhà mình')} đã có mặt tại ${campusName(p.campus)} lúc ${s(p.time, 'vừa xong')}`,
    dataKeys: ['studentId'],
  },
  STREAK_OR_VOUCHER: {
    roles: ['PARENT'],
    category: 'PROMO',
    channel: 'default',
    urgent: false,
    route: 'ParentPortal',
    title: () => 'Thử thách 21 ngày 🌱',
    body: () => 'Giữ chuỗi thử thách 21 ngày cho con & nhận ưu đãi học phí',
    dataKeys: [],
  },
  UPCOMING_CLASS_REMINDER: {
    roles: ['TEACHER'],
    category: 'REMINDER',
    channel: 'urgent_reminders',
    urgent: true,
    route: 'TeacherDashboard',
    title: (p) => `Sắp tới giờ dạy · ${s(p.start, '')}`.replace(/ · $/, ''),
    body: (p) => `Sắp tới giờ dạy lớp ${s(p.className, 'của bạn')} tại ${campusName(p.campus)} — Mở điểm danh QR nhanh`,
    dataKeys: ['classId'],
  },
  NEW_LEAVE_REQUEST: {
    roles: ['TEACHER'],
    category: 'CLASS',
    channel: 'class_updates',
    urgent: false,
    route: 'TeacherDashboard',
    title: (p) => (p.type === 'MAKEUP' ? 'Yêu cầu học bù mới' : 'Yêu cầu nghỉ phép mới'),
    body: (p) =>
      p.type === 'MAKEUP'
        ? `Phụ huynh bé ${s(p.studentName, '')} vừa gửi yêu cầu học bù${p.date ? ` ngày ${p.date}` : ''}`
        : `Phụ huynh bé ${s(p.studentName, '')} vừa gửi yêu cầu nghỉ phép${p.date ? ` ngày ${p.date}` : ''}`,
    dataKeys: ['classId', 'requestId'],
  },
  HOT_LEAD_ASSIGNED: {
    roles: ['ADVISOR', 'MANAGER'],
    category: 'REMINDER',
    channel: 'urgent_reminders',
    urgent: true,
    route: 'AdvisorTasks',
    title: () => 'Lead mới đăng ký học thử 🔥',
    body: (p) => `Lead mới đăng ký học thử môn ${s(p.course, '')} tại ${campusName(p.campus)}: ${s(p.parentName, 'Phụ huynh')} (${maskPhone(p.phone)})`,
    dataKeys: ['leadId'],
  },
  TRIAL_REMINDER_ACTION: {
    roles: ['ADVISOR', 'MANAGER'],
    category: 'REMINDER',
    channel: 'urgent_reminders',
    urgent: true,
    route: 'StaffTrials',
    title: () => 'Lịch học thử cần xác nhận',
    body: (p) => `Nhắc lịch học thử sắp diễn ra của bé ${s(p.studentName, '')}${p.time ? ` (${p.time})` : ''} — Cần xác nhận`,
    dataKeys: ['leadId'],
  },
};

/** Branch names are stored as "Cơ sở Xa La"; accept both forms so copy never reads "cơ sở Cơ sở". */
export function campusName(v: unknown): string {
  const n = String(v ?? '').trim();
  if (!n) return 'trung tâm';
  return /^cơ sở/i.test(n) ? `cơ sở ${n.replace(/^cơ sởs*/i, '')}` : `cơ sở ${n}`;
}

/** "0912345678" → "0912 *** 678"; anything else → "đã ẩn số". */
export function maskPhone(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 4)} *** ${d.slice(-3)}` : 'đã ẩn số';
}

export interface PushData {
  roleTarget: PushRole[];
  eventType: PushEvent;
  deepLinkRoute: PushRoute;
  params: Record<string, string>;
}

export interface RenderedPush {
  title: string;
  body: string;
  channelId: AndroidChannelId;
  category: PushCategory;
  urgent: boolean;
  data: PushData;
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function renderPush(event: PushEvent, params: PushParams = {}): RenderedPush {
  const t = TEMPLATES[event];
  const dataParams: Record<string, string> = {};
  for (const k of t.dataKeys) if (params[k] !== undefined && params[k] !== null && params[k] !== '') dataParams[k] = String(params[k]);
  return {
    title: clip(t.title(params), 65),
    body: clip(t.body(params).replace(/\s+/g, ' ').trim(), 178),
    channelId: t.channel,
    category: t.category,
    urgent: t.urgent,
    data: { roleTarget: t.roles, eventType: event, deepLinkRoute: t.route, params: dataParams },
  };
}

export const isPushEvent = (v: unknown): v is PushEvent => typeof v === 'string' && v in TEMPLATES;
