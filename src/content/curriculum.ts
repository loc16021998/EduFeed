/**
 * Week-by-week roadmap shown in the Parent Trust Hub.
 *
 * DRAFT written from the course descriptions — must be reviewed by Cô Hường / Thầy Tú
 * so it matches what is actually taught before release. Parents will hold the centre to it.
 */
import type { CourseCategory } from '@/types';

export interface CurriculumPhase {
  weeks: string;
  title: string;
  childLearns: string[];
  parentSees: string;
  milestone: string;
}

export const CURRICULUM: Record<CourseCategory, CurriculumPhase[]> = {
  TIEN_TIEU_HOC: [
    {
      weeks: 'Tuần 1–2',
      title: 'Làm quen lớp học & cầm bút đúng',
      childLearns: ['Nề nếp: chào hỏi, ngồi học 30 phút, giơ tay phát biểu', 'Tư thế ngồi, cách cầm bút 3 ngón', 'Tô nét cơ bản: nét thẳng, nét ngang, nét xiên'],
      parentSees: 'Con kể chuyện ở lớp, chủ động ngồi vào bàn học.',
      milestone: '🏅 Huy hiệu "Cầm bút chuẩn"',
    },
    {
      weeks: 'Tuần 3–4',
      title: 'Nhận biết chữ cái & số đếm',
      childLearns: ['Nhóm chữ o, ô, ơ, a, ă, â qua trò chơi', 'Đếm và nhận biết số 0–10', 'Nét cong, nét móc'],
      parentSees: 'Con chỉ và đọc được chữ cái trên biển hiệu, bao bì.',
      milestone: '🏅 Đọc được 12 chữ cái đầu tiên',
    },
    {
      weeks: 'Tuần 5–6',
      title: 'Ghép âm & viết tên mình',
      childLearns: ['Hoàn thành 29 chữ cái', 'Ghép âm đơn giản: ba, bà, bé', 'Tự viết họ tên trên ô li'],
      parentSees: 'Con tự viết tên lên tranh vẽ, sách vở.',
      milestone: '🏅 Tự viết tên mình',
    },
    {
      weeks: 'Tuần 7–8',
      title: 'Sẵn sàng vào lớp 1',
      childLearns: ['Phép cộng/trừ trong phạm vi 10 bằng que tính', 'Viết chữ thường cỡ vừa đúng ô li', 'Diễn tập một buổi học lớp 1'],
      parentSees: 'Báo cáo đánh giá năng lực & buổi gặp phụ huynh 1:1.',
      milestone: '🎓 Chứng nhận "Sẵn sàng vào lớp 1"',
    },
  ],
  LUYEN_CHU_DEP: [
    {
      weeks: 'Tuần 1–2',
      title: 'Đánh giá đầu vào & sửa tư thế',
      childLearns: ['Bài viết đầu vào (lưu làm ảnh "Trước")', 'Tư thế ngồi, khoảng cách mắt – vở, cách đặt vở', 'Luyện cơ tay với nét cơ bản'],
      parentSees: 'Nhận ảnh bài viết đầu vào + nhận xét chi tiết qua Zalo.',
      milestone: '🏅 Tư thế viết chuẩn',
    },
    {
      weeks: 'Tuần 3–4',
      title: 'Độ cao, độ rộng & nét khuyết',
      childLearns: ['Chữ cao 2, 2.5, 4, 5 ô li', 'Nét khuyết trên, khuyết dưới thẳng và đều', 'Khoảng cách giữa các chữ'],
      parentSees: 'Chữ bắt đầu đều hơn, ít tẩy xóa.',
      milestone: '🏅 Nét khuyết đều',
    },
    {
      weeks: 'Tuần 5–6',
      title: 'Nối chữ & nét thanh – nét đậm',
      childLearns: ['Kỹ thuật nối chữ liền mạch', 'Nhấn – nhả bút tạo nét thanh, nét đậm', 'Viết câu ngắn đúng tốc độ lớp học'],
      parentSees: 'Vở trên lớp sạch hơn, cô giáo trên lớp nhận xét tích cực.',
      milestone: '🏅 Viết liền mạch',
    },
    {
      weeks: 'Tuần 7–8',
      title: 'Trình bày bài & tốc độ',
      childLearns: ['Trình bày một trang vở hoàn chỉnh', 'Viết chính tả theo tốc độ đọc', 'Bài viết đầu ra (ảnh "Sau")'],
      parentSees: 'Nhận bộ ảnh Trước & Sau + lộ trình tiếp theo.',
      milestone: '🎓 Chứng nhận "Vở sạch – Chữ đẹp"',
    },
  ],
  TOAN_TU_DUY: [
    {
      weeks: 'Tuần 1–2',
      title: 'Đánh giá tư duy & làm quen giáo cụ',
      childLearns: ['Bài trắc nghiệm đầu vào', 'Nhận biết quy luật hình – số đơn giản', 'Trò chơi tính nhẩm theo nhóm'],
      parentSees: 'Báo cáo điểm mạnh / điểm cần cải thiện của con.',
      milestone: '🏅 Hoàn thành bài đánh giá',
    },
    {
      weeks: 'Tuần 3–4',
      title: 'Tính nhẩm nhanh',
      childLearns: ['Mẹo cộng trừ qua 10, tròn chục', 'Bảng cộng/trừ dưới dạng trò chơi', 'Thử thách tốc độ hằng tuần'],
      parentSees: 'Con tính nhẩm nhanh hơn khi làm bài tập về nhà.',
      milestone: '🏅 20 phép tính trong 5 phút',
    },
    {
      weeks: 'Tuần 5–6',
      title: 'Đọc hiểu đề & sơ đồ',
      childLearns: ['Gạch chân dữ kiện, tóm tắt đề', 'Vẽ sơ đồ đoạn thẳng', 'Giải toán có lời văn 1–2 bước'],
      parentSees: 'Con tự giải thích được cách làm bài.',
      milestone: '🏅 Giải toán có lời văn',
    },
    {
      weeks: 'Tuần 7–8',
      title: 'Tư duy logic nâng cao',
      childLearns: ['Bài toán quy luật dãy số', 'Toán suy luận, đố vui logic', 'Bài kiểm tra đầu ra'],
      parentSees: 'So sánh kết quả đầu vào – đầu ra + gợi ý lộ trình.',
      milestone: '🎓 Chứng nhận "Nhà tư duy nhí"',
    },
  ],
  BOI_DUONG_TOAN_TV: [
    {
      weeks: 'Tuần 1–2',
      title: 'Rà soát kiến thức trên lớp',
      childLearns: ['Bài kiểm tra theo chương trình SGK hiện hành', 'Xác định lỗ hổng Toán & Tiếng Việt', 'Lập kế hoạch học riêng cho con'],
      parentSees: 'Bản đồ kiến thức của con, chỉ rõ phần cần củng cố.',
      milestone: '🏅 Có lộ trình cá nhân',
    },
    {
      weeks: 'Tuần 3–4',
      title: 'Củng cố nền tảng',
      childLearns: ['Ôn lại các dạng bài con còn sai', 'Mở rộng vốn từ theo chủ điểm', 'Luyện đọc hiểu văn bản ngắn'],
      parentSees: 'Bài tập về nhà ít sai hơn.',
      milestone: '🏅 Lấp đầy lỗ hổng kiến thức',
    },
    {
      weeks: 'Tuần 5–6',
      title: 'Nâng cao & viết văn',
      childLearns: ['Dạng bài nâng cao bám sát đề kiểm tra', 'Lập dàn ý, viết đoạn văn', 'Kỹ năng trình bày bài thi'],
      parentSees: 'Con tự tin hơn với bài kiểm tra trên lớp.',
      milestone: '🏅 Viết đoạn văn hoàn chỉnh',
    },
    {
      weeks: 'Tuần 7–8',
      title: 'Luyện đề & đánh giá',
      childLearns: ['Luyện đề theo cấu trúc kiểm tra định kỳ', 'Quản lý thời gian làm bài', 'Bài đánh giá đầu ra'],
      parentSees: 'Báo cáo tiến bộ + kế hoạch cho kỳ thi tiếp theo.',
      milestone: '🎓 Chứng nhận hoàn thành khóa',
    },
  ],
};
