import type { CourseCategory } from '@/types';

export interface ChecklistItem {
  id: string;
  label: string;
  /** Short, practical tip revealed on expand. */
  tip: string;
}

export interface ChecklistGroup {
  title: string;
  emoji: string;
  items: ChecklistItem[];
}

export interface Checklist {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  /** Course to suggest (softly) when the parent completes the checklist. */
  relatedCourse: CourseCategory;
  groups: ChecklistGroup[];
}

export const CHECKLISTS: Checklist[] = [
  {
    id: 'vao-lop-1',
    title: 'Checklist chuẩn bị tâm lý cho con vào lớp 1',
    subtitle: '16 việc nhỏ giúp con tự tin ngày đầu đến trường',
    emoji: '🎒',
    relatedCourse: 'TIEN_TIEU_HOC',
    groups: [
      {
        title: 'Tâm lý & cảm xúc',
        emoji: '💛',
        items: [
          { id: 'tl-1', label: 'Kể cho con nghe những điều thú vị ở trường tiểu học', tip: 'Tránh doạ "vào lớp 1 cô phạt đấy" — hãy nói về bạn mới, sách mới, giờ ra chơi.' },
          { id: 'tl-2', label: 'Cùng con đi xem trường trước ngày khai giảng', tip: 'Chỉ cho con cổng trường, lớp học, nhà vệ sinh, chỗ bố mẹ đón.' },
          { id: 'tl-3', label: 'Đọc cùng con một cuốn sách về ngày đầu đi học', tip: 'Hỏi con: "Nếu là bạn nhỏ trong truyện, con sẽ làm gì?"' },
          { id: 'tl-4', label: 'Tập cho con nói "Con cần giúp đỡ" với người lớn', tip: 'Đóng vai: mẹ là cô giáo, con giơ tay xin đi vệ sinh / hỏi bài.' },
        ],
      },
      {
        title: 'Kỹ năng tự phục vụ',
        emoji: '🧦',
        items: [
          { id: 'kn-1', label: 'Con tự cất đồ dùng vào cặp sau khi học', tip: 'Dán hình ảnh từng món đồ lên tủ để con tự kiểm tra.' },
          { id: 'kn-2', label: 'Con tự đi vệ sinh và rửa tay sạch', tip: 'Tập ở nơi công cộng (trung tâm thương mại) để con quen.' },
          { id: 'kn-3', label: 'Con tự ăn trưa trong 30 phút', tip: 'Dùng hộp cơm giống ở trường để con quen cách mở nắp.' },
          { id: 'kn-4', label: 'Con tự mặc áo, đi giày, buộc/dán quai', tip: 'Chọn giày quai dán cho tuần đầu, buộc dây để sau.' },
        ],
      },
      {
        title: 'Nề nếp học tập',
        emoji: '✏️',
        items: [
          { id: 'hn-1', label: 'Có góc học tập riêng, đủ ánh sáng', tip: 'Đèn bên trái (với con thuận tay phải), bàn ghế vừa tầm.' },
          { id: 'hn-2', label: 'Con ngồi học tập trung được 20–30 phút', tip: 'Bắt đầu 10 phút/lần, tăng dần; khen cụ thể khi con hoàn thành.' },
          { id: 'hn-3', label: 'Con cầm bút đúng 3 ngón, ngồi thẳng lưng', tip: 'Sửa sớm dễ hơn sửa muộn — tư thế sai gây mỏi tay, cận thị.' },
          { id: 'hn-4', label: 'Con nhận biết được chữ cái và số đến 10', tip: 'Học qua trò chơi, không ép con viết quá nhiều trước lớp 1.' },
        ],
      },
      {
        title: 'Đồ dùng & sinh hoạt',
        emoji: '🗓️',
        items: [
          { id: 'dd-1', label: 'Chuẩn bị đủ sách vở, bút chì 2B, tẩy, thước', tip: 'Để con tự chọn hộp bút / nhãn vở — con sẽ háo hức đi học hơn.' },
          { id: 'dd-2', label: 'Ghi tên con lên tất cả đồ dùng', tip: 'Dùng nhãn dán chống nước cho bình nước, hộp cơm.' },
          { id: 'dd-3', label: 'Điều chỉnh giờ ngủ sớm trước 2 tuần', tip: 'Ngủ trước 21h, dậy lúc 6h — lùi dần 15 phút mỗi ngày.' },
          { id: 'dd-4', label: 'Thống nhất người đưa đón & số điện thoại liên lạc', tip: 'Dạy con thuộc số điện thoại của bố hoặc mẹ.' },
        ],
      },
    ],
  },
];

export const getChecklist = (id: string) => CHECKLISTS.find((c) => c.id === id);
export const checklistItemCount = (c: Checklist) => c.groups.reduce((n, g) => n + g.items.length, 0);
