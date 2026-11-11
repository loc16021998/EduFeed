/**
 * Mock data for TH EDU Center.
 * Media URLs are public placeholders — swap for CDN assets when the backend is ready.
 * Campus addresses are approximate; confirm with the centre before release.
 */
import type {
  Campus,
  Course,
  FeedItem,
  PortfolioItem,
  QuizQuestion,
  Teacher,
  TimeSlot,
} from '@/types';
import { buildMapsDirectionsUrl } from '@/services/zalo';
import { TIME_SLOTS as SHARED_TIME_SLOTS } from '../../supabase/functions/_shared/contracts';

// ─── Placeholder media helpers ──────────────────────────────────────────────

const SAMPLE_VIDEO =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const SAMPLE_VIDEO_2 =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

const img = (seed: string, w = 800, h = 600) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

// ─── Teachers ───────────────────────────────────────────────────────────────

export const TEACHERS: Teacher[] = [
  {
    id: 't-huong',
    name: 'Cô Hường',
    avatarUrl: 'https://i.pravatar.cc/200?img=47',
    specialties: ['TIEN_TIEU_HOC', 'LUYEN_CHU_DEP', 'BOI_DUONG_TOAN_TV'],
    bio: 'Hơn 10 năm dạy tiền tiểu học và luyện chữ đẹp theo chuẩn Bộ GD&ĐT.',
  },
  {
    id: 't-tu',
    name: 'Thầy Tú',
    avatarUrl: 'https://i.pravatar.cc/200?img=12',
    specialties: ['TOAN_TU_DUY', 'BOI_DUONG_TOAN_TV'],
    bio: 'Chuyên Toán tư duy & bồi dưỡng học sinh giỏi Toán tiểu học.',
  },
];

const [CO_HUONG, THAY_TU] = TEACHERS;

// ─── Campuses ───────────────────────────────────────────────────────────────

export const CAMPUSES: Campus[] = [
  {
    id: 'XA_LA',
    code: 'CS1',
    name: 'Cơ sở Xa La',
    shortAddress: '26 LK2 KĐT Xa La, Hà Đông',
    address: '26 LK2 KĐT Xa La, Hà Đông, Hà Nội',
    mapUrl: buildMapsDirectionsUrl('26 LK2 KĐT Xa La, Hà Đông, Hà Nội'),
  },
  {
    id: 'NGO_THI_NHAM',
    code: 'CS2',
    name: 'Cơ sở Ngô Thì Nhậm',
    shortAddress: 'Ngô Thì Nhậm, Hà Đông',
    // TODO: add the house number once confirmed by the centre.
    address: 'Ngô Thì Nhậm, Hà Đông, Hà Nội',
    mapUrl: buildMapsDirectionsUrl('Ngô Thì Nhậm, Hà Đông, Hà Nội'),
  },
];

// ─── Trial time slots ───────────────────────────────────────────────────────

export const TIME_SLOTS: TimeSlot[] = SHARED_TIME_SLOTS;

// ─── Courses ────────────────────────────────────────────────────────────────

export const COURSES: Course[] = [
  {
    id: 'TIEN_TIEU_HOC',
    name: 'Tiền tiểu học – Sẵn sàng vào lớp 1',
    shortDescription: 'Làm quen chữ cái, số đếm, tư thế cầm bút và nề nếp lớp học.',
    ageRange: '5 – 6 tuổi',
    schedule: 'T2 – T4 – T6 · 17:30 – 19:00',
    campuses: ['XA_LA', 'NGO_THI_NHAM'],
  },
  {
    id: 'LUYEN_CHU_DEP',
    name: 'Luyện chữ đẹp',
    shortDescription: 'Viết đúng mẫu chữ, đều nét, sạch vở theo chuẩn tiểu học.',
    ageRange: 'Lớp 1 – Lớp 5',
    schedule: 'T3 – T5 · 17:30 – 19:00 · CN 8:00 – 9:30',
    campuses: ['XA_LA', 'NGO_THI_NHAM'],
  },
  {
    id: 'TOAN_TU_DUY',
    name: 'Toán tư duy',
    shortDescription: 'Phát triển tư duy logic, tính nhẩm nhanh, giải toán có lời văn.',
    ageRange: 'Lớp 1 – Lớp 5',
    schedule: 'T2 – T4 · 19:00 – 20:30 · T7 8:00 – 9:30',
    campuses: ['XA_LA'],
  },
  {
    id: 'BOI_DUONG_TOAN_TV',
    name: 'Bồi dưỡng Toán – Tiếng Việt',
    shortDescription: 'Củng cố kiến thức trên lớp, ôn thi học kỳ, nâng cao vốn từ.',
    ageRange: 'Lớp 2 – Lớp 5',
    schedule: 'T3 – T5 – T7 · 19:00 – 20:30',
    campuses: ['XA_LA', 'NGO_THI_NHAM'],
  },
];

