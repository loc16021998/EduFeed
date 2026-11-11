import type { PromoCode } from '../../supabase/functions/_shared/contracts';

export type { PromoCode };

// ─── Domain enums ────────────────────────────────────────────────────────────

export type Category =
  | 'ALL'
  | 'TIEN_TIEU_HOC'
  | 'LUYEN_CHU_DEP'
  | 'TOAN_TU_DUY'
  | 'BOI_DUONG_TOAN_TV';

/** A real course category (everything except the `ALL` filter). */
export type CourseCategory = Exclude<Category, 'ALL'>;

export type CampusLocation = 'XA_LA' | 'NGO_THI_NHAM';

// ─── Core models ─────────────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  category: CourseCategory;
  teacherName: string;
  teacherAvatar: string;
  tags: string[];
  ctaText: string;
  /** Deep link (thedu://...) or https URL. */
  ctaLink: string;
  /** Short id for the public share link /v/<shareSlug> (absent on bundled sample data). */
  shareSlug?: string;
}

export interface PortfolioItem {
  id: string;
  studentName: string;
  /** Friendly display name, e.g. "Bé Gia Bảo". */
  displayName: string;
  /** School class / age group, e.g. "Lớp 1" or "Mầm non 5 tuổi". */
  className: string;
  course: CourseCategory;
  campusLocation: CampusLocation;
  beforeImageUrl: string;
  afterImageUrl: string;
  /** Overlay label on the before image (top-left), e.g. "Nét chữ cũ". */
  beforeLabel: string;
  /** Overlay label on the after image (top-right). */
  afterLabel: string;
  teacherName: string;
  teacherAvatar: string;
  /** Teacher's quote shown on the feedback card. */
  teacherNote: string;
  assessments: SkillAssessment[];
  /** Human-readable learning duration, e.g. "2 tháng". */
  duration: string;
}

/** Qualitative skill rating on a 1–5 scale, before vs. now. */
export interface SkillAssessment {
  skill: string;
  before: 1 | 2 | 3 | 4 | 5;
  after: 1 | 2 | 3 | 4 | 5;
}

/** Question id → selected option ids (single-select questions hold one id). */
export type QuizAnswers = Record<string, string[]>;

/** Human-readable diagnostic summary attached to a booking for the consultant. */
export interface QuizSummary {
  ageGroup: string;
  painPoints: string[];
  goal: string;
  /** e.g. "Khóa Luyện Chữ Đẹp & Tiền Tiểu Học 1:1" */
  recommendation: string;
}

/** Where the lead came from — for marketing attribution. */
export type LeadSource = 'FEED' | 'QUIZ' | 'PORTFOLIO' | 'DIRECT' | 'SHARE_LINK';

export interface BookingPayload {
  studentName: string;
  childAge: number;
  parentName: string;
  phone: string;
  selectedCourse: CourseCategory;
  selectedCampus: CampusLocation;
  /** Local calendar date, YYYY-MM-DD. */
  preferredDate: string;
  preferredSlotId: string;
  source: LeadSource;
  /** Video id that led to this booking. */
  sourceRef?: string;
  /** Set when parent details were auto-filled via Zalo Quick Auth. */
  zaloUserId?: string;
  /** In-app incentive the parent claimed (see PROMO_CODES). */
  promoCode?: PromoCode;
  quizAnswers?: QuizAnswers;
  quizSummary?: QuizSummary;
}

/** A 90-minute trial slot. Weekday slots run evenings, weekend slots run daytime. */
export interface TimeSlot {
  id: string;
  label: string;
  kind: 'WEEKDAY' | 'WEEKEND';
}

// ─── Supporting models ───────────────────────────────────────────────────────

export interface Teacher {
  id: string;
  name: string;
  avatarUrl: string;
  specialties: CourseCategory[];
  bio: string;
}

export interface Campus {
  id: CampusLocation;
  /** "CS1" / "CS2" */
  code: string;
  name: string;
  /** Compact address for radio rows, e.g. "26 LK2 KĐT Xa La, Hà Đông". */
  shortAddress: string;
  address: string;
  mapUrl: string;
}

