/**
 * "Mẹo mỗi ngày" — short, practical tips for parents, written by hand (not generated).
 * The centre's teachers should review / extend this list; each tip needs a stable id (likes are stored by id).
 *
 * Tagging: `course` (omit = any course) and `ages` [min, max] (omit = any age 3–12).
 * Keep tips concrete and doable in a few minutes; no medical claims, no statistics without a source.
 */
import type { CourseCategory } from '@/types';

export interface Spark {
  id: string;
  text: string;
  course?: CourseCategory;
  ages?: [number, number];
}

export const SPARKS: Spark[] = [
  // ── Luyện chữ đẹp ──
  { id: 'lcd-1', course: 'LUYEN_CHU_DEP', text: 'Trước khi viết, cho con xoay cổ tay và bóp quả bóng mềm 1 phút — tay thả lỏng thì nét chữ đều hơn.' },
  { id: 'lcd-2', course: 'LUYEN_CHU_DEP', text: 'Khen đúng một nét con viết đẹp nhất trong trang ("chữ b này cao đều quá!") hiệu quả hơn khen chung chung.' },
  { id: 'lcd-3', course: 'LUYEN_CHU_DEP', text: 'Kiểm tra tư thế: lưng thẳng, mắt cách vở khoảng một gang tay, bàn chân đặt chạm sàn.' },
  { id: 'lcd-4', course: 'LUYEN_CHU_DEP', ages: [4, 6], text: 'Cho con tô chữ bằng ngón tay lên khay cát hoặc bột — nhớ hình chữ bằng cả tay trước khi cầm bút.' },
  { id: 'lcd-5', course: 'LUYEN_CHU_DEP', text: 'Viết ít mà đều mỗi ngày (10–15 phút) tốt hơn viết dồn cả buổi vào cuối tuần.' },
  // ── Toán tư duy ──
  { id: 'ttd-1', course: 'TOAN_TU_DUY', text: '3 phút trước giờ ngủ: hỏi con "Trong phòng có mấy đồ vật hình tròn?" — tìm toán trong đời thường giúp con hứng thú.' },
  { id: 'ttd-2', course: 'TOAN_TU_DUY', text: 'Khi con giải sai, hỏi "Con nghĩ thế nào?" trước khi sửa. Nghe cách con suy luận quan trọng hơn đáp án.' },
  { id: 'ttd-3', course: 'TOAN_TU_DUY', ages: [5, 8], text: 'Đi chợ cùng con: nhờ con đếm số quả, so sánh túi nào nhiều hơn — phép cộng trừ có ngữ cảnh dễ nhớ hơn.' },
  { id: 'ttd-4', course: 'TOAN_TU_DUY', text: 'Chơi trò "Mẹ nghĩ một số" với gợi ý lớn hơn / nhỏ hơn — luyện suy luận và chia khoảng rất tự nhiên.' },
  { id: 'ttd-5', course: 'TOAN_TU_DUY', ages: [7, 12], text: 'Thử để con tự đặt một bài toán từ tình huống trong ngày rồi đố lại ba mẹ.' },
  // ── Tiền tiểu học ──
  { id: 'tth-1', course: 'TIEN_TIEU_HOC', text: 'Tập cho con tự soạn cặp sách tối hôm trước — kỹ năng tự lập là hành trang quan trọng khi vào lớp 1.' },
  { id: 'tth-2', course: 'TIEN_TIEU_HOC', text: 'Đọc truyện 10 phút mỗi tối và hỏi một câu "Theo con, sau đó chuyện gì xảy ra?" để luyện nghe hiểu.' },
  { id: 'tth-3', course: 'TIEN_TIEU_HOC', text: 'Tập ngồi vào bàn học đúng giờ, mỗi lần 15–20 phút, để con quen nhịp lớp học trước khi vào lớp 1.' },
  { id: 'tth-4', course: 'TIEN_TIEU_HOC', text: 'Cho con kể lại một việc trong ngày theo thứ tự "đầu tiên… sau đó… cuối cùng" — nền tảng để viết câu sau này.' },
  // ── Bồi dưỡng Toán & Tiếng Việt ──
  { id: 'bd-1', course: 'BOI_DUONG_TOAN_TV', text: 'Đọc đề toán có lời văn cùng con và gạch chân "cho biết gì, hỏi gì" trước khi làm.' },
  { id: 'bd-2', course: 'BOI_DUONG_TOAN_TV', text: 'Sau bài kiểm tra, cùng con xem lại 1 lỗi sai và tìm nguyên nhân — đừng chỉ nhìn điểm số.' },
  { id: 'bd-3', course: 'BOI_DUONG_TOAN_TV', text: 'Mỗi tuần cùng con học 3 từ mới từ truyện đọc và thử đặt câu với chúng.' },
  { id: 'bd-4', course: 'BOI_DUONG_TOAN_TV', text: 'Chia bài tập dài thành từng phần nhỏ, nghỉ 5 phút giữa các phần để con giữ được tập trung.' },
  // ── Chung ──
  { id: 'all-1', text: 'Hỏi "Hôm nay ở lớp con thấy vui nhất lúc nào?" thay vì "Hôm nay học gì?" — con sẽ kể nhiều hơn.' },
  { id: 'all-2', text: 'Ghi lại một tiến bộ nhỏ của con mỗi tuần. Nhìn lại sau một tháng, cả ba mẹ và con đều thấy rõ sự cố gắng.' },
  { id: 'all-3', text: 'Cất điện thoại khi ngồi học cùng con 15 phút — sự chú tâm của ba mẹ là động lực lớn với con.' },
  { id: 'all-4', ages: [3, 6], text: 'Trẻ nhỏ tập trung tốt trong khoảng thời gian ngắn — chia hoạt động thành nhiều lượt ngắn, xen vận động.' },
  { id: 'all-5', text: 'Khen sự cố gắng ("con đã kiên trì làm lại") nhiều hơn khen thông minh — giúp con không sợ thử thách.' },
];

/** Day number in local time — the tip changes at midnight. */
export const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);

/**
 * Today's tip for this family: course-specific + general tips that fit the child's age,
 * rotated by day so it changes daily and repeats only after the whole list.
 */
export function pickSpark(course: CourseCategory | null, age: number | null, day = dayNumber()): Spark {
  const fits = (s: Spark) =>
    (!s.course || !course || s.course === course) && (!s.ages || age == null || (age >= s.ages[0] && age <= s.ages[1]));
  const pool = SPARKS.filter(fits);
  const list = pool.length ? pool : SPARKS;
  return list[((day % list.length) + list.length) % list.length];
}