// ─── EduFeed ────────────────────────────────────────────────────────────────

const cta = (course: string) => `thedu://booking?course=${course}`;

export const FEED_ITEMS: FeedItem[] = [
  {
    id: 'f-001',
    title: 'Bé tự tin cầm bút đúng cách chỉ sau 2 tuần cùng Cô Hường ✏️',
    videoUrl: SAMPLE_VIDEO,
    thumbnailUrl: img('thedu-tth-1', 720, 900),
    category: 'TIEN_TIEU_HOC',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    tags: ['#TienTieuHoc', '#VaoLop1', '#CamButDung'],
    ctaText: '🎁 ĐĂNG KÝ HỌC THỬ TIỀN TIỂU HỌC MIỄN PHÍ',
    ctaLink: cta('TIEN_TIEU_HOC'),
  },
  {
    id: 'f-002',
    title: 'Học 29 chữ cái qua trò chơi "Đi chợ chữ" – bé nào cũng mê!',
    videoUrl: SAMPLE_VIDEO_2,
    thumbnailUrl: img('thedu-tth-2', 720, 900),
    category: 'TIEN_TIEU_HOC',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    tags: ['#ChuCai', '#HocMaChoi', '#Be5Tuoi'],
    ctaText: '🎁 GIỮ CHỖ LỚP TIỀN TIỂU HỌC MIỄN PHÍ',
    ctaLink: cta('TIEN_TIEU_HOC'),
  },
  {
    id: 'f-003',
    title: 'Bí quyết viết nét khuyết đều và đẹp – ba mẹ áp dụng được ngay tại nhà',
    videoUrl: SAMPLE_VIDEO,
    thumbnailUrl: img('thedu-lcd-1', 720, 900),
    category: 'LUYEN_CHU_DEP',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    tags: ['#LuyenChuDep', '#NetKhuyet', '#HocSinhLop1'],
    ctaText: '🎁 ĐĂNG KÝ HỌC THỬ LUYỆN CHỮ ĐẸP MIỄN PHÍ',
    ctaLink: cta('LUYEN_CHU_DEP'),
  },
  {
    id: 'f-004',
    title: 'Tư thế ngồi viết chuẩn – chống cận, chống gù cho con',
    videoUrl: SAMPLE_VIDEO_2,
    thumbnailUrl: img('thedu-lcd-2', 720, 900),
    category: 'LUYEN_CHU_DEP',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    tags: ['#TuTheNgoiViet', '#SucKhoeHocDuong'],
    ctaText: '🎁 HỌC THỬ LUYỆN CHỮ 1 BUỔI MIỄN PHÍ',
    ctaLink: cta('LUYEN_CHU_DEP'),
  },
  {
    id: 'f-005',
    title: 'Tính nhẩm siêu tốc: cộng trừ trong phạm vi 100 chỉ trong 3 giây 🚀',
    videoUrl: SAMPLE_VIDEO,
    thumbnailUrl: img('thedu-ttd-1', 720, 900),
    category: 'TOAN_TU_DUY',
    teacherName: THAY_TU.name,
    teacherAvatar: THAY_TU.avatarUrl,
    tags: ['#ToanTuDuy', '#TinhNham', '#HocSinhLop1'],
    ctaText: '🎁 ĐĂNG KÝ HỌC THỬ TOÁN TƯ DUY MIỄN PHÍ',
    ctaLink: cta('TOAN_TU_DUY'),
  },
  {
    id: 'f-006',
    title: 'Giải bài toán "tìm quy luật dãy số" trong 30 giây',
    videoUrl: SAMPLE_VIDEO_2,
    thumbnailUrl: img('thedu-ttd-2', 720, 900),
    category: 'TOAN_TU_DUY',
    teacherName: THAY_TU.name,
    teacherAvatar: THAY_TU.avatarUrl,
    tags: ['#ToanTuDuy', '#QuyLuatDaySo', '#HocSinhLop2'],
    ctaText: '🎁 ĐĂNG KÝ HỌC THỬ TOÁN TƯ DUY MIỄN PHÍ',
    ctaLink: cta('TOAN_TU_DUY'),
  },
  {
    id: 'f-007',
    title: 'Ôn thi cuối học kỳ I – Toán lớp 3: 5 dạng bài hay gặp nhất',
    videoUrl: SAMPLE_VIDEO,
    thumbnailUrl: img('thedu-bd-1', 720, 900),
    category: 'BOI_DUONG_TOAN_TV',
    teacherName: THAY_TU.name,
    teacherAvatar: THAY_TU.avatarUrl,
    tags: ['#OnThiHocKy1', '#ToanLop3', '#BoiDuong'],
    ctaText: '🎁 GIỮ CHỖ LỚP ÔN THI HỌC KỲ MIỄN PHÍ',
    ctaLink: cta('BOI_DUONG_TOAN_TV'),
  },
  {
    id: 'f-008',
    title: 'Mở rộng vốn từ Tiếng Việt lớp 4 – chủ đề Thiên nhiên 🌿',
    videoUrl: SAMPLE_VIDEO_2,
    thumbnailUrl: img('thedu-bd-2', 720, 900),
    category: 'BOI_DUONG_TOAN_TV',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    tags: ['#TiengViet', '#VonTu', '#HocSinhLop4'],
    ctaText: '🎁 ĐĂNG KÝ HỌC THỬ BỒI DƯỠNG TOÁN & TV',
    ctaLink: cta('BOI_DUONG_TOAN_TV'),
  },
];

