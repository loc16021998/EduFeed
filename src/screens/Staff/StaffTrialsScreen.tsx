import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { useCrmStore, useStaffStore } from '@/store';
import type { CrmFilter, CrmLead } from '@/types';
import { COLORS } from '@/utils/constants';
import { confirmAsync } from '@/utils/platform';

import CompleteTrialModal from './components/CompleteTrialModal';
import TrialLeadCard from './components/TrialLeadCard';

const FILTERS: { id: CrmFilter; label: string; empty: string }[] = [
  { id: 'TODAY', label: 'Hôm nay', empty: 'Hôm nay không có buổi học thử nào.' },
  { id: 'UPCOMING', label: '7 ngày tới', empty: 'Chưa có lịch học thử trong 7 ngày tới.' },
  { id: 'PENDING', label: 'Cần xác nhận', empty: 'Không có đăng ký nào chờ xác nhận. 👏' },
  { id: 'COMPLETED', label: 'Chờ nhập học', empty: 'Chưa có bé nào học thử xong đang chờ nhập học.' },
];

/** Teacher / staff trial schedule: confirm, cancel, complete with feedback, mark enrolled. */
export default function StaffTrialsScreen({ navigation }: RootStackScreenProps<'StaffTrials'>) {
  const { status: authStatus, isStaff, demo } = useStaffStore();
  const { filter, leads, status, error, busyId, setFilter, load, changeStatus, complete } = useCrmStore();
  const [completing, setCompleting] = useState<CrmLead | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
  }, [authStatus, isStaff, navigation]);

  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  const onConfirm = useCallback(
    async (l: CrmLead) => {
      if (await confirmAsync('Xác nhận lịch học thử?', `Đã gọi xác nhận với ${l.parentName}. Hệ thống sẽ tự nhắc lịch qua Zalo trước buổi học.`, 'Xác nhận')) {
        changeStatus(l, 'CONFIRMED');
      }
    },
    [changeStatus],
  );
  const onCancel = useCallback(
    async (l: CrmLead) => {
      if (await confirmAsync('Hủy lịch học thử?', `Lịch của bé ${l.studentName} sẽ bị hủy và không gửi nhắc lịch nữa.`, 'Hủy lịch')) {
        changeStatus(l, 'CANCELLED');
      }
    },
    [changeStatus],
  );
  const onEnroll = useCallback(
    async (l: CrmLead) => {
      if (await confirmAsync('Xác nhận nhập học?', `Bé ${l.studentName} đã đăng ký khóa học chính thức.`, 'Đã nhập học')) {
        changeStatus(l, 'ENROLLED');
      }
    },
    [changeStatus],
  );

  const current = FILTERS.find((f) => f.id === filter)!;

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Lịch học thử"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('StaffVideos'))}
      />

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-3">
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className={`rounded-full px-4 py-2 ${active ? 'bg-brand-500' : 'border border-slate-200 bg-white'}`}
              >
                <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={leads}
        keyExtractor={(l) => l.id}
        contentContainerClassName="gap-3 px-4 pb-10"
        refreshControl={<RefreshControl refreshing={status === 'loading' && leads.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
        ListHeaderComponent={
          <View className="gap-2">
            {(demo || !hasSupabase) && (
              <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
                Dữ liệu mẫu: kết nối Supabase để xem đăng ký thật.
              </Text>
            )}
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-600">{error}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <TrialLeadCard
            lead={item}
            busy={busyId === item.id}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onComplete={setCompleting}
            onEnroll={onEnroll}
          />
        )}
        ListEmptyComponent={
          status === 'loading' ? (
            <ActivityIndicator className="mt-10" color={COLORS.brand} />
          ) : (
            <Text className="mt-10 px-8 text-center text-ink-muted">{current.empty}</Text>
          )
        }
      />

      <CompleteTrialModal
        lead={completing}
        busy={!!completing && busyId === completing.id}
        onClose={() => setCompleting(null)}
        onSubmit={async (note) => {
          const err = await complete(completing!, note);
          if (!err) setCompleting(null);
          return err;
        }}
      />
    </View>
  );
}
