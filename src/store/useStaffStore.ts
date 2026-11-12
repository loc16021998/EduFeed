import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { demoRequestStatus } from '@/services/staffRequests';

/**
 * Staff (centre employees) authentication — email + password via Supabase Auth.
 * Parents never sign in. "Staff" = a user whose app_metadata.role is 'staff' or 'admin'
 * ('admin' = owner / manager: can also create and manage staff accounts)
 * (set by an admin, see supabase/README.md); RLS enforces the same rule server-side.
 *
 * Without Supabase, DEV builds offer a demo sign-in so the publishing flow can be tried locally.
 */
interface StaffState {
  status: 'unknown' | 'signedOut' | 'signedIn';
  email: string | null;
  isStaff: boolean;
  /** Can manage staff accounts. */
  isAdmin: boolean;
  demo: boolean;
  init: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const roleOf = (s: Session | null) => (s?.user.app_metadata as { role?: string } | undefined)?.role;

const fromSession = (s: Session | null) => ({
  status: s ? ('signedIn' as const) : ('signedOut' as const),
  email: s?.user.email ?? null,
  isStaff: roleOf(s) === 'staff' || roleOf(s) === 'admin',
  isAdmin: roleOf(s) === 'admin',
  demo: false,
});

const AUTH_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email hoặc mật khẩu không đúng.'],
  [/email not confirmed/i, 'Email chưa được xác nhận. Liên hệ quản trị.'],
  [/rate limit|too many/i, 'Thử lại quá nhiều lần. Vui lòng đợi vài phút.'],
  [/fetch|network/i, 'Mất kết nối mạng. Kiểm tra Internet rồi thử lại.'],
];

let initialised = false;

export const useStaffStore = create<StaffState>()((set) => ({
  status: 'unknown',
  email: null,
  isStaff: false,
  isAdmin: false,
  demo: false,

  init: () => {
    if (initialised) return;
    initialised = true;
    if (!supabase) {
      set({ status: 'signedOut' });
      return;
    }
    supabase.auth.getSession().then(({ data }) => set(fromSession(data.session)));
    supabase.auth.onAuthStateChange((_event, session) => set(fromSession(session)));
  },

  signIn: async (email, password) => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return 'Email không hợp lệ.';
    if (password.length < 6) return 'Mật khẩu tối thiểu 6 ký tự.';

    if (!supabase) {
      if (!__DEV__) return 'Ứng dụng chưa kết nối máy chủ.';
      const req = demoRequestStatus(e);
      if (req === 'PENDING') return 'Tài khoản đang chờ quản trị viên duyệt. Bạn sẽ đăng nhập được sau khi được duyệt.';
      if (req === 'REJECTED') return 'Yêu cầu đăng ký tài khoản này đã bị từ chối. Liên hệ quản trị viên.';
      // Demo only: e-mails starting with "admin" (or the sample owner) try the admin area, others the teacher area.
      const admin = /^(admin|chu\.trung\.tam)/.test(e);
      set({ status: 'signedIn', email: e, isStaff: true, isAdmin: admin, demo: true });
      return null;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
    if (error) return AUTH_ERRORS.find(([re]) => re.test(error.message))?.[1] ?? 'Đăng nhập thất bại, vui lòng thử lại.';
    set(fromSession(data.session));
    return null;
  },

  signOut: async () => {
    if (supabase) await supabase.auth.signOut().catch(() => {});
    set({ status: 'signedOut', email: null, isStaff: false, isAdmin: false, demo: false });
  },
}));
