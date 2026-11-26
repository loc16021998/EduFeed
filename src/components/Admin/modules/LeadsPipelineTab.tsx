import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import Button from '@/components/Button';
import SearchField from '@/components/SearchField';
import { SettingsSheet } from '@/components/Settings/SettingsSection';
import { StatusBanner } from '@/components/ux';
import { RANGE_DAYS } from '@/services/commandCenter';
import { completeTrial, setLeadStatus } from '@/services/crm';
import { fetchDashboardLeads } from '@/services/dashboard';
import { createTask, staffDirectory, type StaffMember } from '@/services/staffOps';
import { useCommandCenterStore } from '@/store/useCommandCenterStore';
import type { DashboardLead, LeadStatus, LeadStatusGroup } from '@/types';
import { CAMPUS_LABELS, CATEGORY_LABELS, CHANNEL_LABELS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { haptics } from '@/utils/haptics';
import { confirmAsync } from '@/utils/platform';

import { Chip, Empty, ErrorRow, errMsg, LoadingRows, ModuleCard, RowAction, useModuleData, useWide } from './ui';

type StatusChip = 'ALL' | 'NEW' | 'CONFIRMED' | 'REMINDED' | 'COMPLETED_TRIAL' | 'ENROLLED' | 'CANCELLED';
const CHIPS: { id: StatusChip; label: string; group: LeadStatusGroup; statuses?: LeadStatus[] }[] = [
  { id: 'ALL', label: 'Tất cả', group: 'ALL' },
  { id: 'NEW', label: 'Mới', group: 'TO_CONTACT' },
  { id: 'CONFIRMED', label: 'Đã xác nhận', group: 'SCHEDULED', statuses: ['CONFIRMED'] },
  { id: 'REMINDED', label: 'Đã nhắc 24h/2h', group: 'SCHEDULED', statuses: ['REMINDED_24H', 'REMINDED_2H'] },
  { id: 'COMPLETED_TRIAL', label: 'Đã học thử', group: 'TRIAL_DONE' },
  { id: 'ENROLLED', label: 'Nhập học', group: 'ENROLLED' },
  { id: 'CANCELLED', label: 'Đã huỷ', group: 'CANCELLED' },
];
const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'Mới', CONTACTED: 'Đã liên hệ', CONFIRMED: 'Đã xác nhận', REMINDED_24H: 'Đã nhắc 24h', REMINDED_2H: 'Đã nhắc 2h',
  COMPLETED_TRIAL: 'Đã học thử', ENROLLED: 'Nhập học', CANCELLED: 'Đã huỷ',
};
const SCHEDULED: LeadStatus[] = ['NEW', 'CONTACTED', 'CONFIRMED', 'REMINDED_24H', 'REMINDED_2H'];
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function LeadsPipelineTab({ onOpenCrm }: { onOpenCrm: () => void }) {
  const wide = useWide();
  const { branch, range } = useCommandCenterStore();
  const [chip, setChip] = useState<StatusChip>('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const def = CHIPS.find((c) => c.id === chip)!;
  useEffect(() => {
    const id = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  const { data, setData, loading, error, reload } = useModuleData(
    () => fetchDashboardLeads({ campus: branch, days: Math.max(RANGE_DAYS[range], 1), group: def.group, search: query, page: 0 }),
    [branch, range, chip, query],
  );
  const rows = useMemo(() => (data?.items ?? []).filter((l) => !def.statuses || def.statuses.includes(l.status)), [data, def]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [trialFor, setTrialFor] = useState<DashboardLead | null>(null);
  const [assignFor, setAssignFor] = useState<DashboardLead | null>(null);

  const patch = (id: string, status: LeadStatus) => setData((d) => d && { ...d, items: d.items.map((l) => (l.id === id ? { ...l, status } : l)) });

  const enroll = async (l: DashboardLead) => {
    if (!(await confirmAsync('Chuyển thành học viên?', `${l.studentName} (${CATEGORY_LABELS[l.course]}) sẽ có hồ sơ nhập học ở Quản lý học viên.`, 'Nhập học'))) return;
    const before = l.status;
    patch(l.id, 'ENROLLED');
    try {
      await setLeadStatus(l.id, 'ENROLLED');
      haptics.success();
      setNotice({ ok: true, text: `${l.studentName} đã nhập học. Tạo hoá đơn học phí ở Quản lý học viên.` });
    } catch (e) {
      patch(l.id, before);
      setNotice({ ok: false, text: errMsg(e) });
    }
  };

  return (
    <View className="gap-3" testID="leads-tab">
      <SearchField value={search} onChangeText={setSearch} placeholder="Tên phụ huynh, tên bé, SĐT, mã TH-…" accessibilityLabel="Tìm lead" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" accessibilityRole="tablist">
        {CHIPS.map((c) => (
          <Chip key={c.id} label={c.label} on={chip === c.id} onPress={() => setChip(c.id)} testID={`lead-chip-${c.id}`} />
        ))}
      </ScrollView>
      {!!notice && <StatusBanner tone={notice.ok ? 'success' : 'error'} text={notice.text} onDismiss={() => setNotice(null)} testID="leads-notice" />}
      <ModuleCard title={`Lead ${data ? `(${rows.length}${data.hasMore ? '+' : ''})` : ''}`} subtitle={`${branch === 'ALL' ? 'Cả 2 cơ sở' : CAMPUS_LABELS[branch]} · ${range === 'TODAY' ? 'hôm nay' : range === '7D' ? '7 ngày' : '30 ngày'}`} action="CRM đầy đủ" onAction={onOpenCrm} full testID="leads-card">
        {!data ? (
          loading ? <LoadingRows /> : <ErrorRow text={error ?? 'Không tải được'} onRetry={reload} />
        ) : rows.length === 0 ? (
          <Empty text={query ? 'Không có lead khớp tìm kiếm.' : 'Không có lead nào ở trạng thái này.'} />
        ) : (
          <View className={wide ? 'flex-row flex-wrap gap-2.5' : 'gap-2.5'}>
            {rows.map((l) => (
              <View key={l.id} className="gap-2 rounded-2xl border border-slate-100 p-3" style={wide ? { width: '49%' } : undefined} testID="lead-row">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-[15px] font-bold text-ink" numberOfLines={1}>
                    {l.parentName} · bé {l.studentName}
                  </Text>
                  <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-ink-muted" testID="lead-status">
                    {STATUS_LABEL[l.status]}
                  </Text>
                </View>
                <Text className="text-[12px] leading-[17px] text-ink-muted">
                  {l.code} · {formatPhone(l.phone)} · {CATEGORY_LABELS[l.course]} · {CAMPUS_LABELS[l.campus]} · {CHANNEL_LABELS[l.channel]}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <RowAction label="Gọi" onPress={() => Linking.openURL(`tel:${l.phone}`).catch(() => {})} testID="lead-call" />
                  <RowAction label="Zalo" onPress={() => Linking.openURL(`https://zalo.me/${l.phone}`).catch(() => {})} testID="lead-zalo" />
                  {l.status !== 'ENROLLED' && l.status !== 'CANCELLED' && <RowAction label="Giao tư vấn" onPress={() => setAssignFor(l)} testID="lead-assign" />}
                  {SCHEDULED.includes(l.status) && <RowAction label="Đã học thử" onPress={() => setTrialFor(l)} testID="lead-trial" />}
                  {(l.status === 'COMPLETED_TRIAL' || SCHEDULED.includes(l.status)) && <RowAction label="Nhập học" tone="primary" onPress={() => enroll(l)} testID="lead-enroll" />}
                </View>
              </View>
            ))}
          </View>
        )}
      </ModuleCard>

      <TrialSheet
        lead={trialFor}
        onClose={() => setTrialFor(null)}
        onDone={(l) => {
          setTrialFor(null);
          patch(l.id, 'COMPLETED_TRIAL');
          setNotice({ ok: true, text: `Đã ghi nhận ${l.studentName} học thử. Tin nhắn cảm ơn + ưu đãi gửi phụ huynh sau 2 giờ.` });
        }}
      />
      <AssignSheet
        lead={assignFor}
        onClose={() => setAssignFor(null)}
        onDone={(name) => {
          setAssignFor(null);
          setNotice({ ok: true, text: `Đã giao việc gọi lại cho ${name}.` });
        }}
      />
    </View>
  );
}

function TrialSheet({ lead, onClose, onDone }: { lead: DashboardLead | null; onClose: () => void; onDone: (l: DashboardLead) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setNote('');
    setError(null);
  }, [lead?.id]);
  const save = async () => {
    if (!lead) return;
    if (note.trim().length < 10) return setError('Nhận xét của giáo viên cần ít nhất 10 ký tự');
    setBusy(true);
    try {
      await completeTrial(lead.id, note.trim());
      haptics.success();
      onDone(lead);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSheet visible={!!lead} title="Ghi nhận đã học thử" onClose={onClose} testID="trial-sheet">
      <Text className="text-[13px] leading-[19px] text-ink-muted">Nhận xét được gửi kèm tin cảm ơn cho phụ huynh sau 2 giờ (T+2h).</Text>
      <TextInput value={note} onChangeText={(t) => (setNote(t), setError(null))} multiline maxLength={1000} placeholder="VD: Bé tập trung tốt, tính nhẩm nhanh, cần luyện thêm cách trình bày…" placeholderTextColor={COLORS.subtle} accessibilityLabel="Nhận xét buổi học thử" className="min-h-[96px] rounded-2xl border border-slate-200 px-4 py-3 text-[15px] text-ink" style={{ textAlignVertical: 'top' }} testID="trial-note" />
      {!!error && <StatusBanner tone="error" text={error} />}
      <Button title="Lưu & gửi phụ huynh" size="lg" loading={busy} onPress={save} testID="trial-save" />
    </SettingsSheet>
  );
}

function AssignSheet({ lead, onClose, onDone }: { lead: DashboardLead | null; onClose: () => void; onDone: (name: string) => void }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!lead) return;
    setPick(null);
    setError(null);
    staffDirectory().then((s) => setStaff(s.filter((x) => x.kind === 'ADVISOR' || x.kind === 'MANAGER' || x.kind === 'TEACHER')), (e) => setError(errMsg(e)));
  }, [lead]);
  const save = async () => {
    const who = staff?.find((s) => s.id === pick);
    if (!lead || !who) return setError('Chọn người nhận việc');
    setBusy(true);
    try {
      await createTask({ assignedTo: who.id, title: `Gọi lại ${lead.parentName} (${lead.code})`, description: `Bé ${lead.studentName} · ${CATEGORY_LABELS[lead.course]} · ${formatPhone(lead.phone)}`, type: 'LEAD_FOLLOWUP', targetId: lead.id, due: todayIso(), priority: 2 });
      haptics.success();
      onDone(who.displayName ?? who.email);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSheet visible={!!lead} title="Giao tư vấn gọi lại" onClose={onClose} testID="assign-sheet">
      {!staff ? (
        <LoadingRows rows={2} />
      ) : staff.length === 0 ? (
        <Empty text="Chưa có nhân viên. Thêm ở Tài khoản & phân quyền." />
      ) : (
        <View className="gap-2" accessibilityRole="radiogroup">
          {staff.map((s) => (
            <Pressable key={s.id} onPress={() => setPick(s.id)} accessibilityRole="radio" aria-checked={pick === s.id} accessibilityState={{ checked: pick === s.id }} className={`min-h-[52px] flex-row items-center gap-3 rounded-2xl border px-4 ${pick === s.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`} testID="assign-option">
              <Text className="flex-1 text-[14px] font-semibold text-ink">{s.displayName ?? s.email}</Text>
              <Text className="text-[12px] text-ink-muted">
                {s.kind === 'ADVISOR' ? 'Tư vấn' : s.kind === 'TEACHER' ? 'Giáo viên' : 'Quản lý'} · {s.openTasks} việc
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {!!error && <StatusBanner tone="error" text={error} />}
      <Button title="Giao việc" size="lg" loading={busy} onPress={save} testID="assign-save" />
    </SettingsSheet>
  );
}
