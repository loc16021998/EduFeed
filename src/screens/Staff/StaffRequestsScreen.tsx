import { CircleAlert, Phone } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { decideStaffRequest, listStaffRequests, type StaffRequest, type StaffRequestStatus } from '@/services/staffRequests';
import { useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { confirmAsync } from '@/utils/platform';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const pad = (n: number) => String(n).padStart(2, '0');
const at = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

const STATUS_UI: Record<StaffRequestStatus, { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Chờ duyệt', bg: '#FEF3C7', fg: '#92400E' },
  APPROVED: { label: 'Đã duyệt', bg: '#D1FAE5', fg: '#065F46' },
  REJECTED: { label: 'Đã từ chối', bg: '#F1F5F9', fg: '#64748B' },
};

/** Admin: approve / reject teacher & staff sign-ups. */
export default function StaffRequestsScreen({ navigation }: RootStackScreenProps<'StaffRequests'>) {
  const { status: authStatus, isStaff, isAdmin, demo } = useStaffStore();
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');
  const [items, setItems] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<StaffRequest | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
    else if (authStatus === 'signedIn' && !isAdmin) navigation.replace('StaffVideos');
  }, [authStatus, isStaff, isAdmin, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listStaffRequests(tab === 'PENDING' ? 'PENDING' : null));
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const decide = async (r: StaffRequest, approve: boolean, note?: string) => {
    setBusyId(r.userId);
    setError(null);
    try {
      await decideStaffRequest(r.userId, approve, note);
      await load();
      return null;
    } catch (e) {
      setError(msg(e));
      return msg(e);
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (r: StaffRequest) => {
    const warn = r.emailConfirmed ? '' : '\n\nLưu ý: người này chưa bấm link xác nhận email nên chưa đăng nhập được cho tới khi xác nhận.';
    if (await confirmAsync('Duyệt tài khoản?', `${r.displayName} (${r.email}) sẽ được quyền giáo viên / nhân viên: đăng video, xem lịch học thử.${warn}`, 'Duyệt')) {
      decide(r, true);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Duyệt tài khoản" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'))} />
      <View className="flex-row gap-2 px-4 pb-3" accessibilityRole="tablist">
        {(['PENDING', 'ALL'] as const).map((t) => {
          const active = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={`rounded-full px-4 py-2 ${active ? 'bg-ink' : 'border border-slate-200 bg-white'}`}
            >
              <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{t === 'PENDING' ? 'Chờ duyệt' : 'Tất cả'}</Text>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        data={items}
        keyExtractor={(r) => r.userId}
        contentContainerClassName="gap-3 px-4 pb-10"
        refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
        ListHeaderComponent={
          <View className="gap-2">
            {(demo || !hasSupabase) && (
              <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: kết nối Supabase để duyệt yêu cầu thật.</Text>
            )}
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          </View>
        }
        renderItem={({ item: r }) => {
          const st = STATUS_UI[r.status];
          return (
            <View className="gap-2.5 rounded-3xl bg-white p-4" testID="request-row">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-ink">{r.displayName}</Text>
                  <Text className="text-xs text-ink-muted">{r.email}</Text>
                  <Text className="text-[11px] text-ink-subtle">Gửi lúc {at(r.createdAt)}</Text>
                </View>
                <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: st.bg }}>
                  <Text className="text-[11px] font-bold" style={{ color: st.fg }}>{st.label}</Text>
                </View>
              </View>
              {!!r.note && <Text className="rounded-2xl bg-slate-50 p-3 text-[13px] leading-5 text-ink">“{r.note}”</Text>}
              {!!r.phone && (
                <Pressable onPress={() => Linking.openURL(`tel:${r.phone}`).catch(() => {})} accessibilityRole="button" className="flex-row items-center gap-1.5 self-start">
                  <Phone size={14} color={COLORS.brand} />
                  <Text className="text-[13px] font-semibold text-brand-600">{formatPhone(r.phone)} — gọi xác minh</Text>
                </Pressable>
              )}
              {!r.emailConfirmed && (
                <View className="flex-row items-center gap-1.5">
                  <CircleAlert size={14} color="#B45309" />
                  <Text className="flex-1 text-xs text-amber-800">Chưa xác nhận email</Text>
                </View>
              )}
              {r.status === 'PENDING' &&
                (busyId === r.userId ? (
                  <ActivityIndicator color={COLORS.brand} />
                ) : (
                  <View className="flex-row gap-2.5">
                    <Button className="flex-1" title="Từ chối" variant="outline" size="sm" onPress={() => setRejecting(r)} />
                    <Button className="flex-[2]" title="Duyệt" size="sm" onPress={() => approve(r)} />
                  </View>
                ))}
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator className="mt-10" color={COLORS.brand} />
          ) : !error ? (
            <Text className="mt-10 px-8 text-center text-ink-muted">{tab === 'PENDING' ? 'Không có yêu cầu nào chờ duyệt. 👏' : 'Chưa có yêu cầu đăng ký nào.'}</Text>
          ) : null
        }
      />
      <RejectModal
        request={rejecting}
        onClose={() => setRejecting(null)}
        onSubmit={async (note) => {
          const err = await decide(rejecting!, false, note);
          if (!err) setRejecting(null);
        }}
      />
    </View>
  );
}

function RejectModal({ request, onClose, onSubmit }: { request: StaffRequest | null; onClose: () => void; onSubmit: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNote(''), [request?.userId]);
  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 items-center justify-end bg-black/40">
        <Pressable className="w-full flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {request && (
          <View className="w-full max-w-[560px] gap-3 rounded-t-3xl bg-white p-5">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">Từ chối yêu cầu?</Text>
            <Text className="text-[13px] leading-5 text-ink-muted">{request.displayName} ({request.email}) sẽ không được cấp quyền. Lý do chỉ quản trị viên xem được.</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={300}
              placeholder="Lý do (không bắt buộc), VD: không phải nhân viên trung tâm"
              placeholderTextColor={COLORS.subtle}
              accessibilityLabel="Lý do từ chối"
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-ink"
            />
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Hủy" variant="outline" onPress={onClose} disabled={busy} />
              <Button
                className="flex-[2]"
                title="Từ chối"
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  await onSubmit(note.trim());
                  setBusy(false);
                }}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
