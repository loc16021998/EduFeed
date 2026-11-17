import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { CourseCategory, LeadSource } from '@/types';

export type TabParamList = {
  Home: undefined;
  /** Optional itemId deep-links to a specific student (thedu://portfolio/p-001). */
  Portfolio: { itemId?: string } | undefined;
  Quiz: undefined;
  /** ref = a friend's referral code from a shared link (/booking?ref=TH…). */
  Booking: { course?: CourseCategory; fromQuiz?: boolean; source?: LeadSource; sourceRef?: string; ref?: string } | undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
  BookingSuccess: { bookingId: string };
  QuizModal: undefined;
  /** Parent Trust Hub; optional course pre-selects the curriculum accordion. */
  Testimonials: { course?: CourseCategory } | undefined;
  Checklist: { id: string };
  /** Public share link target: one video + booking CTA. */
  VideoShare: { slug: string };
  // ── Staff (centre employees) ──
  /** next = 'createAdmin': after an admin signs in, continue to creating an admin account. */
  StaffLogin: { next?: 'createAdmin' } | undefined;
  /** Admin sign-in (same screen, admin wording; non-admin accounts are told so). */
  AdminLogin: { next?: 'createAdmin' } | undefined;
  StaffRegister: { type?: 'staff' | 'admin' } | undefined;
  StaffVideos: undefined;
  /** Trial schedule: confirm / cancel / complete with teacher feedback / enrolled. */
  StaffTrials: undefined;
  AdminHome: undefined;
  AdminDashboard: undefined;
  StaffAccounts: undefined;
  StaffRequests: undefined;
  /** Parents: trial bookings made on this device. */
  ManageBookings: undefined;
  /** Teachers: publish a before / after progress post. */
  TeacherUpload: undefined;
  /** Staff: students per course, completion, follow-ups, advisor call list. */
  StaffEnrollments: undefined;
  /** Public digital certificate. */
  Certificate: { code: string };
  /** Tuition invoice: pay by VietQR / VNPay, then the digital receipt (link sent to the parent). */
  Payment: { id: string };
  /** Parents: phone + Zalo OTP sign-in (new numbers add a quick family profile). */
  ParentAuth: undefined;
  /** Parents: electronic contact book (children, sessions, reports, leave requests, fees, referral). */
  ParentPortal: undefined;
  /** Parents: referral code, rewards, vouchers, invited friends. */
  Referral: undefined;
  /** Teachers: my classes, QR / manual attendance, batch contact book. */
  TeacherDashboard: undefined;
  /** Advisors / teachers: assigned tasks (call, Zalo, done). */
  AdvisorTasks: undefined;
  /** Admin: classes, teachers, schedules, students. */
  Classes: undefined;
  /** Admin: parent accounts, students, sessions, leave / make-up requests. */
  AccountManagement: undefined;
  /** No id → create a new video. */
  VideoEditor: { id?: string } | undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

// Gives useNavigation() correct typing app-wide.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface RootParamList extends RootStackParamList {}
  }
}
