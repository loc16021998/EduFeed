import { LIST_PERF } from '@/utils/listPerf';
import { KeyRound, ShieldCheck, UserMinus, UserPlus, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, Text, View } from 'react-native';

import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { listStaff, ROLE_LABELS, setStaffRole, type StaffAccount, type StaffRole } from '@/services/staffAccounts';
import { setStaffProfile, staffDirectory, type StaffMember } from '@/services/staffOps';
import { useStaffStore } from '@/store';
import type { CampusLocation } from '@/types';
import { CAMPUS_LABELS } from '@/utils/constants';
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
  const [profiles, setProfiles] = useState<Record<string, StaffMember>>({});
  const [roleFor, setRoleFor] = useState<StaffAccount | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('AdminLogin');
    else if (authStatus === 'signedIn' && !isAdmin) navigation.replace('StaffVideos');
  }, [authStatus, isStaff, isAdmin, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await listStaff());
      // Roles (Giáo viên / Tư vấn / Quản lý + cơ sở); older databases without the RBAC upgrade just skip this.
      staffDirectory().then((d) => setProfiles(Object.fromEntries(d.map((x) => [x.email.toLowerCase(), x]))), () => setProfiles({}));
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
        {...LIST_PERF}
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
                  {!admin && profiles[item.email.toLowerCase()] && (
                    <Pressable onPress={() => setRoleFor(item)} accessibilityRole="button" accessibilityLabel="Phân vai trò và cơ sở" className="-ml-1 mt-1 min-h-11 flex-row items-center self-start rounded-full bg-brand-50 px-3 py-1.5 active:bg-brand-100">
                    <Text className="text-xs font-semibold text-brand-700" testID="staff-kind">
                      {KIND_LABEL[profiles[item.email.toLowerCase()].kind]}
                      {profiles[item.email.toLowerCase()].campus ? ` · ${CAMPUS_LABELS[profiles[item.email.toLowerCase()].campus!]}` : ' · mọi cơ sở'}
                      {!profiles[item.email.toLowerCase()].hasProfile ? ' (chưa phân vai trò)' : ''}
                      {'  ✎'}
                    </Text>
                    </Pressable>
                  )}
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
                      <Action icon={<KeyRound size={14} color={COLORS.ink} />} label="Mật khẩu" a11y="Đặt lại mật khẩu" onPress={() => setResetting(item)} />
                      <Action
                        icon={admin ? <UserRound size={14} color={COLORS.ink} /> : <ShieldCheck size={14} color={COLORS.ink} />}
                        label={admin ? 'Về nhân viên' : 'Lên quản trị'}
                        a11y={admin ? 'Chuyển thành nhân viên' : 'Cấp quyền quản trị'}
                        onPress={() => changeRole(item, admin ? 'staff' : 'admin')}
                      />
                      <View className="flex-1" />
                      <Action icon={<UserMinus size={14} color="#B91C1C" />} label="Thu hồi" a11y="Thu hồi quyền" danger onPress={() => changeRole(item, 'none')} />
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
      <RoleModal
        account={roleFor}
        current={roleFor ? profiles[roleFor.email.toLowerCase()] : undefined}
        onClose={() => setRoleFor(null)}
        onSaved={() => {
          setRoleFor(null);
          load();
        }}
      />
    </View>
  );
}

function Action({ icon, label, a11y, onPress, danger }: { icon: ReactNode; label: string; a11y?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      className={`h-11 flex-row items-center gap-1.5 rounded-xl px-3 active:bg-slate-50 ${danger ? '' : 'border border-slate-200'}`}
    >
      {icon}
      <Text className={`text-[13px] font-semibold ${danger ? 'text-red-700' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

const KIND_LABEL: Record<StaffMember['kind'], string> = { ADMIN: 'Quản trị', MANAGER: 'Quản lý', TEACHER: 'Giáo viên', ADVISOR: 'Tư vấn' };
const KIND_HELP: Record<'TEACHER' | 'ADVISOR' | 'MANAGER', string> = {
  TEACHER: 'Chỉ thấy học viên trong lớp mình dạy và lịch học thử của cơ sở.',
  ADVISOR: 'Thấy khách hàng được giao + của cơ sở; nhận việc gọi phụ huynh tự động.',
  MANAGER: 'Thấy toàn bộ trung tâm (như trước khi phân quyền).',
};

function RoleModal({ account, current, onClose, onSaved }: { account: StaffAccount | null; current?: StaffMember; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'TEACHER' | 'ADVISOR' | 'MANAGER'>('TEACHER');
  const [campus, setCampus] = useState<CampusLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!account) return;
    setKind(current && current.kind !== 'ADMIN' && current.hasProfile ? current.kind : 'TEACHER');
    setCampus(current?.campus ?? null);
    setError(null);
  }, [account, current]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setStaffProfile(current?.id ?? account!.id, kind, campus, account!.displayName ?? undefined);
      onSaved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} className={`h-10 justify-center rounded-full border px-3.5 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <Text className={`text-[14px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={!!account} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {account && (
          <View className="gap-3 rounded-t-[28px] bg-white p-5" testID="role-modal">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Vai trò · {account.displayName ?? account.email}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(['TEACHER', 'ADVISOR', 'MANAGER'] as const).map((k) => (
                <Chip key={k} on={kind === k} label={KIND_LABEL[k]} onPress={() => setKind(k)} />
              ))}
            </View>
            <Text className="text-xs leading-[18px] text-ink-muted">{KIND_HELP[kind]}</Text>
            {kind !== 'MANAGER' && (
              <>
                <Text className="text-[13px] font-semibold text-ink-muted">Cơ sở phụ trách</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Chip on={campus === null} label="Mọi cơ sở" onPress={() => setCampus(null)} />
                  {(Object.keys(CAMPUS_LABELS) as CampusLocation[]).map((c) => (
                    <Chip key={c} on={campus === c} label={CAMPUS_LABELS[c]} onPress={() => setCampus(c)} />
                  ))}
                </View>
              </>
            )}
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
              <Button className="flex-[2]" title="Lưu vai trò" loading={busy} onPress={save} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
