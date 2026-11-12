import { useIsFocused } from '@react-navigation/native';
import { AlertCircle, CalendarClock, Gift, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Select, TrustBadges, TrustModal, type SelectOption } from '@/components';
import type { TabScreenProps } from '@/navigation/types';
import { useBookingStore, useParentClubStore, useQuizStore, useTrustStore, useUserStore } from '@/store';
import { rewardUnlocked } from '@/store/useParentClubStore';
import type { CourseCategory, LeadSource } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS, COURSE_CATEGORIES, SOURCE_LABELS } from '@/utils/constants';
import { PARENT_CLUB_REWARD } from '@/utils/parentClub';
import { PROMO_CODES } from '../../../supabase/functions/_shared/contracts';
import { COURSES } from '@/utils/mockData';
import { FIELD_ORDER, validateField, type BookingField, type BookingForm } from '@/utils/validation';

import AgePicker from './components/AgePicker';
import CampusRadio from './components/CampusRadio';
import FormField from './components/FormField';
import FormSection from './components/FormSection';
import GiftBanner from './components/GiftBanner';
import SchedulePicker from './components/SchedulePicker';
import ZaloQuickFillButton from './components/ZaloQuickFillButton';
import ZaloTrustNote from './components/ZaloTrustNote';
import { useExitIntent } from './hooks/useExitIntent';

const COURSE_OPTIONS: SelectOption<CourseCategory>[] = COURSE_CATEGORIES.map((c) => {
  const course = COURSES.find((x) => x.id === c);
  return {
    value: c,
    label: CATEGORY_LABELS[c],
    description: course ? `${course.ageRange} · ${course.schedule}` : undefined,
    color: CATEGORY_COLORS[c],
  };
});

/** Which form section each field lives in — for scroll-to-first-error. */
const FIELD_SECTION: Record<BookingField, number> = {
  course: 1,
  campus: 1,
  preferredDate: 2,
  preferredSlotId: 2,
  parentName: 3,
  phone: 3,
  childName: 4,
  childAge: 4,
};

