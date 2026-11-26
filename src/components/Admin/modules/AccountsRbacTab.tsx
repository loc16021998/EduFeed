import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import Button from '@/components/Button';
import SearchField from '@/components/SearchField';
import { DeletionRequestsSheet } from '@/components/Settings/AdminSheets';
import { SettingsSheet } from '@/components/Settings/SettingsSection';
import { StatusBanner } from '@/components/ux';
import { adminAdjustSessions, adminListParents, adminSetParentActive, type AdminParentRow } from '@/services/parentPortal';
import { createTask, staffDirectory, type StaffMember } from '@/services/staffOps';
import { useCommandCenterStore } from '@/store/useCommandCenterStore';
import { CAMPUS_LABELS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { haptics } from '@/utils/haptics';
import { confirmAsync } from '@/utils/platform';

import { Chip, Empty, ErrorRow, errMsg, LoadingRows, ModuleCard, RowAction, useModuleData, useWide } from './ui';

type Segment = 'PARENTS' | 'STAFF';
const KIND_LABEL = { ADMIN: 'Quản trị', MANAGER: 'Quản lý', TEACHER: 'Giáo viên', ADVISOR: 'Tư vấn viên' } as const;
const isoDay = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AccountsRbacTab({ onCreateParent, onOpenStaffAccounts }: { onCreateParent: () => void; onOpenStaffAccounts: () => void }) {
  const wide = useWide();
  const branch = useCommandCenterStore((s) => s.branch);
  const [segment, setSegment] = useState<Segment>('PARENTS');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [taskFor, setTaskFor] = useState<StaffMember | null>(null);
  const [deletionsOpen, setDeletionsOpen] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  const parents = useModuleData(() => (segment === 'PARENTS' ? adminListParents(query, branch === 'ALL' ? null : branch, 'ALL') : Promise.resolve([])), [segment, query, branch]);
  const staff = useModuleData(() => (segment === 'STAFF' ? staffDirectory() : Promise.resolve([])), [segment]);
  const q = query.trim().toLowerCase();
  const staffRows = (staff.data ?? []).filter(
    (s) => (branch === 'ALL' || !s.campus || s.campus === branch) && (!q || (s.displayName ?? '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q)),
  );

  const setActive = async (p: AdminParentRow, active: boolean) => {
    if (!active && !(await confirmAsync('Khoá tài khoản?', `${p.fullName} sẽ không đăng nhập được Sổ liên lạc cho đến khi mở lại.`, 'Khoá'))) return;
    parents.setData((d) => d && d.map((x) => (x.id === p.id ? { ...x, isActive: active, status: active ? 'ACTIVE' : 'LOCKED' } : x)));
    try {
      await adminSetParentActive(p.id, active);
      haptics.success();
    } catch (e) {
      parents.reload();
      setNotice({ ok: false, text: errMsg(e) });
    }
  };

  const adjust = async (enrollmentId: string, delta: number) => {
    try {
      const r = await adminAdjustSessions(enrollmentId, delta, delta > 0 ? 'Cộng buổi (Trung tâm điều hành)' : 'Trừ buổi (Trung tâm điều hành)');
      haptics.light();
      parents.setData(
        (d) =>
          d &&
          d.map((p) => ({
            ...p,
            students: p.students.map((s) => ({ ...s, enrollments: s.enrollments.map((e) => (e.id === enrollmentId ? { ...e, sessionsRemaining: r.sessionsRemaining, sessionsTotal: r.sessionsTotal } : e)) })),
          })),
      );
    } catch (e) {
      setNotice({ ok: false, text: errMsg(e) });
    }
  };

  return (
    <View className="gap-3" testID="accounts-tab">
      <View className="flex-row gap-2">
        <Chip label="Phụ huynh & học viên" on={segment === 'PARENTS'} onPress={() => setSegment('PARENTS')} testID="seg-parents" />
        <Chip label="Nhân viên" on={segment === 'STAFF'} onPress={() => setSegment('STAFF')} testID="seg-staff" />
      </View>
      <SearchField value={search} onChangeText={setSearch} placeholder={segment === 'PARENTS' ? 'Tên phụ huynh, tên bé hoặc SĐT' : 'Tên hoặc email nhân viên'} accessibilityLabel="Tìm tài khoản" />
      {!!notice && <StatusBanner tone={notice.ok ? 'success' : 'error'} text={notice.text} onDismiss={() => setNotice(null)} testID="accounts-notice" />}

      {segment === 'PARENTS' ? (
        <ModuleCard title="Phụ huynh & học viên" subtitle="Khoá / mở tài khoản, cộng trừ số buổi" action="Tạo & liên kết bé" onAction={onCreateParent} full testID="parents-card">
          {!parents.data ? (
            parents.loading ? <LoadingRows /> : <ErrorRow text={parents.error ?? ''} onRetry={parents.reload} />
          ) : parents.data.length === 0 ? (
            <Empty text={q ? 'Không tìm thấy phụ huynh.' : 'Chưa có tài khoản phụ huynh.'} />
          ) : (
            <View className={wide ? 'flex-row flex-wrap gap-2.5' : 'gap-2.5'}>
              {parents.data.slice(0, 40).map((p) => (
                <View key={p.id} className={`gap-2 rounded-2xl border p-3 ${p.isActive ? 'border-slate-100' : 'border-red-100 bg-red-50/40'}`} style={wide ? { width: '49%' } : undefined} testID="parent-row">
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <Text className="text-[15px] font-bold text-ink">{p.fullName}</Text>
                      <Text className="text-[12px] text-ink-muted">
                        {formatPhone(p.phone)}
                        {p.pendingRequests > 0 ? ` · ${p.pendingRequests} đơn chờ` : ''}
                        {p.isActive ? '' : ' · đã khoá'}
                      </Text>
                    </View>
                    <RowAction label={p.isActive ? 'Khoá' : 'Mở khoá'} tone={p.isActive ? 'danger' : 'primary'} onPress={() => setActive(p, !p.isActive)} testID="parent-lock" />
                  </View>
                  {p.students.map((s) =>
                    s.enrollments.map((e) => (
                      <View key={e.id} className="min-h-11 flex-row items-center gap-2 rounded-xl bg-slate-50 px-3" testID="enrollment-row">
                        <Text className="flex-1 text-[13px] text-ink" numberOfLines={1}>
                          {s.fullName} · {CATEGORY_LABELS[e.courseCode]} · {CAMPUS_LABELS[s.campus]}
                        </Text>
                        <Pressable onPress={() => adjust(e.id, -1)} disabled={(e.sessionsRemaining ?? 0) <= 0} accessibilityRole="button" accessibilityLabel={`Bớt 1 buổi ${s.fullName}`} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full bg-white active:bg-slate-200" testID="sessions-minus">
                          <Minus size={15} color={COLORS.ink} />
                        </Pressable>
                        <Text className="min-w-[44px] text-center text-[13px] font-black text-ink" testID="sessions-left">
                          {e.sessionsRemaining ?? '—'}/{e.sessionsTotal ?? '—'}
                        </Text>
                        <Pressable onPress={() => adjust(e.id, 1)} accessibilityRole="button" accessibilityLabel={`Thêm 1 buổi ${s.fullName}`} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full bg-white active:bg-slate-200" testID="sessions-plus">
                          <Plus size={15} color={COLORS.ink} />
                        </Pressable>
                      </View>
                    )),
                  )}
                  {p.students.length === 0 && <Text className="text-[12px] text-ink-subtle">Chưa liên kết bé nào.</Text>}
                </View>
              ))}
            </View>
          )}
        </ModuleCard>
      ) : (
        <ModuleCard title="Nhân viên" subtitle="Giao việc, xem việc đang mở" action="Phân quyền" onAction={onOpenStaffAccounts} full testID="staff-card">
          {!staff.data ? (
            staff.loading ? <LoadingRows /> : <ErrorRow text={staff.error ?? ''} onRetry={staff.reload} />
          ) : staffRows.length === 0 ? (
            <Empty text="Không có nhân viên phù hợp." />
          ) : (
            staffRows.map((s) => (
              <View key={s.id} className="min-h-14 flex-row items-center gap-3 border-t border-slate-100 pt-2" testID="staff-row">
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-ink">{s.displayName ?? s.email}</Text>
                  <Text className="text-[12px] text-ink-muted">
                    {KIND_LABEL[s.kind]} · {s.campus ? CAMPUS_LABELS[s.campus] : 'Mọi cơ sở'} · {s.openTasks} việc đang mở
                  </Text>
                </View>
                <RowAction label="Giao việc" onPress={() => setTaskFor(s)} testID="staff-task" />
              </View>
            ))
          )}
        </ModuleCard>
      )}

      <ModuleCard title="Yêu cầu xoá tài khoản" subtitle="Theo quy định App Store & Google Play" action="Xem" onAction={() => setDeletionsOpen(true)} full testID="deletions-card">
        <Text className="text-[13px] leading-[19px] text-ink-muted">Phụ huynh / nhân viên gửi yêu cầu trong Cài đặt. Xử lý trong 7 ngày làm việc.</Text>
      </ModuleCard>

      <TaskSheet
        member={taskFor}
        onClose={() => setTaskFor(null)}
        onDone={(name) => {
          setTaskFor(null);
          staff.reload();
          setNotice({ ok: true, text: `Đã giao việc cho ${name}. Nhân viên nhận thông báo ngay.` });
        }}
      />
      <DeletionRequestsSheet visible={deletionsOpen} onClose={() => setDeletionsOpen(false)} />
    </View>
  );
}

function TaskSheet({ member, onClose, onDone }: { member: StaffMember | null; onClose: () => void; onDone: (name: string) => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(0);
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTitle('');
    setDue(0);
    setPriority(2);
    setError(null);
  }, [member?.id]);
  const save = async () => {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      await createTask({ assignedTo: member.id, title, type: 'OTHER', due: isoDay(due), priority });
      haptics.success();
      onDone(member.displayName ?? member.email);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSheet visible={!!member} title={`Giao việc cho ${member?.displayName ?? member?.email ?? ''}`} onClose={onClose} testID="task-sheet">
      <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="VD: Gọi xác nhận lịch học bù cho bé Minh Anh" placeholderTextColor={COLORS.subtle} accessibilityLabel="Tên công việc" className="min-h-12 rounded-2xl border border-slate-200 px-4 text-[15px] text-ink" testID="task-title" />
      <Text className="text-[13px] font-semibold text-ink-muted">Hạn</Text>
      <View className="flex-row gap-2">
        {[
          [0, 'Hôm nay'],
          [1, 'Ngày mai'],
          [3, '3 ngày'],
        ].map(([d, l]) => (
          <Chip key={l as string} label={l as string} on={due === d} onPress={() => setDue(d as number)} />
        ))}
      </View>
      <Text className="text-[13px] font-semibold text-ink-muted">Mức ưu tiên</Text>
      <View className="flex-row gap-2">
        {([1, 2, 3] as const).map((p) => (
          <Chip key={p} label={p === 1 ? 'Gấp' : p === 2 ? 'Bình thường' : 'Thấp'} on={priority === p} onPress={() => setPriority(p)} />
        ))}
      </View>
      {!!error && <StatusBanner tone="error" text={error} />}
      <Button title="Giao việc" size="lg" loading={busy} onPress={save} testID="task-save" />
    </SettingsSheet>
  );
}
