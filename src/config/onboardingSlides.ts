/**
 * Role-specific first-login walkthrough (3 slides each). Copy is short on purpose: one idea per slide,
 * one concrete tip, and the button the user presses next.
 */
import { CalendarCheck, Camera, Gift, HeartHandshake, Map, MessageCircleHeart, PhoneCall, QrCode, Send, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react-native';

export type OnboardingRole = 'PARENT' | 'TEACHER' | 'ADVISOR';

export interface OnboardingSlide {
  key: string;
  emoji: string;
  icon: LucideIcon;
  /** Badge / circle colour (hex). */
  tint: string;
  title: string;
  subtitle: string;
  /** One concrete "where / how" tip. */
  tip: string;
  /** Bottom button on this slide. */
  primaryActionLabel: string;
}

export interface RoleOnboarding {
  role: OnboardingRole;
  /** Small label above the title, e.g. "Dành cho phụ huynh". */
  audience: string;
  slides: [OnboardingSlide, OnboardingSlide, OnboardingSlide];
}

const NEXT = 'Tiếp theo';
const START = 'Bắt đầu ngay';

export const ONBOARDING: Record<OnboardingRole, RoleOnboarding> = {
  PARENT: {
    role: 'PARENT',
    audience: 'Dành cho phụ huynh',
    slides: [
      {
        key: 'progress',
        emoji: '📒',
        icon: MessageCircleHeart,
        tint: '#1278BE',
        title: 'Theo dõi con tiến bộ mỗi ngày',
        subtitle: 'Xem nhận xét, ảnh bài vở và nghe ghi âm giọng nói từ thầy cô ngay sau buổi học.',
        tip: 'Mở "Sổ liên lạc của bé" → kéo xuống phần "Nhận xét sau mỗi buổi học".',
        primaryActionLabel: NEXT,
      },
      {
        key: 'one-tap',
        emoji: '⚡',
        icon: Wallet,
        tint: '#5A8526',
        title: 'Thao tác tiện ích chỉ 1 chạm',
        subtitle: 'Báo nghỉ phép, đăng ký lịch học bù và đóng học phí qua VietQR tự động trong 3 giây.',
        tip: 'Nút "Báo nghỉ học" và "Đóng học phí" luôn ở cuối màn hình sổ liên lạc.',
        primaryActionLabel: NEXT,
      },
      {
        key: 'rewards',
        emoji: '🎁',
        icon: Gift,
        tint: '#EA580C',
        title: 'Đồng hành & Nhận quà ưu đãi',
        subtitle: 'Chinh phục chuỗi thử thách 21 ngày cùng con và chia sẻ mã giới thiệu nhận voucher học phí.',
        tip: 'Mỗi bạn được giới thiệu nhập học, ba mẹ nhận voucher học phí.',
        primaryActionLabel: START,
      },
    ],
  },
  TEACHER: {
    role: 'TEACHER',
    audience: 'Dành cho giáo viên',
    slides: [
      {
        key: 'qr',
        emoji: '✅',
        icon: QrCode,
        tint: '#1278BE',
        title: 'Điểm danh siêu tốc bằng mã QR',
        subtitle: 'Quét thẻ học viên đầu giờ để tự động ghi nhận chuyên cần và báo an tâm cho phụ huynh.',
        tip: 'Lớp của tôi → "Quét QR điểm danh", hoặc "Tất cả có mặt" (có Hoàn tác 5 giây).',
        primaryActionLabel: NEXT,
      },
      {
        key: 'report',
        emoji: '📝',
        icon: Send,
        tint: '#5A8526',
        title: 'Gửi sổ liên lạc trong 10 giây',
        subtitle: 'Chụp ảnh bài vở, chọn nhận xét mẫu hoặc ghi âm 15 giây gửi hàng loạt cho cả lớp.',
        tip: 'Tab "Sổ liên lạc" tự chọn sẵn các bé có mặt hôm nay.',
        primaryActionLabel: NEXT,
      },
      {
        key: 'moments',
        emoji: '🎬',
        icon: Camera,
        tint: '#EA580C',
        title: 'Chia sẻ khoảnh khắc lớp học',
        subtitle: 'Đăng video ngắn và ảnh trước/sau tiến bộ của học sinh lên EduFeed.',
        tip: 'Tab "Khoảnh khắc" cho ảnh nhanh; "Đăng video mới" ở trang chủ nhân viên.',
        primaryActionLabel: START,
      },
    ],
  },
  ADVISOR: {
    role: 'ADVISOR',
    audience: 'Dành cho tư vấn viên',
    slides: [
      {
        key: 'leads',
        emoji: '🔥',
        icon: Map,
        tint: '#1278BE',
        title: 'Nhận Lead nóng theo thời gian thực',
        subtitle: 'Danh sách phụ huynh đăng ký học thử tự động phân bổ theo cơ sở Xa La và Ngô Thì Nhậm.',
        tip: 'Trang chủ nhân viên → "Lịch học thử" và "Công việc".',
        primaryActionLabel: NEXT,
      },
      {
        key: 'close',
        emoji: '📞',
        icon: PhoneCall,
        tint: '#5A8526',
        title: 'Chăm sóc & Chốt lịch 1 chạm',
        subtitle: 'Gọi điện, mở Zalo trực tiếp và cập nhật trạng thái để kích hoạt nhắc lịch tự động.',
        tip: 'Đổi trạng thái sang "Đã xác nhận" → hệ thống tự gửi nhắc lịch qua Zalo.',
        primaryActionLabel: NEXT,
      },
      {
        key: 'journey',
        emoji: '🤝',
        icon: HeartHandshake,
        tint: '#EA580C',
        title: 'Theo dõi trọn vẹn hành trình',
        subtitle: 'Đồng hành từ lúc học thử đến khi phụ huynh hoàn tất học phí chính thức.',
        tip: 'Mục "Học viên" cho biết ai sắp hết buổi và cần gọi tư vấn khóa tiếp theo.',
        primaryActionLabel: START,
      },
    ],
  },
};

/** Icons used in the role picker (settings preview). */
export const ROLE_ICON: Record<OnboardingRole, LucideIcon> = { PARENT: Users, TEACHER: CalendarCheck, ADVISOR: Sparkles };
export const ROLE_LABEL: Record<OnboardingRole, string> = { PARENT: 'Phụ huynh', TEACHER: 'Giáo viên', ADVISOR: 'Tư vấn viên' };
