import { KeyRound, ShieldCheck, UserMinus, UserPlus, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { listStaff, ROLE_LABELS, setStaffRole, type StaffAccount, type StaffRole } from '@/services/staffAccounts';
import { useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { confirmAsync } from '@/utils/platform';

import { CreateStaffModal, ResetPasswordModal } from './components/AccountModals';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const pad = (n: number) => String(n).padStart(2, '0');
const when = (iso: string | null) => {
  if (!iso) return 'Chưa đăng nhập lần nào';
  const d = new Date(iso);
  return `Đăng nhập gần nhất ${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Admin: create staff / admin accounts, change roles, reset passwords, revoke access. */
export default function StaffAccountsScreen({ navigation }: RootStackScreenProps<'StaffAccounts'>) {
  const { status: authStatus, isStaff, isAdmin, email: myEmail, demo } = useStaffStore();
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<StaffAccount | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('AdminLogin');
    else if (authStatus === 'signedIn' && !isAdmin) navigation.replace('StaffVideos');
  }, [authStatus, isStaff, isAdmin, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await listStaff());
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const changeRole = async (a: StaffAccount, role: StaffRole | 'none') => {
    const name = a.displayName ?? a.email;
    const ok =
      role === 'none'
        ? await confirmAsync('Thu hồi quyền truy cập?', `${name} sẽ không vào được khu quản lý nữa (có hiệu lực chậm nhất sau 1 giờ, hoặc ngay khi họ đăng nhập lại).`, 'Thu hồi')
        : await confirmAsync(
            role === 'admin' ? 'Cấp quyền quản trị?' : 'Chuyển thành giáo viên / nhân viên?',
            role === 'admin'
              ? `${name} sẽ tạo / khóa được tài khoản khác và xem tổng quan kinh doanh.`
              : `${name} sẽ không còn quản lý tài khoản được nữa.`,
            'Đồng ý',
          );
    if (!ok) return;
    setBusyId(a.id);
    setError(null);
    try {
      await setStaffRole(a.id, role);
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusyId(null);
    }
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'));

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Tài khoản nhân viên" onBack={goBack} />
      <FlatList
        data={accounts}
        keyExtractor={(a) => a.id}
        contentContainerClassName="gap-3 px-4 pb-10"
        refreshControl={<RefreshControl refreshing={loading && accounts.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            {(demo || !hasSupabase) && (
              <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
                Dữ liệu mẫu: tài khoản tạo ở đây chỉ lưu tạm. Kết nối Supabase để tạo tài khoản thật.
              </Text>
            )}
            <Button title="Tạo tài khoản mới" size="lg" icon={<UserPlus size={20} color="#fff" />} onPress={() => setCreating(true)} />
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          </View>
        }
        renderItem={({ item }) => {
          const me = !!myEmail && item.email.toLowerCase() === myEmail.toLowerCase();
          const admin = item.role === 'admin';
          const Icon = admin ? ShieldCheck : UserRound;
          return (
            <View className="gap-3 rounded-3xl bg-white p-4" testID="account-row">
              <View className="flex-row items-start gap-3">
                <View className={`h-10 w-10 items-center justify-center rounded-full ${admin ? 'bg-brand-50' : 'bg-slate-100'}`}>
                  <Icon size={20} color={admin ? COLORS.brand : COLORS.muted} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                    {item.displayName ?? item.email}
                    {me ? <Text className="font-normal text-ink-muted"> (bạn)</Text> : null}
                  </Text>
                  {!!item.displayName && <Text className="text-xs text-ink-muted" numberOfLines={1}>{item.email}</Text>}
                  <Text className="text-[11px] text-ink-subtle">{when(item.lastSignInAt)}</Text>
                </View>
                <View className={`rounded-full px-2.5 py-1 ${admin ? 'bg-brand-50' : 'bg-slate-100'}`}>
                  <Text className={`text-[11px] font-bold ${admin ? 'text-brand-700' : 'text-ink-muted'}`}>{ROLE_LABELS[item.role]}</Text>
                </View>
              </View>
              {!me && (
                <View className="flex-row flex-wrap gap-2">
                  {busyId === item.id ? (
                    <ActivityIndicator color={COLORS.brand} />
                  ) : (
                    <>
                      <Action icon={<KeyRound size={14} color={COLORS.ink} />} label="Đặt lại mật khẩu" onPress={() => setResetting(item)} />
                      <Action
                        icon={admin ? <UserRound size={14} color={COLORS.ink} /> : <ShieldCheck size={14} color={COLORS.ink} />}
                        label={admin ? 'Chuyển thành nhân viên' : 'Cấp quyền quản trị'}
                        onPress={() => changeRole(item, admin ? 'staff' : 'admin')}
                      />
                      <Action icon={<UserMinus size={14} color="#B91C1C" />} label="Thu hồi quyền" danger onPress={() => changeRole(item, 'none')} />
                    </>
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? <ActivityIndicator className="mt-8" color={COLORS.brand} /> : !error ? <Text className="mt-8 text-center text-ink-muted">Chưa có tài khoản nào.</Text> : null
        }
      />

      <CreateStaffModal visible={creating} onClose={() => setCreating(false)} onCreated={() => load()} />
      <ResetPasswordModal account={resetting} onClose={() => setResetting(null)} />
    </View>
  );
}

function Action({ icon, label, onPress, danger }: { icon: ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-2 active:bg-slate-50 ${danger ? 'border-red-200' : 'border-slate-200'}`}
    >
      {icon}
      <Text className={`text-[13px] font-semibold ${danger ? 'text-red-700' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
