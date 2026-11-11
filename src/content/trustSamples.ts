/**
 * ⚠️ SAMPLE trust content — DEVELOPMENT ONLY.
 *
 * Used by src/services/trust.ts when no backend is configured AND `__DEV__` is true, so the
 * screens can be designed. Production builds never show this: invented stats, sign-ups or
 * testimonials would mislead parents (and breach advertising / consumer-protection rules).
 * The UI labels anything from here with a "Dữ liệu mẫu" badge.
 */
import type { ActivityEvent, Testimonial, TrustStat } from '@/types';

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const SAMPLE_STATS: TrustStat[] = [
  { id: 's1', icon: '⭐', headline: '98%', label: 'học sinh cải thiện nét chữ sau 1 tháng', sourceNote: 'SỐ LIỆU MẪU — thay bằng số đo thực tế' },
  { id: 's2', icon: '🎓', headline: null, label: 'Đội ngũ giáo viên chuyên sâu sư phạm tiểu học', sourceNote: 'MẪU — cần xác minh hồ sơ giáo viên' },
  { id: 's3', icon: '👨‍👩‍👧', headline: '1.200+', label: 'phụ huynh đã đồng hành', sourceNote: 'SỐ LIỆU MẪU' },
];

export const SAMPLE_ACTIVITY: ActivityEvent[] = [
  { id: 'a1', actorLabel: 'Phụ huynh A.', course: 'TOAN_TU_DUY', courseName: 'Toán tư duy', branch: 'XA_LA', branchName: 'Cơ sở Xa La', createdAt: minsAgo(3) },
  { id: 'a2', actorLabel: 'Phụ huynh Đ.', course: 'LUYEN_CHU_DEP', courseName: 'Luyện chữ đẹp', branch: 'NGO_THI_NHAM', branchName: 'Cơ sở Ngô Thì Nhậm', createdAt: minsAgo(17) },
  { id: 'a3', actorLabel: 'Phụ huynh N.', course: 'TIEN_TIEU_HOC', courseName: 'Tiền tiểu học', branch: 'XA_LA', branchName: 'Cơ sở Xa La', createdAt: minsAgo(42) },
  { id: 'a4', actorLabel: 'Phụ huynh H.', course: 'BOI_DUONG_TOAN_TV', courseName: 'Bồi dưỡng Toán & TV', branch: 'NGO_THI_NHAM', branchName: 'Cơ sở Ngô Thì Nhậm', createdAt: minsAgo(95) },
];

const pic = (seed: string, w = 600, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const SAMPLE_VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

export const SAMPLE_TESTIMONIALS: Testimonial[] = [
  {
    id: 't1', kind: 'VIDEO', parentLabel: 'Mẹ bé A (mẫu)', course: 'LUYEN_CHU_DEP', branch: 'XA_LA',
    quote: 'Video mẫu — thay bằng video phụ huynh thật đã ký đồng ý.', mediaUrl: SAMPLE_VIDEO, thumbnailUrl: pic('thedu-tv1', 720, 1280), durationSec: 45,
  },
  {
    id: 't2', kind: 'VIDEO', parentLabel: 'Bố bé B (mẫu)', course: 'TOAN_TU_DUY', branch: 'XA_LA',
    quote: 'Video mẫu — thay bằng video phụ huynh thật đã ký đồng ý.', mediaUrl: SAMPLE_VIDEO, thumbnailUrl: pic('thedu-tv2', 720, 1280), durationSec: 62,
  },
  {
    id: 't3', kind: 'LETTER', parentLabel: 'Mẹ bé C (mẫu)', course: 'TIEN_TIEU_HOC', branch: 'NGO_THI_NHAM',
    quote: 'Ảnh mẫu — thay bằng ảnh chụp thư cảm ơn thật.', mediaUrl: pic('thedu-letter1'), thumbnailUrl: null, durationSec: null,
  },
  {
    id: 't4', kind: 'NOTEBOOK', parentLabel: 'Vở của bé D (mẫu)', course: 'LUYEN_CHU_DEP', branch: 'XA_LA',
    quote: 'Ảnh mẫu — thay bằng ảnh vở có dấu chấm của giáo viên.', mediaUrl: pic('thedu-notebook1'), thumbnailUrl: null, durationSec: null,
  },
];
