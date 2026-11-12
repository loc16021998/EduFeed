import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { CourseCategory, LeadSource } from '@/types';

export type TabParamList = {
  Home: undefined;
  /** Optional itemId deep-links to a specific student (thedu://portfolio/p-001). */
  Portfolio: { itemId?: string } | undefined;
  Quiz: undefined;
  Booking: { course?: CourseCategory; fromQuiz?: boolean; source?: LeadSource; sourceRef?: string } | undefined;
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
  StaffRegister: { type?: 'staff' | 'admin' } | undefined;
  StaffVideos: undefined;
  /** Trial schedule: confirm / cancel / complete with teacher feedback / enrolled. */
  StaffTrials: undefined;
  AdminHome: undefined;
  AdminDashboard: undefined;
  StaffAccounts: undefined;
  StaffRequests: undefined;
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