// ─── Portfolio (Before & After) ─────────────────────────────────────────────

/** Placeholder "before" = grey + blurred so the slider contrast reads in demos. */
const beforeImg = (seed: string) => `${img(seed, 600, 800)}?grayscale&blur=2`;
const afterImg = (seed: string) => img(seed, 600, 800);

export const PORTFOLIO_ITEMS: PortfolioItem[] = [
  // Luyện chữ đẹp
  {
    id: 'p-001',
    studentName: 'Trần Gia Bảo',
    displayName: 'Bé Gia Bảo',
    className: 'Lớp 1',
    course: 'LUYEN_CHU_DEP',
    campusLocation: 'XA_LA',
    beforeImageUrl: beforeImg('thedu-lcd-giabao'),
    afterImageUrl: afterImg('thedu-lcd-giabao'),
    beforeLabel: 'Nét chữ cũ',
    afterLabel: 'Nét chữ chuẩn nét thanh nét đậm',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    teacherNote:
      'Ngày đầu Gia Bảo cầm bút còn gồng tay, chữ to nhỏ không đều. Sau 2 tháng con đã viết đúng độ cao, nét khuyết thẳng và biết nhấn nét thanh – nét đậm. Con rất kiên nhẫn, ba mẹ yên tâm nhé!',
    assessments: [
      { skill: 'Độ đều nét', before: 2, after: 4 },
      { skill: 'Nét thanh – nét đậm', before: 1, after: 4 },
      { skill: 'Tư thế ngồi & cầm bút', before: 2, after: 5 },
      { skill: 'Trình bày vở sạch', before: 2, after: 4 },
    ],
    duration: '2 tháng',
  },
  {
    id: 'p-002',
    studentName: 'Vũ Ngọc Hân',
    displayName: 'Bé Ngọc Hân',
    className: 'Lớp 2',
    course: 'LUYEN_CHU_DEP',
    campusLocation: 'NGO_THI_NHAM',
    beforeImageUrl: beforeImg('thedu-lcd-ngochan'),
    afterImageUrl: afterImg('thedu-lcd-ngochan'),
    beforeLabel: 'Chữ viết vội, sai độ cao',
    afterLabel: 'Chữ nghiêng đều, vở sạch',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    teacherNote:
      'Ngọc Hân viết nhanh nhưng trước đây hay ẩu. Giờ con đã viết chữ nghiêng đều, khoảng cách hợp lý và vừa đạt giải Khuyến khích "Vở sạch – Chữ đẹp" cấp trường.',
    assessments: [
      { skill: 'Độ đều nét', before: 3, after: 5 },
      { skill: 'Chữ nghiêng', before: 2, after: 4 },
      { skill: 'Tốc độ viết', before: 4, after: 4 },
      { skill: 'Trình bày vở sạch', before: 2, after: 5 },
    ],
    duration: '3 tháng',
  },
  // Toán tư duy
  {
    id: 'p-003',
    studentName: 'Lê Khánh Linh',
    displayName: 'Bé Khánh Linh',
    className: 'Lớp 2',
    course: 'TOAN_TU_DUY',
    campusLocation: 'XA_LA',
    beforeImageUrl: beforeImg('thedu-ttd-khanhlinh'),
    afterImageUrl: afterImg('thedu-ttd-khanhlinh'),
    beforeLabel: 'Trắc nghiệm đầu vào: 5/10',
    afterLabel: 'Bài kiểm tra hiện tại: 10/10',
    teacherName: THAY_TU.name,
    teacherAvatar: THAY_TU.avatarUrl,
    teacherNote:
      'Khánh Linh từng mất 12 phút cho 20 phép tính, giờ chỉ còn 4 phút và không sai câu nào. Điều thầy vui nhất là con đã tự tin giơ tay giải bài trước lớp.',
    assessments: [
      { skill: 'Tốc độ tính nhẩm', before: 2, after: 5 },
      { skill: 'Đọc hiểu đề toán', before: 2, after: 4 },
      { skill: 'Tư duy logic', before: 3, after: 4 },
      { skill: 'Sự tự tin', before: 2, after: 5 },
    ],
    duration: '3 tháng',
  },
  {
    id: 'p-004',
    studentName: 'Đỗ Bảo Nam',
    displayName: 'Bé Bảo Nam',
    className: 'Lớp 1',
    course: 'TOAN_TU_DUY',
    campusLocation: 'XA_LA',
    beforeImageUrl: beforeImg('thedu-ttd-baonam'),
    afterImageUrl: afterImg('thedu-ttd-baonam'),
    beforeLabel: 'Trắc nghiệm đầu vào: 4/10',
    afterLabel: 'Giải toán có lời văn 2 bước',
    teacherName: THAY_TU.name,
    teacherAvatar: THAY_TU.avatarUrl,
    teacherNote:
      'Bảo Nam ban đầu chưa hiểu đề có lời văn. Sau 2 tháng con đã biết tóm tắt đề, tự vẽ sơ đồ và giải bài 2 bước mà không cần gợi ý.',
    assessments: [
      { skill: 'Tốc độ tính nhẩm', before: 2, after: 4 },
      { skill: 'Đọc hiểu đề toán', before: 1, after: 4 },
      { skill: 'Tư duy logic', before: 2, after: 4 },
      { skill: 'Sự tập trung', before: 2, after: 4 },
    ],
    duration: '2 tháng',
  },
  // Tiền tiểu học
  {
    id: 'p-005',
    studentName: 'Nguyễn Minh Anh',
    displayName: 'Bé Minh Anh',
    className: 'Mầm non 5 tuổi',
    course: 'TIEN_TIEU_HOC',
    campusLocation: 'NGO_THI_NHAM',
    beforeImageUrl: beforeImg('thedu-tth-minhanh'),
    afterImageUrl: afterImg('thedu-tth-minhanh'),
    beforeLabel: 'Chưa cầm bút đúng',
    afterLabel: 'Tự viết tên & 29 chữ cái',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    teacherNote:
      'Minh Anh vào lớp còn rụt rè, chưa cầm bút đúng. Giờ con đã tự viết tên mình, đọc trơn 29 chữ cái và rất hào hứng mỗi buổi đến lớp.',
    assessments: [
      { skill: 'Cầm bút đúng cách', before: 1, after: 5 },
      { skill: 'Nhận biết chữ cái', before: 2, after: 5 },
      { skill: 'Đếm & nhận biết số', before: 3, after: 5 },
      { skill: 'Nề nếp lớp học', before: 2, after: 4 },
    ],
    duration: '2 tháng',
  },
  {
    id: 'p-006',
    studentName: 'Phạm Đức Huy',
    displayName: 'Bé Đức Huy',
    className: 'Mầm non 5 tuổi',
    course: 'TIEN_TIEU_HOC',
    campusLocation: 'XA_LA',
    beforeImageUrl: beforeImg('thedu-tth-duchuy'),
    afterImageUrl: afterImg('thedu-tth-duchuy'),
    beforeLabel: 'Nét chữ run, chưa đúng ô li',
    afterLabel: 'Viết đúng ô li, nét liền mạch',
    teacherName: CO_HUONG.name,
    teacherAvatar: CO_HUONG.avatarUrl,
    teacherNote:
      'Đức Huy hiếu động, lúc đầu ngồi được 5 phút là muốn đứng dậy. Sau 3 tháng con đã ngồi học trọn buổi, viết đúng ô li và sẵn sàng vào lớp 1.',
    assessments: [
      { skill: 'Cầm bút đúng cách', before: 2, after: 4 },
      { skill: 'Viết đúng ô li', before: 1, after: 4 },
      { skill: 'Sự tập trung', before: 1, after: 4 },
      { skill: 'Nề nếp lớp học', before: 2, after: 5 },
    ],
    duration: '3 tháng',
  },
];

