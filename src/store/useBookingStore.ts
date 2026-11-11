import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { submitLead } from '@/services/leads';
import type { AsyncStatus, BookingRecord, LeadSource, PromoCode, QuizAnswers, QuizSummary } from '@/types';
import { STORAGE_KEYS } from '@/utils/constants';
import { uuidv4 } from '@/utils/helpers';
import { COURSES, TIME_SLOTS } from '@/utils/mockData';
import { slotsForDate } from '@/utils/schedule';
import {
  validateBookingForm,
  validateField,
  type BookingErrors,
  type BookingField,
  type BookingForm,
} from '@/utils/validation';

export interface SubmitMeta {
  source: LeadSource;
  sourceRef?: string;
  promoCode?: PromoCode;
  zaloUserId?: string;
  quizAnswers?: QuizAnswers;
  quizSummary?: QuizSummary;
}

interface BookingState {
  form: BookingForm;
  errors: BookingErrors;
  touched: Partial<Record<BookingField, boolean>>;
  status: AsyncStatus;
  submitError: string | null;
  /** Idempotency key reused across retries of the same submission; cleared on success/reset. */
  pendingLeadId: string | null;
  history: BookingRecord[];

  /** Merge pre-fill values (route params, saved profile, Zalo) without clobbering typed input. */
  prefill: (values: Partial<BookingForm>, opts?: { overwrite?: boolean }) => void;
  setField: <K extends BookingField>(field: K, value: BookingForm[K]) => void;
  touch: (field: BookingField) => void;
  /** Validate everything, mark all touched. Returns the first invalid field, if any. */
  validateAll: () => BookingField | null;
  submit: (meta: SubmitMeta) => Promise<BookingRecord | null>;
  resetForm: () => void;
}

const emptyForm: BookingForm = {
  course: 'TIEN_TIEU_HOC',
  campus: 'XA_LA',
  parentName: '',
  phone: '',
  childName: '',
  childAge: null,
  preferredDate: null,
  preferredSlotId: null,
};

/** Keep dependent fields consistent after a change (campus ↔ course, slot ↔ date). */
function reconcile(form: BookingForm): BookingForm {
  const next = { ...form };
  const campuses = COURSES.find((c) => c.id === next.course)?.campuses ?? [];
  if (campuses.length && !campuses.includes(next.campus)) next.campus = campuses[0];
  if (next.preferredSlotId && !slotsForDate(next.preferredDate, TIME_SLOTS).some((s) => s.id === next.preferredSlotId)) {
    next.preferredSlotId = null;
  }
  return next;
}

/** Re-validate only fields the parent has already interacted with (no premature red text). */
function revalidateTouched(form: BookingForm, touched: BookingState['touched']): BookingErrors {
  const errors: BookingErrors = {};
  (Object.keys(touched) as BookingField[]).forEach((f) => {
    const msg = touched[f] ? validateField(f, form) : undefined;
    if (msg) errors[f] = msg;
  });
  return errors;
}

export const useBookingStore = create<BookingState>()(
  persist(
    (set, get) => ({
      form: emptyForm,
      errors: {},
      touched: {},
      status: 'idle',
      submitError: null,
      pendingLeadId: null,
      history: [],

      prefill: (values, opts) =>
        set((s) => {
          const merged = { ...s.form };
          (Object.keys(values) as BookingField[]).forEach((k) => {
            const v = values[k];
            if (v === undefined || v === null || v === '') return;
            const current = merged[k];
            const isEmpty = current === null || current === '';
            if (opts?.overwrite || isEmpty) (merged as Record<BookingField, unknown>)[k] = v;
          });
          const form = reconcile(merged);
          return { form, errors: revalidateTouched(form, s.touched) };
        }),

      setField: (field, value) =>
        set((s) => {
          const form = reconcile({ ...s.form, [field]: value });
          return { form, errors: revalidateTouched(form, s.touched), submitError: null, pendingLeadId: null };
        }),

      touch: (field) =>
        set((s) => {
          const touched = { ...s.touched, [field]: true };
          return { touched, errors: revalidateTouched(s.form, touched) };
        }),

      validateAll: () => {
        const errors = validateBookingForm(get().form);
        const touched = Object.fromEntries(Object.keys(get().form).map((k) => [k, true]));
        set({ errors, touched });
        const first = Object.keys(errors)[0] as BookingField | undefined;
        return first ?? null;
      },

      submit: async (meta) => {
        if (get().status === 'loading') return null; // double-tap guard
        if (get().validateAll()) return null;

        const f = get().form;
        const leadId = get().pendingLeadId ?? uuidv4();
        set({ status: 'loading', submitError: null, pendingLeadId: leadId });
        try {
          const record = await submitLead({
            studentName: f.childName,
            childAge: f.childAge!,
            parentName: f.parentName,
            phone: f.phone,
            selectedCourse: f.course,
            selectedCampus: f.campus,
            preferredDate: f.preferredDate!,
            preferredSlotId: f.preferredSlotId!,
            ...meta,
          }, leadId);
          set((s) => ({ status: 'success', pendingLeadId: null, history: [record, ...s.history].slice(0, 20) }));
          return record;
        } catch (e) {
          set({ status: 'error', submitError: e instanceof Error ? e.message : 'Đã có lỗi xảy ra' });
          return null;
        }
      },

      resetForm: () =>
        set({ form: emptyForm, errors: {}, touched: {}, status: 'idle', submitError: null, pendingLeadId: null }),
    }),
    {
      name: STORAGE_KEYS.booking,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist submitted bookings only; the in-progress form is session state.
      partialize: (s) => ({ history: s.history }),
    },
  ),
);
