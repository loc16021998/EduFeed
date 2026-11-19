import { Check, Minus, Plus, Trash2, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';

import { Button, HeaderIconButton, ScreenHeader, Select } from '@/components';
import { formatPhoneInput } from '@/components/ux';
import SearchField from '@/components/SearchField';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import { ApiError } from '@/services/apiClient';
import {
  adminAdjustSessions,
  adminCreateParent,
  adminDecideRequest,
  adminListParents,
  adminListRequests,
  adminSetParentActive,
  newParentProblem,
  type AdminParentRow,
  type AdminRequestRow,
  type NewChildInput,
  type ParentStatusFilter,
  type Relationship,
  type ScheduleSlot,
} from '@/services/parentPortal';
import { adminListReferrals, fetchProgram, programProblem, updateProgram, type AdminReferralRow, type ReferralProgram } from '@/services/referrals';
import { useStaffStore } from '@/store';
import type { CampusLocation, CourseCategory } from '@/types';
import { CAMPUS_LABELS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';

import { formatVnd } from '../../../supabase/functions/_shared/payments';
import { confirmAsync } from '@/utils/platform';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const STATUS_UI: Record<Exclude<ParentStatusFilter, 'ALL'>, { label: string; cls: string }> = {
  ACTIVE: { label: 'Đang học', cls: 'bg-emerald-50 text-emerald-700' },
  EXPIRING: { label: 'Sắp hết buổi', cls: 'bg-red-50 text-red-700' },
  GUEST: { label: 'Khách', cls: 'bg-slate-100 text-slate-600' },
  LOCKED: { label: 'Đã khóa', cls: 'bg-slate-800 text-white' },
};
const STATUS_FILTERS: { id: ParentStatusFilter; label: string }[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'ACTIVE', label: 'Đang học' },
  { id: 'EXPIRING', label: 'Sắp hết buổi' },
  { id: 'GUEST', label: 'Khách' },
  { id: 'LOCKED', label: 'Đã khóa' },
];
const CAMPUSES = Object.keys(CAMPUS_LABELS) as CampusLocation[];
const COURSES = (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).filter((c) => c !== 'ALL') as CourseCategory[];
const DAYS: { d: number; label: string }[] = [2, 3, 4, 5, 6, 7, 8].map((d) => ({ d, label: d === 8 ? 'CN' : `T${d}` }));
const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** Admin: parent accounts, linked students, course sessions and leave / make-up requests. */
export default function AccountManagementScreen({ navigation }: RootStackScreenProps<'AccountManagement'>) {
  const { status: authStatus, isStaff, isAdmin, demo } = useStaffStore();
  const [tab, setTab] = useState<'accounts' | 'requests' | 'referral'>('accounts');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [campus, setCampus] = useState<CampusLocation | null>(null);
  const [statusFilter, setStatusFilter] = useState<ParentStatusFilter>('ALL');
  const [rows, setRows] = useState<AdminParentRow[]>([]);
  const [requests, setRequests] = useState<AdminRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ phone: string; fullName: string } | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('AdminLogin');
    else if (authStatus === 'signedIn' && !isAdmin) navigation.replace('StaffVideos');
  }, [authStatus, isStaff, isAdmin, navigation]);

  // Search as you type (debounced).
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([adminListParents(query, campus, statusFilter), adminListRequests('PENDING')]);
      setRows(p);
      setRequests(r);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [query, campus, statusFilter]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const run = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusyId(null);
    }
  };

  const onToggleActive = async (p: AdminParentRow, next: boolean) => {
    if (!next && !(await confirmAsync('Khóa tài khoản?', `${p.fullName} sẽ không xem được sổ liên lạc cho tới khi mở lại.`, 'Khóa'))) return;
    run(p.id, () => adminSetParentActive(p.id, next), next ? `Đã mở lại tài khoản ${p.fullName}.` : `Đã khóa tài khoản ${p.fullName}.`);
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Phụ huynh & học viên"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'))}
        right={
          <HeaderIconButton label="Tạo tài khoản phụ huynh" onPress={() => setCreating({ phone: '', fullName: '' })}>
            <UserPlus size={21} color={COLORS.ink} />
          </HeaderIconButton>
        }
      />
      <View className="gap-2.5 px-4 pb-2">
        <View className="flex-row rounded-2xl bg-slate-100 p-1">
          {(
            [
              ['accounts', 'Tài khoản'],
              ['requests', `Nghỉ / học bù${requests.length ? ` (${requests.length})` : ''}`],
              ['referral', 'Giới thiệu'],
            ] as const
          ).map(([id, label]) => (
            <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" aria-selected={tab === id} accessibilityState={{ selected: tab === id }} className={`flex-1 items-center rounded-xl py-2.5 ${tab === id ? 'bg-white' : ''}`}>
              <Text className={`text-[14px] font-bold ${tab === id ? 'text-brand-700' : 'text-ink-muted'}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {tab === 'accounts' && (
          <>
            <SearchField value={search} onChangeText={setSearch} placeholder="Tìm tên, số điện thoại, tên bé…" accessibilityLabel="Tìm phụ huynh" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              <Pill label="Mọi cơ sở" on={campus === null} onPress={() => setCampus(null)} />
              {CAMPUSES.map((c) => (
                <Pill key={c} label={CAMPUS_LABELS[c]} on={campus === c} onPress={() => setCampus(c)} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {STATUS_FILTERS.map((f) => (
                <Pill key={f.id} label={f.label} on={statusFilter === f.id} onPress={() => setStatusFilter(f.id)} />
              ))}
            </ScrollView>
          </>
        )}
      </View>

      {tab === 'referral' ? (
        <ReferralAdminPanel demo={demo || !hasSupabase} />
      ) : tab === 'accounts' ? (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerClassName="gap-3 px-4 pb-10"
          refreshControl={<RefreshControl refreshing={loading && rows.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
          ListHeaderComponent={<Banners demo={demo || !hasSupabase} notice={notice} error={error} />}
          renderItem={({ item }) => (
            <ParentCard
              p={item}
              busy={busyId === item.id}
              onToggle={(v) => onToggleActive(item, v)}
              onAdjust={(enrollmentId, delta) => run(item.id, () => adminAdjustSessions(enrollmentId, delta))}
              onAddChild={() => setCreating({ phone: item.phone, fullName: item.fullName })}
            />
          )}
          ListEmptyComponent={loading ? <ActivityIndicator className="mt-10" color={COLORS.brand} /> : <Text className="mt-10 px-8 text-center text-ink-muted">Không có tài khoản phù hợp.</Text>}
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerClassName="gap-3 px-4 pb-10"
          refreshControl={<RefreshControl refreshing={loading && requests.length > 0} onRefresh={load} tintColor={COLORS.brand} />}
          ListHeaderComponent={<Banners demo={demo || !hasSupabase} notice={notice} error={error} />}
          renderItem={({ item }) => (
            <RequestCard
              r={item}
              busy={busyId === item.id}
              onDecide={(approve) => run(item.id, () => adminDecideRequest(item.id, approve), approve ? `Đã duyệt yêu cầu của ${item.studentName}.` : `Đã từ chối yêu cầu của ${item.studentName}.`)}
            />
          )}
          ListEmptyComponent={loading ? <ActivityIndicator className="mt-10" color={COLORS.brand} /> : <Text className="mt-10 px-8 text-center text-ink-muted">Không có yêu cầu nào đang chờ duyệt. 👏</Text>}
        />
      )}

      <CreateParentModal
        initial={creating}
        onClose={() => setCreating(null)}
        onDone={async (text) => {
          setCreating(null);
          setNotice(text);
          await load();
        }}
      />
    </View>
  );
}

function Banners({ demo, notice, error }: { demo: boolean; notice: string | null; error: string | null }) {
  return (
    <View className="gap-2 pb-1">
      {demo && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: kết nối Supabase để quản lý tài khoản thật.</Text>}
      {!!notice && <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs leading-[18px] text-emerald-800">{notice}</Text>}
      {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
    </View>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" aria-checked={on} accessibilityState={{ checked: on }} className={`rounded-full border px-3.5 py-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-200 bg-white'}`}>
      <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-ink-muted'}`}>{label}</Text>
    </Pressable>
  );
}

function ParentCard({ p, busy, onToggle, onAdjust, onAddChild }: { p: AdminParentRow; busy: boolean; onToggle: (v: boolean) => void; onAdjust: (enrollmentId: string, delta: number) => void; onAddChild: () => void }) {
  const st = STATUS_UI[p.status];
  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="parent-card">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-bold text-ink">{p.fullName}</Text>
          <Text className="text-[13px] text-ink-muted">
            {formatPhone(p.phone)}
            {p.selfRegistered ? ' · tự đăng ký' : ''}
            {p.lastLoginAt ? '' : ' · chưa đăng nhập'}
          </Text>
        </View>
        <Text className={`overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`} testID="parent-status">
          {st.label}
        </Text>
      </View>

      {p.students.length === 0 && <Text className="text-[13px] text-ink-muted">Chưa liên kết học viên.</Text>}
      {p.students.map((s) => (
        <View key={s.id} className="gap-1.5 rounded-2xl bg-slate-50 p-3">
          <Text className="text-[14px] font-bold text-ink">
            {s.fullName}
            <Text className="text-xs font-normal text-ink-muted">
              {' '}
              · {CAMPUS_LABELS[s.campus]}
              {s.birthYear ? ` · ${s.birthYear}` : ''}
            </Text>
          </Text>
          {s.enrollments.length === 0 && <Text className="text-xs text-ink-subtle">Chưa có khóa đang học</Text>}
          {s.enrollments.map((e) => {
            const low = e.sessionsRemaining !== null && e.sessionsRemaining < 3;
            return (
              <View key={e.id} className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-[13px] text-ink">
                  {CATEGORY_LABELS[e.courseCode]}
                  {e.level > 1 ? ` · cấp ${e.level}` : ''}
                  {e.schedule.length ? ` · ${e.schedule.map((x) => (x.d === 8 ? 'CN' : `T${x.d}`) + ' ' + x.start).join(', ')}` : ''}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Pressable onPress={() => onAdjust(e.id, -1)} disabled={busy || (e.sessionsRemaining ?? 0) <= 0} accessibilityRole="button" accessibilityLabel={`Bớt 1 buổi ${s.fullName}`} className="h-8 w-8 items-center justify-center rounded-full bg-white active:bg-slate-200">
                    <Minus size={15} color={COLORS.ink} />
                  </Pressable>
                  <Text className={`min-w-[52px] text-center text-[13px] font-extrabold ${low ? 'text-red-600' : 'text-ink'}`} testID="admin-sessions">
                    {e.sessionsRemaining ?? '—'}
                    {e.sessionsTotal ? `/${e.sessionsTotal}` : ''}
                  </Text>
                  <Pressable onPress={() => onAdjust(e.id, 1)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Thêm 1 buổi ${s.fullName}`} className="h-8 w-8 items-center justify-center rounded-full bg-white active:bg-slate-200">
                    <Plus size={15} color={COLORS.ink} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <View className="flex-row items-center justify-between gap-2">
        <Button size="sm" title="Thêm học viên / khóa" variant="ghost" icon={<Plus size={14} color={COLORS.brand} />} onPress={onAddChild} />
        <View className="flex-row items-center gap-2">
          {busy && <ActivityIndicator size="small" color={COLORS.brand} />}
          <Text className="text-xs text-ink-muted">Cho đăng nhập</Text>
          <Switch value={p.isActive} onValueChange={onToggle} disabled={busy} accessibilityLabel={`Cho phép ${p.fullName} đăng nhập`} trackColor={{ true: COLORS.brand, false: '#CBD5E1' }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />
        </View>
      </View>
    </View>
  );
}

function RequestCard({ r, busy, onDecide }: { r: AdminRequestRow; busy: boolean; onDecide: (approve: boolean) => void }) {
  return (
    <View className="gap-2 rounded-3xl bg-white p-4" testID="request-card">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-ink">
            {r.type === 'LEAVE' ? 'Báo nghỉ' : 'Xin học bù'} · {dmy(r.requestedDate)}
          </Text>
          <Text className="text-[13px] text-ink-muted">
            {r.studentName} · {CAMPUS_LABELS[r.campus]}
            {r.parentName ? ` · ${r.parentName}` : ''}
            {r.parentPhone ? ` (${formatPhone(r.parentPhone)})` : ''}
          </Text>
        </View>
      </View>
      <Text className="rounded-2xl bg-slate-50 p-3 text-[13px] leading-5 text-ink">“{r.reason}”</Text>
      <View className="flex-row gap-2.5">
        <Button className="flex-1" size="sm" title="Từ chối" variant="outline" disabled={busy} onPress={() => onDecide(false)} />
        <Button className="flex-1" size="sm" title="Duyệt" loading={busy} icon={<Check size={14} color="#fff" />} onPress={() => onDecide(true)} />
      </View>
    </View>
  );
}

// ─── Create & link ──────────────────────────────────────────────────────────

interface ChildDraft {
  key: string;
  fullName: string;
  birthYear: string;
  campus: CampusLocation | null;
  course: CourseCategory | null;
  level: number;
  sessions: string;
  days: number[];
  start: string;
  end: string;
}
const emptyChild = (): ChildDraft => ({ key: Math.random().toString(36).slice(2), fullName: '', birthYear: '', campus: null, course: null, level: 1, sessions: '', days: [], start: '17:30', end: '19:00' });
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function CreateParentModal({ initial, onClose, onDone }: { initial: { phone: string; fullName: string } | null; onClose: () => void; onDone: (notice: string) => void }) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('MOM');
  const [children, setChildren] = useState<ChildDraft[]>([emptyChild()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = !!initial?.phone;

  useEffect(() => {
    if (!initial) return;
    setPhone(initial.phone);
    setFullName(initial.fullName);
    setRelationship('MOM');
    setChildren([emptyChild()]);
    setError(null);
  }, [initial]);

  const patch = (key: string, p: Partial<ChildDraft>) => {
    setChildren((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
    setError(null);
  };

  const submit = async () => {
    const kids: NewChildInput[] = [];
    for (const c of children) {
      if (!c.fullName.trim() && !c.course) continue; // empty block
      if (!c.campus) return setError(`Chọn cơ sở cho ${c.fullName || 'học viên'}`);
      let schedule: ScheduleSlot[] = [];
      if (c.course && c.days.length) {
        if (!TIME_RE.test(c.start) || !TIME_RE.test(c.end) || c.end <= c.start) return setError('Giờ học dạng HH:MM, giờ kết thúc sau giờ bắt đầu');
        schedule = c.days.map((d) => ({ d, start: c.start, end: c.end }));
      }
      kids.push({
        fullName: c.fullName,
        birthYear: c.birthYear ? Number(c.birthYear) : null,
        campus: c.campus,
        courses: c.course ? [{ courseCode: c.course, level: c.level, sessionsTotal: c.sessions ? Number(c.sessions) : null, schedule }] : [],
      });
    }
    const input = { phone, fullName, relationship, children: kids };
    const p = newParentProblem(input);
    if (p) return setError(p.message);
    if (existing && kids.length === 0) return setError('Nhập ít nhất 1 học viên');
    setBusy(true);
    setError(null);
    try {
      const r = await adminCreateParent(input);
      onDone(
        r.created
          ? `Đã tạo tài khoản ${fullName.trim()} (${formatPhone(phone)})${kids.length ? ` và liên kết ${kids.length} học viên` : ''}. Phụ huynh đăng nhập bằng số này + mã OTP Zalo.`
          : `Đã thêm ${kids.length} học viên vào tài khoản ${formatPhone(phone)}.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!initial} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <ScrollView className="max-h-[92%] rounded-t-[28px] bg-white" contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled" testID="create-parent-modal">
          <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
            {existing ? `Thêm học viên · ${initial!.fullName}` : 'Tạo tài khoản phụ huynh'}
          </Text>
          {!existing && (
            <>
              <FormField label="Số điện thoại (đăng nhập bằng OTP Zalo)" value={phone} onChangeText={(t) => { setPhone(formatPhoneInput(t)); setError(null); }} placeholder="VD: 0912 345 678" keyboardType="phone-pad" maxLength={16} />
              <FormField label="Tên phụ huynh" value={fullName} onChangeText={(t) => { setFullName(t); setError(null); }} placeholder="VD: Nguyễn Thu Trang" maxLength={60} />
              <View className="flex-row gap-2">
                {(
                  [
                    ['MOM', 'Mẹ'],
                    ['DAD', 'Bố'],
                    ['OTHER', 'Người thân'],
                  ] as const
                ).map(([id, label]) => (
                  <Pill key={id} label={label} on={relationship === id} onPress={() => setRelationship(id)} />
                ))}
              </View>
            </>
          )}

          {children.map((c, i) => (
            <View key={c.key} className="gap-2.5 rounded-2xl border border-slate-200 p-3" testID="child-block">
              <View className="flex-row items-center justify-between">
                <Text className="text-[14px] font-bold text-ink">Học viên {i + 1}</Text>
                {children.length > 1 && (
                  <Pressable onPress={() => setChildren((cs) => cs.filter((x) => x.key !== c.key))} accessibilityLabel={`Bỏ học viên ${i + 1}`} hitSlop={8}>
                    <Trash2 size={16} color="#DC2626" />
                  </Pressable>
                )}
              </View>
              <FormField label="Tên học viên" value={c.fullName} onChangeText={(t) => patch(c.key, { fullName: t })} placeholder="VD: Trần Gia Bảo" maxLength={60} />
              <FormField label="Năm sinh" value={c.birthYear} onChangeText={(t) => patch(c.key, { birthYear: t.replace(/\D/g, '').slice(0, 4) })} placeholder="VD: 2019" keyboardType="number-pad" maxLength={4} />
              <View className="flex-row flex-wrap gap-2">
                {CAMPUSES.map((cp) => (
                  <Pill key={cp} label={CAMPUS_LABELS[cp]} on={c.campus === cp} onPress={() => patch(c.key, { campus: cp })} />
                ))}
              </View>
              <Select
                label="Khóa học (không bắt buộc)"
                value={c.course}
                options={COURSES.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))}
                onChange={(v) => patch(c.key, { course: v })}
                placeholder="Chưa xếp khóa"
              />
              {c.course && (
                <>
                  <View className="flex-row gap-2.5">
                    <View className="flex-1">
                      <FormField label="Số buổi đã đăng ký" value={c.sessions} onChangeText={(t) => patch(c.key, { sessions: t.replace(/\D/g, '').slice(0, 3) })} placeholder="VD: 24" keyboardType="number-pad" maxLength={3} />
                    </View>
                    <View className="flex-1 gap-1.5">
                      <Text className="text-[13px] font-semibold text-ink-muted">Cấp độ</Text>
                      <View className="flex-row gap-1.5">
                        {[1, 2, 3].map((l) => (
                          <Pill key={l} label={String(l)} on={c.level === l} onPress={() => patch(c.key, { level: l })} />
                        ))}
                      </View>
                    </View>
                  </View>
                  <Text className="text-[13px] font-semibold text-ink-muted">Lịch học cố định</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {DAYS.map((d) => (
                      <Pill key={d.d} label={d.label} on={c.days.includes(d.d)} onPress={() => patch(c.key, { days: c.days.includes(d.d) ? c.days.filter((x) => x !== d.d) : [...c.days, d.d].sort() })} />
                    ))}
                  </View>
                  {c.days.length > 0 && (
                    <View className="flex-row gap-2.5">
                      <View className="flex-1">
                        <FormField label="Từ" value={c.start} onChangeText={(t) => patch(c.key, { start: t.slice(0, 5) })} placeholder="17:30" maxLength={5} />
                      </View>
                      <View className="flex-1">
                        <FormField label="Đến" value={c.end} onChangeText={(t) => patch(c.key, { end: t.slice(0, 5) })} placeholder="19:00" maxLength={5} />
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
          ))}
          {children.length < 6 && <Button title="Thêm học viên" variant="ghost" size="sm" icon={<Plus size={14} color={COLORS.brand} />} onPress={() => setChildren((cs) => [...cs, emptyChild()])} />}

          {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
          <View className="flex-row gap-2.5">
            <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
            <Button className="flex-[2]" title={existing ? 'Thêm & liên kết' : 'Tạo & liên kết'} variant="accent" loading={busy} onPress={submit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Referral program ───────────────────────────────────────────────────────

const REF_STATUS: Record<AdminReferralRow['status'], { label: string; cls: string }> = {
  PENDING_TRIAL: { label: 'Đăng ký học thử', cls: 'bg-sky-50 text-sky-700' },
  PENDING_PAYMENT: { label: 'Chờ đóng học phí', cls: 'bg-amber-50 text-amber-800' },
  REWARDED: { label: 'Đã thưởng', cls: 'bg-emerald-50 text-emerald-700' },
  VOID: { label: 'Đã hủy', cls: 'bg-slate-100 text-slate-500' },
};
const vnd = (n: number) => (n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '0');
const digitsOnly = (t: string) => t.replace(/\D/g, '').slice(0, 8);

function ReferralAdminPanel({ demo }: { demo: boolean }) {
  const [program, setProgram] = useState<ReferralProgram | null>(null);
  const [form, setForm] = useState({ active: true, reward: '', discount: '', days: '' });
  const [rows, setRows] = useState<AdminReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, r] = await Promise.all([fetchProgram(), adminListReferrals()]);
      setProgram(p);
      setForm({ active: p.active, reward: String(p.referrerRewardVnd), discount: String(p.refereeDiscountVnd), days: String(p.voucherValidDays) });
      setRows(r);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const next: ReferralProgram = { active: form.active, referrerRewardVnd: Number(form.reward || 0), refereeDiscountVnd: Number(form.discount || 0), voucherValidDays: Number(form.days || 0) };
    const problem = programProblem(next);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await updateProgram(next);
      setProgram(next);
      setNotice(`Đã lưu. Áp dụng cho các lượt giới thiệu từ bây giờ; lượt đã đăng ký giữ nguyên mức đã hứa.`);
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      contentContainerClassName="gap-3 px-4 pb-10"
      refreshControl={<RefreshControl refreshing={loading && !!program} onRefresh={load} tintColor={COLORS.brand} />}
      ListHeaderComponent={
        <View className="gap-3">
          <Banners demo={demo} notice={notice} error={error} />
          <View className="gap-3 rounded-3xl bg-white p-4" testID="referral-program">
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] font-bold text-ink">Chương trình giới thiệu</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-ink-muted">{form.active ? 'Đang chạy' : 'Tạm dừng'}</Text>
                <Switch value={form.active} onValueChange={(v) => setForm((f) => ({ ...f, active: v }))} accessibilityLabel="Bật chương trình giới thiệu" trackColor={{ true: COLORS.brand, false: '#CBD5E1' }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />
              </View>
            </View>
            <FormField label="Voucher cho người giới thiệu (đồng)" value={vnd(Number(form.reward || 0))} onChangeText={(t) => setForm((f) => ({ ...f, reward: digitsOnly(t) }))} keyboardType="number-pad" />
            <FormField label="Ưu đãi cho học viên mới (đồng)" value={vnd(Number(form.discount || 0))} onChangeText={(t) => setForm((f) => ({ ...f, discount: digitsOnly(t) }))} keyboardType="number-pad" />
            <FormField label="Hạn dùng voucher (ngày)" value={form.days} onChangeText={(t) => setForm((f) => ({ ...f, days: t.replace(/\D/g, '').slice(0, 3) }))} keyboardType="number-pad" />
            <Text className="text-[11px] leading-4 text-ink-subtle">
              Voucher được tạo tự động khi gia đình được giới thiệu đóng học phí lần đầu (gia đình mới, không tự giới thiệu, mỗi gia đình một lần) và báo cho người giới thiệu qua Zalo.
            </Text>
            <Button title="Lưu chương trình" loading={saving} onPress={save} />
          </View>
          <Text className="px-1 text-[15px] font-bold text-ink">Lượt giới thiệu</Text>
        </View>
      }
      renderItem={({ item: r }) => (
        <View className="gap-1.5 rounded-3xl bg-white p-4" testID="referral-row">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-[14px] font-bold text-ink">
              {r.referrerName} <Text className="font-normal text-ink-muted">giới thiệu</Text> {r.refereeName}
            </Text>
            <Text className={`overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-bold ${REF_STATUS[r.status].cls}`}>{REF_STATUS[r.status].label}</Text>
          </View>
          <Text className="text-xs text-ink-muted">
            {formatPhone(r.referrerPhone)} → {formatPhone(r.refereePhone)} · voucher hứa {formatVnd(r.promisedRewardVnd)}
          </Text>
          {!!r.voucherCode && (
            <Text className="text-xs text-emerald-700">
              Voucher {r.voucherCode} · {r.voucherStatus === 'USED' ? 'đã dùng' : 'chưa dùng'} · {r.notifiedAt ? 'đã báo Zalo' : 'chưa báo Zalo'}
            </Text>
          )}
          {!!r.voidReason && <Text className="text-xs text-ink-subtle">{r.voidReason}</Text>}
        </View>
      )}
      ListEmptyComponent={loading ? <ActivityIndicator className="mt-6" color={COLORS.brand} /> : <Text className="mt-6 px-8 text-center text-ink-muted">Chưa có lượt giới thiệu nào.</Text>}
    />
  );
}