// ─── Quick Diagnostic Quiz (3 steps · ~30s) ────────────────────────────────

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'age',
    question: 'Bé nhà mình năm nay mấy tuổi / chuẩn bị vào lớp mấy?',
    mode: 'single',
    options: [
      { id: 'age_4_5', emoji: '🧸', label: '4 – 5 tuổi', hint: 'Tiền tiểu học', weights: { TIEN_TIEU_HOC: 5, LUYEN_CHU_DEP: 1 } },
      { id: 'grade_1', emoji: '🎒', label: 'Vào Lớp 1', hint: 'Năm học đầu tiên', weights: { TIEN_TIEU_HOC: 3, LUYEN_CHU_DEP: 3, TOAN_TU_DUY: 1 } },
      { id: 'grade_2_3', emoji: '✏️', label: 'Lớp 2 – 3', weights: { LUYEN_CHU_DEP: 2, TOAN_TU_DUY: 3, BOI_DUONG_TOAN_TV: 2 } },
      { id: 'grade_4_5', emoji: '📚', label: 'Lớp 4 – 5', weights: { BOI_DUONG_TOAN_TV: 4, TOAN_TU_DUY: 2 } },
    ],
  },
  {
    id: 'pain',
    question: 'Bé đang gặp khó khăn gì nhất?',
    mode: 'multi',
    options: [
      {
        id: 'messy_writing',
        emoji: '✍️',
        label: 'Chữ viết ngệch ngoạc / sai nét',
        reason: 'Chỉnh nét chữ, độ cao & khoảng cách theo mẫu chuẩn Bộ GD&ĐT',
        weights: { LUYEN_CHU_DEP: 4 },
      },
      {
        id: 'pen_grip',
        emoji: '🤚',
        label: 'Cầm bút sai tư thế / mau mỏi tay',
        reason: 'Luyện tư thế ngồi & cách cầm bút đúng, viết lâu không mỏi tay',
        weights: { LUYEN_CHU_DEP: 3, TIEN_TIEU_HOC: 2 },
      },
      {
        id: 'math_slow',
        emoji: '🧮',
        label: 'Ngại học Toán / phản xạ chậm',
        reason: 'Tăng phản xạ tính nhẩm qua trò chơi tư duy, hết sợ Toán',
        weights: { TOAN_TU_DUY: 4, BOI_DUONG_TOAN_TV: 1 },
      },
      {
        id: 'not_ready_g1',
        emoji: '🌱',
        label: 'Chưa tự tin trước khi vào Lớp 1',
        reason: 'Làm quen nề nếp lớp học, chữ cái & số đếm trước khi vào Lớp 1',
        weights: { TIEN_TIEU_HOC: 4 },
      },
    ],
  },
  {
    id: 'goal',
    question: 'Mong muốn lớn nhất của Phụ huynh?',
    mode: 'single',
    options: [
      {
        id: 'goal_confident_g1',
        emoji: '🎓',
        label: 'Con tự tin vào Lớp 1',
        reason: 'Lộ trình "Sẵn sàng vào Lớp 1" giúp con tự tin ngay từ buổi đầu',
        weights: { TIEN_TIEU_HOC: 4 },
      },
      {
        id: 'goal_handwriting',
        emoji: '🖋️',
        label: 'Nét chữ đẹp & cẩn thận',
        reason: 'Rèn tính cẩn thận, vở sạch – chữ đẹp sau 8–12 tuần',
        weights: { LUYEN_CHU_DEP: 4 },
      },
      {
        id: 'goal_scores',
        emoji: '🏆',
        label: 'Bứt phá điểm số trên lớp',
        reason: 'Bám sát chương trình trên lớp, ôn đúng dạng bài hay gặp',
        weights: { BOI_DUONG_TOAN_TV: 4, TOAN_TU_DUY: 1 },
      },
      {
        id: 'goal_logic',
        emoji: '🧠',
        label: 'Kích thích tư duy logic',
        reason: 'Phát triển tư duy logic, giải toán có lời văn chủ động',
        weights: { TOAN_TU_DUY: 4 },
      },
    ],
  },
];
