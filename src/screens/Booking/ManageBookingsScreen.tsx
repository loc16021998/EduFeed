import { useFocusEffect } from '@react-navigation/native';
import { CalendarClock, MapPin, Navigation, Phone, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, ScreenHeader } from '@/components';
import { hasHotline } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { appointmentDate, type BookingState } from '@/services/myBookings';
import { useBookingStore, useMyBookingsStore } from '@/store';
import type { BookingRecord, LeadStatus } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS, CONTACT } from '@/utils/constants';
import { TIME_SLOTS } from '@/utils/mockData';
import { formatDateLong } from '@/utils/schedule';

import { EmptyState, StatusBanner, UndoSnackbar, useUndoAction } from '@/components/ux';

import SchedulePicker from './components/SchedulePicker';

const STATUS: Record<LeadStatus, { label: string; bg: string; fg: string }> = {
  NEW: { label: 'Chờ trung tâm xác nhận', bg: '#FEF3C7', fg: '#92400E' },
  CONTACTED: { label: 'Trung tâm đã liên hệ', bg: '#E0E7FF', fg: '#3730A3' },
  CONFIRMED: { label: 'Đã xác nhận', bg: '#DBEAFE', fg: '#1E40AF' },
  REMINDED_24H: { label: 'Đã xác nhận', bg: '#DBEAFE', fg: '#1E40AF' },
  REMINDED_2H: { label: 'Đã xác nhận', bg: '#DBEAFE', fg: '#1E40AF' },
  COMPLETED_TRIAL: { label: 'Đã học thử', bg: '#D1FAE5', fg: '#065F46' },
  ENROLLED: { label: 'Đã nhập học 🎉', bg: '#D1FAE5', fg: '#065F46' },
  CANCELLED: { label: 'Đã hủy', bg: '#F1F5F9', fg: '#64748B' },
};

const slotLabel = (id: string | null) => TIME_SLOTS.find((s) => s.id === id)?.label ?? '';

interface Item {
  booking: BookingRecord;
  state: BookingState | undefined;
  date: string;
  slotId: string;
  at: Date | null;
  status: LeadStatus;
  upcoming: boolean;
}

/** Parents: their trial appointments on this device — reschedule, cancel, call the centre, directions. */
export default function ManageBookingsScreen({ navigation }: RootStackScreenProps<'ManageBookings'>) {
  const history = useBookingStore((s) => s.history);
  const { states, refreshing, error, busyId, refresh, reschedule, cancel } = useMyBookingsStore();
  const [editing, setEditing] = useState<Item | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Cancellations waiting out the 5-second "Hoàn tác" window (shown as cancelled right away).
  const [cancelling, setCancelling] = useState<string[]>([]);
  const undo = useUndoAction();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      refresh(true);
    }, [refresh]),
  );

  const items: Item[] = useMemo(() => {
    const now = Date.now();
    return history.map((b) => {
      const st = states[b.id];
      const date = st?.preferredDate ?? b.preferredDate;
      const slotId = st?.preferredSlotId ?? b.preferredSlotId;
      const at = appointmentDate(date, slotId);
      const status: LeadStatus = cancelling.includes(b.id) ? 'CANCELLED' : st?.status ?? 'NEW';
      const upcoming = !!at && at.getTime() > now && !['CANCELLED', 'COMPLETED_TRIAL', 'ENROLLED'].includes(status);
      return { booking: b, state: st, date, slotId, at, status, upcoming };
    });
  }, [history, states, cancelling]);
  const upcoming = items.filter((i) => i.upcoming).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  const past = items.filter((i) => !i.upcoming);

  // Cancel = shown at once, sent after 5 s unless the parent taps "Hoàn tác" (also sent when leaving the screen).
  const onCancel = (i: Item) => {
    const id = i.booking.id;
    setActionError(null);
    setCancelling((cur) => [...cur, id]);
    const done = () => setCancelling((cur) => cur.filter((x) => x !== id));
    undo.schedule(
      `Đã hủy lịch học thử của bé ${i.booking.studentName.replace(/^Bé\s+/i, '')}`,
      async () => {
        const err = await cancel(i.booking);
        if (err) setActionError(err);
        done();
      },
      { onUndo: done, onError: done },
    );
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Booking' }));

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Lịch hẹn của tôi" onBack={goBack} />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-24"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={COLORS.brand} />}
      >
        {!!(error || actionError) && <StatusBanner tone="error" text={(actionError ?? error)!} action={{ label: 'Thử lại', onPress: () => refresh(true) }} />}

        {history.length === 0 ? (
          <View className="mt-6">
            <EmptyState
              emoji="📅"
              title="Chưa có lịch học thử nào"
              message="Lịch hẹn ba mẹ đặt trong app sẽ hiện ở đây để đổi lịch hoặc hủy khi cần."
              action={{ label: 'Đặt lịch học thử ngay', variant: 'accent', onPress: () => navigation.navigate('MainTabs', { screen: 'Booking' }), testID: 'empty-bookings-cta' }}
              testID="empty-bookings"
            />
          </View>
        ) : (
          <>
            <Section title={`Sắp tới (${upcoming.length})`} />
            {upcoming.length === 0 && (
              <EmptyState
                compact
                emoji="🗓️"
                title="Không có lịch học thử sắp tới"
                action={{ label: 'Đặt thêm lịch học thử', variant: 'outline', onPress: () => navigation.navigate('MainTabs', { screen: 'Booking' }) }}
              />
            )}
            {upcoming.map((i) => (
              <BookingCard
                key={i.booking.id}
                item={i}
                busy={busyId === i.booking.id}
                onReschedule={() => {
                  setActionError(null);
                  setEditing(i);
                }}
                onCancel={() => onCancel(i)}
              />
            ))}
            {past.length > 0 && <Section title={`Đã qua / đã hủy (${past.length})`} />}
            {past.map((i) => (
              <BookingCard key={i.booking.id} item={i} busy={false} />
            ))}
            {refreshing && !Object.keys(states).length && <ActivityIndicator color={COLORS.brand} />}
          </>
        )}
      </ScrollView>

      <UndoSnackbar pending={undo.pending} onUndo={undo.undo} bottom={Math.max(insets.bottom, 12) + 8} />

      <RescheduleSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSubmit={async (date, slotId) => {
          const err = await reschedule(editing!.booking, date, slotId);
          if (!err) setEditing(null);
          return err;
        }}
      />
    </View>
  );
}