export interface Course {
  id: CourseCategory;
  name: string;
  shortDescription: string;
  ageRange: string;
  schedule: string;
  campuses: CampusLocation[];
}

export interface QuizOption {
  id: string;
  label: string;
  emoji: string;
  /** Small grey helper under the label, e.g. "Tiền tiểu học". */
  hint?: string;
  /** Why this answer leads to the recommendation — shown on the result card. */
  reason?: string;
  /** Points awarded to each course category when this option is picked. */
  weights: Partial<Record<CourseCategory, number>>;
}

export type QuizMode = 'single' | 'multi';

export interface QuizQuestion {
  id: string;
  question: string;
  mode: QuizMode;
  options: QuizOption[];
}

/** 1:1 tutoring vs. small group class. */
export type CourseFormat = 'ONE_ON_ONE' | 'SMALL_GROUP';

export interface QuizResult {
  primary: CourseCategory;
  /** Present when a second course scores close to the first → combo recommendation. */
  secondary?: CourseCategory;
  format: CourseFormat;
  /** "Khóa Luyện Chữ Đẹp & Tiền Tiểu Học 1:1" */
  title: string;
  reasons: string[];
  /** Display-only fit score, 75–98. */
  matchPercent: number;
  scores: Record<CourseCategory, number>;
  summary: QuizSummary;
}

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

// ─── Video publishing (staff) ───────────────────────────────────────────────

/** A file chosen from the phone library or the browser file picker. */
export interface PickedMedia {
  /** file:// / content:// on native, blob: URL on web — usable directly in <Image>/<VideoPlayer>. */
  uri: string;
  name: string;
  type: string;
  /** Bytes (0 if unknown). */
  size: number;
  durationSec?: number;
  /** Web only: the File object to upload. */
  file?: Blob;
}

/** A feed video as staff see it: includes drafts and how many bookings it produced. */
export interface AdminVideo extends FeedItem {
  shareSlug: string;
  isPublished: boolean;
  publishedAt: string;
  createdAt: string;
  leadCount: number;
  videoPath: string | null;
  thumbnailPath: string | null;
}

/** Editor form state for creating / editing a video. */
export interface VideoDraft {
  title: string;
  category: CourseCategory;
  teacherName: string;
  teacherAvatar: string;
  tags: string[];
  ctaText: string;
  /** New files to upload; omit to keep the existing ones when editing. */
  video?: PickedMedia;
  thumbnail?: PickedMedia;
}

// ─── Trust & social proof ────────────────────────────────────────────────────

/** One anonymised real booking, from `recent_activity()` — "Phụ huynh T. vừa đặt lịch…". */
export interface ActivityEvent {
  id: string;
  actorLabel: string;
  course: CourseCategory;
  courseName: string;
  branch: CampusLocation;
  branchName: string;
  createdAt: string;
}

/** A verified stat. `sourceNote` is mandatory server-side before it can be published. */
export interface TrustStat {
  id: string;
  icon: string;
  headline: string | null;
  label: string;
  sourceNote: string;
}

export type TestimonialKind = 'VIDEO' | 'LETTER' | 'NOTEBOOK';

export interface Testimonial {
  id: string;
  kind: TestimonialKind;
  parentLabel: string;
  course: CourseCategory;
  branch: CampusLocation | null;
  quote: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
}

/** Where trust content came from — the UI labels sample data so it is never mistaken for real. */
export type TrustDataOrigin = 'LIVE' | 'SAMPLE' | 'NONE';

export interface BookingRecord extends BookingPayload {
  id: string;
  /** Short human code for phone/Zalo, e.g. "TH-7K2Q9M". */
  code: string;
  createdAt: string;
  status: 'NEW';
  /** Denormalised labels — what CRM / Zalo notifications display. */
  display: {
    course: string;
    campus: string;
    campusAddress: string;
    date: string;
    slot: string;
    gift: string;
    mapsUrl: string;
  };
}
