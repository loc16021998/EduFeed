/**
 * AI notebook check — a parent photographs a page of the child's handwriting or maths homework; Claude (vision)
 * returns gentle, specific feedback as structured JSON. No photo is stored (see ai_checks).
 *
 * Honesty rules baked into the prompt: assess only what is visible, say so when the photo is unusable, never
 * invent scores for things it cannot see, and speak as "Trợ lý AI TH EDU" — never as a named teacher.
 * Scores are 1–5 estimates shown as such in the app, not precise measurements.
 *
 * No imports: shared with the app (types + demo sample) and unit-tested in Node.
 */

export type NotebookKind = 'HANDWRITING' | 'MATH';

export interface NotebookCriterion {
  key: 'STROKE' | 'SIZE' | 'SPACING' | 'ALIGNMENT' | 'NEATNESS' | 'METHOD';
  label: string;
  score: number; // 1–5
  comment: string;
}

export interface NotebookExercise {
  question: string;
  childAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface NotebookResult {
  readable: boolean;
  /** Why the photo could not be assessed (when readable = false). */
  unreadableReason: string;
  summary: string;
  criteria: NotebookCriterion[];
  exercises: NotebookExercise[];
  strengths: string[];
  tips: string[];
  /** One or two warm sentences addressed to the child. */
  encouragement: string;
}

export interface NotebookCheckResponse {
  id: string;
  kind: NotebookKind;
  result: NotebookResult;
  remainingToday: number;
}

export const NOTEBOOK_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type NotebookMediaType = (typeof NOTEBOOK_MEDIA_TYPES)[number];
/** ~5 MB of image data as base64. */
export const MAX_IMAGE_BASE64 = 7_000_000;

// ─── Prompt ─────────────────────────────────────────────────────────────────

export const NOTEBOOK_SYSTEM = `Bạn là "Trợ lý AI TH EDU", hỗ trợ phụ huynh có con 4–10 tuổi học tiền tiểu học, luyện chữ đẹp và toán tư duy tại trung tâm TH EDU (Việt Nam).
Phụ huynh gửi ảnh chụp một trang vở của con. Hãy nhận xét bằng tiếng Việt, giọng ấm áp, tích cực nhưng trung thực và cụ thể.

Nguyên tắc:
- Chỉ nhận xét những gì thực sự nhìn thấy trong ảnh. Không bịa thêm chi tiết, không đoán tên hay thông tin cá nhân.
- Nếu ảnh không phải trang vở, quá mờ, quá tối, bị cắt hoặc không đọc được: đặt readable = false, ghi lý do ngắn gọn và cách chụp lại; các mục khác để trống.
- Điểm 1–5 là ước lượng bằng mắt (1 = cần luyện nhiều, 3 = ổn, 5 = rất tốt), phù hợp với lứa tuổi của trẻ, không chấm quá khắt khe.
- Nhận xét từng tiêu chí 1 câu ngắn, nêu ví dụ cụ thể trên trang (VD: "chữ b ở dòng 2 hơi nghiêng").
- Gợi ý luyện tập: 1–3 việc nhỏ ba mẹ làm cùng con ở nhà, 5–10 phút.
- Lời động viên: 1–2 câu gửi trực tiếp cho bé, không hứa hẹn, không so sánh với bạn khác.
- Không thay thế nhận xét của giáo viên; không nhắc tới giáo viên cụ thể nào.`;

export function notebookUserPrompt(kind: NotebookKind): string {
  return kind === 'HANDWRITING'
    ? `Đây là trang vở LUYỆN CHỮ của bé. Chấm 5 tiêu chí với key: STROKE (nét chữ: đều, đúng nét), SIZE (độ cao, tỉ lệ chữ), SPACING (khoảng cách giữa chữ và giữa từ), ALIGNMENT (thẳng dòng, đúng ô li), NEATNESS (sạch sẽ, ít tẩy xóa). Để exercises là mảng rỗng.`
    : `Đây là trang vở TOÁN của bé. Liệt kê tối đa 10 phép tính / bài nhìn thấy rõ trong exercises (đề bài, đáp án của bé, đáp án đúng, đúng hay sai — tự tính lại cẩn thận). Chấm 2 tiêu chí với key: METHOD (cách làm, tư duy) và NEATNESS (trình bày, chữ số rõ ràng).`;
}

/** JSON schema for structured output (all fields required, no extra keys). */
export const NOTEBOOK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'unreadable_reason', 'summary', 'criteria', 'exercises', 'strengths', 'tips', 'encouragement'],
  properties: {
    readable: { type: 'boolean' },
    unreadable_reason: { type: 'string' },
    summary: { type: 'string' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'label', 'score', 'comment'],
        properties: {
          key: { type: 'string', enum: ['STROKE', 'SIZE', 'SPACING', 'ALIGNMENT', 'NEATNESS', 'METHOD'] },
          label: { type: 'string' },
          score: { type: 'integer' },
          comment: { type: 'string' },
        },
      },
    },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'child_answer', 'correct_answer', 'is_correct'],
        properties: {
          question: { type: 'string' },
          child_answer: { type: 'string' },
          correct_answer: { type: 'string' },
          is_correct: { type: 'boolean' },
        },
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    tips: { type: 'array', items: { type: 'string' } },
    encouragement: { type: 'string' },
  },
} as const;