export default function BookingScreen({ route, navigation }: TabScreenProps<'Booking'>) {
  const insets = useSafeAreaInsets();
  const params = route.params;
  const source: LeadSource = params?.source ?? (params?.fromQuiz ? 'QUIZ' : 'DIRECT');

  const { form, errors, status, submitError, prefill, setField, touch, submit, resetForm, history } = useBookingStore();
  const profile = useUserStore();
  const quizResult = useQuizStore((s) => s.result);
  const quizAnswers = useQuizStore((s) => s.answers);
  const quizSummary = params?.fromQuiz ? quizResult?.summary : undefined;

  const [zaloUserId, setZaloUserId] = useState<string | undefined>(profile.zaloUserId ?? undefined);
  const isFocused = useIsFocused();

  // ── Exit-intent (one-time incentive) ──
  const exitOffer = useTrustStore((s) => s.exitOffer);
  // CLB Phụ huynh reward (all badges) takes precedence: a booking carries one promo code.
  const clubReward = useParentClubStore((s) => (rewardUnlocked(s) ? PARENT_CLUB_REWARD : null));
  const promoCode = clubReward ? clubReward.promoCode : exitOffer.claimed ? ('EBOOK_VAO_LOP_1' as const) : undefined;
  const { claimExitOffer, dismissExitOffer, consumeExitOffer } = useTrustStore();
  const [interacted, setInteracted] = useState(false);
  const edit = <K extends BookingField>(field: K, value: BookingForm[K]) => {
    setInteracted(true);
    setField(field, value);
  };
  useExitIntent({
    inProgress: interacted && status !== 'loading' && status !== 'success',
    focused: isFocused,
    activity: form,
  });
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<number, number>>({});
  const phoneRef = useRef<TextInput>(null);
  const childNameRef = useRef<TextInput>(null);

  // Pre-fill once from the saved profile (never overwrites what the parent typed).
  useEffect(() => {
    prefill({
      parentName: profile.parentName,
      phone: profile.phone,
      childName: profile.childName,
      childAge: profile.childAge,
      campus: profile.preferredCampus ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Course passed from EduFeed / Quiz / Portfolio always wins.
  useEffect(() => {
    if (params?.course) prefill({ course: params.course }, { overwrite: true });
  }, [params?.course, prefill]);

  const scrollToField = (field: BookingField) => {
    const y = sectionY.current[FIELD_SECTION[field]];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const onClaimOffer = () => {
    claimExitOffer();
    // Guide the parent to what's still missing — without flashing red errors at them.
    const first = FIELD_ORDER.find((f) => validateField(f, useBookingStore.getState().form));
    if (first) setTimeout(() => scrollToField(first), 250);
  };

  const onDismissOffer = () => {
    const target = dismissExitOffer();
    if (target) navigation.navigate(target);
  };

  const onSubmit = async () => {
    const record = await submit({
      source,
      sourceRef: params?.sourceRef,
      zaloUserId,
      ...(promoCode ? { promoCode } : {}),
      ...(quizSummary ? { quizSummary, quizAnswers } : {}),
    });

    if (!record) {
      // Validation failed → jump to the first invalid field.
      const first = FIELD_ORDER.find((f) => useBookingStore.getState().errors[f]);
      if (first) scrollToField(first);
      return;
    }

    profile.setProfile({
      parentName: record.parentName,
      phone: record.phone,
      childName: record.studentName,
      childAge: record.childAge,
      preferredCampus: record.selectedCampus,
      zaloUserId: zaloUserId ?? null,
    });
    consumeExitOffer();
    setInteracted(false);
    navigation.navigate('BookingSuccess', { bookingId: record.id });
    resetForm();
  };

  const courseNote =
    params?.course && params.course === form.course && source !== 'DIRECT'
      ? `✓ Đã chọn sẵn từ ${SOURCE_LABELS[source]}`
      : undefined;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="gap-4 p-4 pb-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {history.length > 0 && (
          <Pressable
            onPress={() => navigation.navigate('ManageBookings')}
            accessibilityRole="button"
            testID="my-bookings-link"
            className="flex-row items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-3.5 active:opacity-90"
          >
            <CalendarClock size={20} color={COLORS.brand} />
            <Text className="flex-1 text-[14px] font-bold text-ink">Lịch hẹn của tôi ({history.length})</Text>
            <Text className="text-xs font-semibold text-brand-600">Đổi / hủy lịch ›</Text>
          </Pressable>
        )}

        <GiftBanner course={form.course} />

        <TrustBadges onSeeAll={() => navigation.navigate('Testimonials', { course: form.course })} />

        {quizSummary && (
          <View className="gap-1.5 rounded-2xl border border-accent-100 bg-white p-3.5">
            <View className="flex-row items-center gap-2">
              <Sparkles size={16} color={COLORS.accent} />
              <Text className="flex-1 text-[13px] font-bold text-accent-600">{quizSummary.recommendation}</Text>
            </View>
            <Text className="text-xs leading-[18px] text-ink-muted">
              {quizSummary.ageGroup} · {quizSummary.painPoints.join(', ')} · Mong muốn: {quizSummary.goal}
            </Text>
          </View>
        )}

        <FormSection step={1} title="Khóa học & cơ sở" onLayout={(e) => (sectionY.current[1] = e.nativeEvent.layout.y)}>
          <Select
            label="Khóa học"
            value={form.course}
            options={COURSE_OPTIONS}
            onChange={(c) => edit('course', c)}
            error={errors.course}
            note={courseNote}
          />
          <CampusRadio
            course={form.course}
            value={form.campus}
            onChange={(c) => edit('campus', c)}
            error={errors.campus}
          />
        </FormSection>

        <FormSection step={2} title="Lịch học thử mong muốn" onLayout={(e) => (sectionY.current[2] = e.nativeEvent.layout.y)}>
          <SchedulePicker
            date={form.preferredDate}
            slotId={form.preferredSlotId}
            onDate={(d) => {
              edit('preferredDate', d);
              touch('preferredDate');
            }}
            onSlot={(s) => {
              edit('preferredSlotId', s);
              touch('preferredSlotId');
            }}
            dateError={errors.preferredDate}
            slotError={errors.preferredSlotId}
          />
        </FormSection>

        <FormSection
          step={3}
          title="Thông tin phụ huynh"
          onLayout={(e) => (sectionY.current[3] = e.nativeEvent.layout.y)}
          right={
            <ZaloQuickFillButton
              onProfile={(p) => {
                setInteracted(true);
                prefill({ parentName: p.name, phone: p.phone }, { overwrite: true });
                setZaloUserId(p.id);
              }}
            />
          }
        >
          <FormField
            label="Họ tên phụ huynh"
            placeholder="VD: Nguyễn Thu Trang"
            value={form.parentName}
            onChangeText={(v) => edit('parentName', v)}
            onBlur={() => touch('parentName')}
            error={errors.parentName}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            blurOnSubmit={false}
          />
          <FormField
            ref={phoneRef}
            label="Số điện thoại / Zalo"
            placeholder="VD: 0912 345 678"
            value={form.phone}
            onChangeText={(v) => edit('phone', v)}
            onBlur={() => touch('phone')}
            error={errors.phone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={16}
            returnKeyType="next"
            onSubmitEditing={() => childNameRef.current?.focus()}
            blurOnSubmit={false}
          />
          <ZaloTrustNote />
        </FormSection>

        <FormSection step={4} title="Thông tin của bé" onLayout={(e) => (sectionY.current[4] = e.nativeEvent.layout.y)}>
          <FormField
            ref={childNameRef}
            label="Họ tên của bé"
            placeholder="VD: Trần Gia Bảo"
            value={form.childName}
            onChangeText={(v) => edit('childName', v)}
            onBlur={() => touch('childName')}
            error={errors.childName}
            autoCapitalize="words"
            returnKeyType="done"
          />
          <AgePicker
            value={form.childAge}
            onChange={(a) => {
              edit('childAge', a);
              touch('childAge');
            }}
            error={errors.childAge}
          />
        </FormSection>

        <Text className="px-2 text-center text-[11px] leading-4 text-ink-subtle">
          Bằng việc đăng ký, ba mẹ đồng ý để TH EDU liên hệ qua điện thoại / Zalo để xác nhận lịch học thử. Thông tin
          chỉ dùng cho mục đích tư vấn và không chia sẻ cho bên thứ ba. Lượt đăng ký có thể hiển thị ẩn danh trong ứng dụng (VD: "Phụ huynh T. vừa đặt lịch…").
        </Text>
      </ScrollView>

      {/* Sticky submit */}
      <View className="gap-2 border-t border-slate-200 bg-white px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {!!submitError && (
          <View className="flex-row items-center gap-2 rounded-xl bg-red-50 p-2.5" accessibilityLiveRegion="assertive">
            <AlertCircle size={16} color="#EF4444" />
            <Text className="flex-1 text-xs text-red-600">{submitError}</Text>
          </View>
        )}
        {!!promoCode && (
          <View className="flex-row items-center gap-2 rounded-xl bg-emerald-50 p-2.5" testID="booking-promo">
            <Gift size={16} color="#059669" />
            <Text className="flex-1 text-xs font-semibold text-emerald-700">
              {clubReward ? `Ưu đãi CLB Phụ huynh: ${clubReward.title}` : `Đã thêm quà: ${PROMO_CODES[promoCode]}`}
            </Text>
          </View>
        )}
        <Button
          title={status === 'loading' ? 'Đang gửi đăng ký…' : '🎁 Đăng ký học thử miễn phí'}
          variant="accent"
          size="lg"
          loading={status === 'loading'}
          onPress={onSubmit}
        />
      </View>
      <TrustModal visible={exitOffer.visible && isFocused} onClaim={onClaimOffer} onDismiss={onDismissOffer} />
    </KeyboardAvoidingView>
  );
}