function Section({ title }: { title: string }) {
  return <Text className="pt-2 text-xs font-bold uppercase tracking-wide text-ink-subtle">{title}</Text>;
}

function BookingCard({ item, busy, onReschedule, onCancel }: { item: Item; busy: boolean; onReschedule?: () => void; onCancel?: () => void }) {
  const b = item.booking;
  const st = STATUS[item.status];
  const canChange = item.upcoming && (item.state?.canChange ?? true);
  return (
    <View className={`gap-3 rounded-3xl bg-white p-4 ${item.upcoming ? '' : 'opacity-80'}`} testID="my-booking">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="text-[17px] font-extrabold text-ink">
            {slotLabel(item.slotId)}
          </Text>
          <Text className="text-[13px] font-semibold text-ink-muted">{formatDateLong(item.date)}</Text>
        </View>
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: st.bg }}>
          <Text className="text-[11px] font-bold" style={{ color: st.fg }}>
            {st.label}
          </Text>
        </View>
      </View>
      <View className="gap-1.5">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="text-[15px] font-bold text-ink">Bé {b.studentName.replace(/^Bé\s+/i, '')}</Text>
          <Badge label={CATEGORY_LABELS[b.selectedCourse]} color={CATEGORY_COLORS[b.selectedCourse]} />
        </View>
        <View className="flex-row items-center gap-1">
          <MapPin size={13} color={COLORS.muted} />
          <Text className="flex-1 text-xs text-ink-muted">{b.display.campus}</Text>
        </View>
        <Text className="text-[11px] text-ink-subtle">Mã đăng ký: {b.code}</Text>
      </View>

      {item.upcoming && (
        <View className="gap-2">
          {canChange && (
            <View className="flex-row gap-2">
              <Button className="flex-1" size="sm" title="Đổi lịch hẹn" icon={<CalendarClock size={15} color="#fff" />} loading={busy} onPress={onReschedule!} />
              <Button className="flex-1" size="sm" title="Hủy lịch" variant="outline" icon={<XCircle size={15} color={COLORS.brandDark} />} disabled={busy} onPress={onCancel!} />
            </View>
          )}
          <View className="flex-row gap-2">
            {hasHotline && (
              <Pressable
                onPress={() => Linking.openURL(`tel:${CONTACT.hotline}`).catch(() => {})}
                accessibilityRole="button"
                className="min-h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-50 active:bg-slate-100"
              >
                <Phone size={14} color={COLORS.ink} />
                <Text className="text-[13px] font-semibold text-ink">Gọi hotline</Text>
              </Pressable>
            )}
            {!!b.display.mapsUrl && (
              <Pressable
                onPress={() => Linking.openURL(b.display.mapsUrl).catch(() => {})}
                accessibilityRole="link"
                className="min-h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-50 active:bg-slate-100"
              >
                <Navigation size={14} color={COLORS.ink} />
                <Text className="text-[13px] font-semibold text-ink">Chỉ đường</Text>
              </Pressable>
            )}
          </View>
          {!canChange && <Text className="text-xs text-ink-muted">Lịch hẹn này không đổi được trong app nữa — ba mẹ vui lòng gọi trung tâm.</Text>}
          {canChange && item.state && item.state.reschedulesLeft < 3 && (
            <Text className="text-[11px] text-ink-subtle">Còn {item.state.reschedulesLeft} lần đổi lịch trong app.</Text>
          )}
        </View>
      )}
    </View>
  );
}

function RescheduleSheet({ item, onClose, onSubmit }: { item: Item | null; onClose: () => void; onSubmit: (date: string, slotId: string) => Promise<string | null> }) {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDate(item?.date ?? null);
    setSlotId(item?.slotId ?? null);
    setError(null);
  }, [item]);

  const submit = async () => {
    if (!date || !slotId) return setError('Ba mẹ chọn ngày và khung giờ mới nhé.');
    setBusy(true);
    const err = await onSubmit(date, slotId);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {item && (
          <View className="max-h-[88%] rounded-t-[28px] bg-surface" style={{ paddingBottom: Math.max(insets.bottom, 16) }} testID="reschedule-sheet">
            <ScrollView contentContainerClassName="gap-3 p-5">
              <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
                Đổi lịch học thử
              </Text>
              <Text className="text-[13px] leading-5 text-ink-muted">
                Lịch hiện tại: {slotLabel(item.slotId)} · {formatDateLong(item.date)}. Chọn lịch mới, trung tâm sẽ nhắc lịch qua Zalo trước buổi học.
              </Text>
              <SchedulePicker
                date={date}
                slotId={slotId}
                onDate={(d) => {
                  setDate(d);
                  setSlotId(null);
                  setError(null);
                }}
                onSlot={(s) => {
                  setSlotId(s);
                  setError(null);
                }}
              />
              {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
              <View className="flex-row gap-2.5 pt-1">
                <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
                <Button className="flex-[2]" title="Xác nhận lịch mới" loading={busy} onPress={submit} />
              </View>
            </ScrollView>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