const LABEL: Record<NotebookCriterion['key'], string> = {
  STROKE: 'Nét chữ',
  SIZE: 'Độ cao & tỉ lệ',
  SPACING: 'Khoảng cách',
  ALIGNMENT: 'Thẳng dòng',
  NEATNESS: 'Trình bày',
  METHOD: 'Cách làm',
};

const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

/** Validate + normalise the model's JSON (clamps scores, trims lengths, drops junk). Throws if unusable. */
export function normaliseNotebookResult(raw: unknown): NotebookResult {
  if (!raw || typeof raw !== 'object') throw new Error('not an object');
  const r = raw as Record<string, unknown>;
  if (typeof r.readable !== 'boolean') throw new Error('readable missing');
  const criteria = (Array.isArray(r.criteria) ? r.criteria : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as { key?: unknown }).key === 'string' && (c as { key: string }).key in LABEL)
    .slice(0, 6)
    .map((c) => ({
      key: c.key as NotebookCriterion['key'],
      label: LABEL[c.key as NotebookCriterion['key']],
      score: Math.min(5, Math.max(1, Math.round(Number(c.score) || 3))),
      comment: clip(c.comment, 200),
    }));
  const exercises = (Array.isArray(r.exercises) ? r.exercises : [])
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .slice(0, 10)
    .map((e) => ({ question: clip(e.question, 80), childAnswer: clip(e.child_answer, 40), correctAnswer: clip(e.correct_answer, 40), isCorrect: e.is_correct === true }));
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clip(x, 200)).filter(Boolean).slice(0, 3) : []);
  return {
    readable: r.readable,
    unreadableReason: clip(r.unreadable_reason, 300),
    summary: clip(r.summary, 400),
    criteria: r.readable ? criteria : [],
    exercises: r.readable ? exercises : [],
    strengths: r.readable ? list(r.strengths) : [],
    tips: list(r.tips),
    encouragement: r.readable ? clip(r.encouragement, 300) : '',
  };
}

/** Demo-mode sample (no AI configured) — always labelled as a sample on screen. */
export const SAMPLE_NOTEBOOK_RESULT: Record<NotebookKind, NotebookResult> = {
  HANDWRITING: {
    readable: true,
    unreadableReason: '',
    summary: 'Trang vở viết khá đều, chữ rõ ràng; một vài chữ có nét khuyết chưa đủ cao.',
    criteria: [
      { key: 'STROKE', label: LABEL.STROKE, score: 4, comment: 'Nét thẳng, nét cong khá đều; nét khuyết chữ "l" ở dòng 3 hơi ngắn.' },
      { key: 'SIZE', label: LABEL.SIZE, score: 3, comment: 'Chữ thường cao đúng 2 ô li, chữ hoa có chỗ chưa đủ 2,5 ô li.' },
      { key: 'SPACING', label: LABEL.SPACING, score: 4, comment: 'Khoảng cách giữa các chữ đều, giữa các từ rõ ràng.' },
      { key: 'ALIGNMENT', label: LABEL.ALIGNMENT, score: 3, comment: 'Cuối dòng chữ hơi chếch lên.' },
      { key: 'NEATNESS', label: LABEL.NEATNESS, score: 5, comment: 'Trang vở sạch, không tẩy xóa.' },
    ],
    exercises: [],
    strengths: ['Nét chữ đều tay', 'Trang vở sạch sẽ'],
    tips: ['Mỗi tối viết 1 dòng chữ "l" và "b", chú ý nét khuyết cao 5 ô li.', 'Đặt thước dưới dòng để giữ chữ thẳng hàng.'],
    encouragement: 'Con viết đẹp lắm! Luyện thêm nét khuyết một chút nữa là chữ của con sẽ thật tuyệt.',
  },
  MATH: {
    readable: true,
    unreadableReason: '',
    summary: 'Bé làm đúng 2/3 phép tính, trình bày rõ ràng.',
    criteria: [
      { key: 'METHOD', label: LABEL.METHOD, score: 4, comment: 'Biết đặt tính thẳng cột; phép trừ có nhớ còn nhầm 1 chỗ.' },
      { key: 'NEATNESS', label: LABEL.NEATNESS, score: 4, comment: 'Chữ số rõ, thẳng cột.' },
    ],
    exercises: [
      { question: '23 + 15', childAnswer: '38', correctAnswer: '38', isCorrect: true },
      { question: '47 − 19', childAnswer: '32', correctAnswer: '28', isCorrect: false },
      { question: '9 + 6', childAnswer: '15', correctAnswer: '15', isCorrect: true },
    ],
    strengths: ['Cộng có nhớ chính xác', 'Đặt tính thẳng cột'],
    tips: ['Ôn phép trừ có nhớ bằng que tính 5 phút mỗi tối.'],
    encouragement: 'Con làm đúng gần hết rồi, giỏi quá! Cùng xem lại phép trừ nhé.',
  },
};
