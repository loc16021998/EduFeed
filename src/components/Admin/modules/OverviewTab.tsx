import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import Button from '@/components/Button';
import { SettingsSheet } from '@/components/Settings/SettingsSection';
import { StatusBanner } from '@/components/ux';
import { averageCpa, compactVnd, fetchCommandOverview, pct, saveAdSpend, type CommandInvoice, type SpendChannel } from '@/services/commandCenter';
import { confirmInvoiceManually } from '@/services/paymentService';
import { useCommandCenterStore, type CommandModule } from '@/store/useCommandCenterStore';
import { formatVnd } from '@/screens/Admin/format';
import { CAMPUS_LABELS, CATEGORY_LABELS, CHANNEL_LABELS, COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

import { Empty, ErrorRow, errMsg, Grid, Kpi, LoadingRows, ModuleCard, RowAction, useModuleData, useWide } from './ui';

const SPEND_CHANNELS: SpendChannel[] = ['FACEBOOK', 'TIKTOK', 'ZALO', 'REFERRAL', 'OTHER'];
const PAY_NOTES = ['Tiền mặt tại quầy', 'Chuyển khoản đã kiểm tra sao kê', 'Quẹt thẻ tại quầy'];
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export default function OverviewTab({ onOpenReceipt, onOpenCrm }: { onOpenReceipt: (invoiceId: string) => void; onOpenCrm: () => void }) {
  const wide = useWide();
  const { branch, range, setModule } = useCommandCenterStore();
  const { data, setData, loading, error, reload } = useModuleData(() => fetchCommandOverview(branch, range), [branch, range]);
  const [confirming, setConfirming] = useState<CommandInvoice | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);

  if (!data) return loading ? <LoadingRows rows={5} /> : <ErrorRow text={error ?? 'Không tải được dữ liệu'} onRetry={reload} />;

  const attendance = pct(data.trials.attended, data.trials.scheduled);
  const conversion = pct(data.leads.enrolled, data.leads.total);
  const cpa = averageCpa(data.channels);
  const maxCourse = Math.max(1, ...data.revenueByCourse.map((r) => r.amountVnd));
  const periodLabel = data.days === 1 ? 'hôm nay' : `${data.days} ngày`;
  const allQueues: { label: string; n: number; to: CommandModule }[] = [
    { label: 'Lead mới chưa gọi', n: data.queues.newLeads, to: 'LEADS_CRM' },
    { label: 'Đơn nghỉ / học bù chờ duyệt', n: data.queues.attendanceRequests, to: 'ACADEMIC_OPS' },
    { label: 'Bình luận mới hôm nay', n: data.queues.commentsToday, to: 'CONTENT_FEED' },
    { label: 'Việc nhân viên đang mở', n: data.queues.openTasks, to: 'ACCOUNTS_RBAC' },
    { label: 'Yêu cầu xoá tài khoản', n: data.queues.deletionRequests, to: 'ACCOUNTS_RBAC' },
  ];
  const queues = allQueues.filter((q) => q.n > 0);

  return (
    <View className="gap-3" testID="overview-tab">
      {!!error && <ErrorRow text={error} onRetry={reload} />}
      <View className="flex-row flex-wrap gap-2.5" testID="kpi-grid">
        <Kpi label="Lead mới" value={String(data.leads.total)} hint={`${periodLabel} · ${data.leads.cancelled} đã huỷ`} wide={wide} testID="kpi-leads" />
        <Kpi label="Tỷ lệ đến học thử" value={attendance == null ? '—' : `${attendance}%`} hint={`${data.trials.attended}/${data.trials.scheduled} buổi đã hẹn`} tone={attendance != null && attendance < 60 ? 'warn' : 'default'} wide={wide} testID="kpi-attendance" />
        <Kpi label="Tỷ lệ chốt nhập học" value={conversion == null ? '—' : `${conversion}%`} hint={`${data.leads.enrolled} bé nhập học`} tone="good" wide={wide} testID="kpi-conversion" />
        <Kpi label="CPA trung bình" value={cpa == null ? '—' : compactVnd(cpa)} hint={data.spendVnd > 0 ? `Chi ${compactVnd(data.spendVnd)} quảng cáo` : 'Chưa nhập chi phí quảng cáo'} wide={wide} testID="kpi-cpa" />
        <Kpi label="Đã thu học phí" value={compactVnd(data.tuition.collectedVnd)} hint={`${data.tuition.paidCount} hoá đơn · ${periodLabel}`} tone="good" wide={wide} testID="kpi-collected" />
        <Kpi label="Còn phải thu" value={compactVnd(data.tuition.unpaidVnd)} hint={`${data.tuition.unpaidCount} hoá đơn chờ thanh toán`} tone={data.tuition.unpaidCount > 0 ? 'warn' : 'default'} wide={wide} testID="kpi-unpaid" />
      </View>

      {queues.length > 0 && (
        <ModuleCard title="Việc cần xử lý" testID="queues-card">
          {queues.map((q) => (
            <Pressable key={q.label} onPress={() => setModule(q.to)} accessibilityRole="button" className="min-h-11 flex-row items-center gap-2 rounded-xl px-1 active:bg-slate-50" testID="queue-row">
              <View className="min-w-[30px] items-center rounded-full bg-red-50 px-2 py-0.5">
                <Text className="text-[13px] font-black text-red-600">{q.n}</Text>
              </View>
              <Text className="flex-1 text-[14px] text-ink">{q.label}</Text>
              <Text className="text-[13px] font-bold text-brand-600">Mở ›</Text>
            </Pressable>
          ))}
        </ModuleCard>
      )}

      <Grid wide={wide}>
        <ModuleCard title="Doanh thu theo khoá" subtitle={`Học phí đã thu · ${periodLabel}`} wide={wide} testID="revenue-card">
          {data.revenueByCourse.length === 0 ? (
            <Empty text="Chưa có học phí nào được thu trong khoảng này." />
          ) : (
            data.revenueByCourse.map((r) => (
              <View key={r.course} className="gap-1" accessible accessibilityLabel={`${CATEGORY_LABELS[r.course]}: ${formatVnd(r.amountVnd)}`}>
                <View className="flex-row justify-between">
                  <Text className="text-[13px] font-semibold text-ink">{CATEGORY_LABELS[r.course]}</Text>
                  <Text className="text-[13px] font-bold text-ink">{compactVnd(r.amountVnd)}</Text>
                </View>
                <View className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <View className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (r.amountVnd / maxCourse) * 100)}%` }} />
                </View>
              </View>
            ))
          )}
        </ModuleCard>

        <ModuleCard title="Nguồn khách & CPA" subtitle="Lead · nhập học · chi phí / lead" action="Nhập chi phí" onAction={() => setSpendOpen(true)} wide={wide} testID="channels-card">
          {data.channels.length === 0 ? (
            <Empty text="Chưa có lead nào trong khoảng này." />
          ) : (
            data.channels.map((c) => (
              <View key={c.channel} className="min-h-11 flex-row items-center gap-2 border-t border-slate-100 pt-2" testID={`channel-${c.channel}`}>
                <Text className="flex-1 text-[14px] font-semibold text-ink">{CHANNEL_LABELS[c.channel]}</Text>
                <Text className="w-14 text-right text-[13px] text-ink">{c.leads} lead</Text>
                <Text className="w-12 text-right text-[13px] text-emerald-700">{c.enrolled} NH</Text>
                <Text className="w-16 text-right text-[13px] font-bold text-ink">{c.cpaVnd == null ? '—' : compactVnd(c.cpaVnd)}</Text>
              </View>
            ))
          )}
        </ModuleCard>
      </Grid>

      <ModuleCard title="Đối soát học phí" subtitle="Hoá đơn chờ thanh toán lên đầu" action="Mở CRM" onAction={onOpenCrm} full testID="invoices-card">
        {data.recentInvoices.length === 0 ? (
          <Empty text="Chưa có hoá đơn học phí. Tạo hoá đơn ở Quản lý học viên khi bé nhập học." />
        ) : (
          data.recentInvoices.map((i) => (
            <View key={i.id} className="gap-2 rounded-2xl border border-slate-100 p-3" testID="invoice-row">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-[14px] font-bold text-ink" numberOfLines={1}>
                  {i.studentName}
                </Text>
                <Text className="text-[14px] font-black text-ink">{formatVnd(i.amountVnd)}</Text>
              </View>
              <Text className="text-[12px] text-ink-muted">
                {CATEGORY_LABELS[i.course]} · {CAMPUS_LABELS[i.campus]} · {i.ref}
              </Text>
              <View className="flex-row items-center gap-2">
                <View className={`rounded-full px-2.5 py-1 ${i.status === 'PAID' ? 'bg-emerald-50' : i.status === 'CANCELLED' ? 'bg-slate-100' : 'bg-amber-50'}`}>
                  <Text className={`text-[12px] font-bold ${i.status === 'PAID' ? 'text-emerald-700' : i.status === 'CANCELLED' ? 'text-ink-muted' : 'text-amber-700'}`} testID="invoice-status">
                    {i.status === 'PAID' ? `Đã thu${i.method === 'MANUAL' ? ' (quầy)' : i.method ? ` (${i.method === 'VIETQR' ? 'VietQR' : 'VNPay'})` : ''}` : i.status === 'CANCELLED' ? 'Đã huỷ' : 'Chờ thanh toán'}
                  </Text>
                </View>
                <View className="flex-1" />
                {i.status === 'PENDING_PAYMENT' && <RowAction label="Xác nhận đã thu" tone="primary" onPress={() => setConfirming(i)} testID="invoice-confirm" />}
                {i.status === 'PAID' && <RowAction label={i.receiptNo ? `Biên nhận ${i.receiptNo}` : 'Xem biên nhận'} onPress={() => onOpenReceipt(i.id)} testID="invoice-receipt" />}
              </View>
            </View>
          ))
        )}
      </ModuleCard>

      <ConfirmPaidSheet
        invoice={confirming}
        onClose={() => setConfirming(null)}
        onDone={(id) => {
          setConfirming(null);
          setData((d) =>
            d && {
              ...d,
              recentInvoices: d.recentInvoices.map((x) => (x.id === id ? { ...x, status: 'PAID', method: 'MANUAL', paidAt: new Date().toISOString() } : x)),
              tuition: { ...d.tuition, unpaidCount: Math.max(0, d.tuition.unpaidCount - 1) },
            },
          );
          reload();
        }}
      />
      <AdSpendSheet visible={spendOpen} onClose={() => setSpendOpen(false)} onSaved={() => (setSpendOpen(false), reload())} />
    </View>
  );
}

function ConfirmPaidSheet({ invoice, onClose, onDone }: { invoice: CommandInvoice | null; onClose: () => void; onDone: (id: string) => void }) {
  const [note, setNote] = useState(PAY_NOTES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    try {
      await confirmInvoiceManually(invoice.id, note);
      haptics.success();
      onDone(invoice.id);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSheet visible={!!invoice} title="Xác nhận đã thu học phí" onClose={onClose} testID="confirm-paid-sheet">
      {invoice && (
        <Text className="text-[14px] leading-5 text-ink">
          {invoice.studentName} · <Text className="font-black">{formatVnd(invoice.amountVnd)}</Text> · {invoice.ref}
        </Text>
      )}
      <Text className="text-[13px] font-semibold text-ink-muted">Cách nhận tiền</Text>
      <View className="flex-row flex-wrap gap-2">
        {PAY_NOTES.map((p) => (
          <Pressable key={p} onPress={() => setNote(p)} accessibilityRole="radio" aria-checked={note === p} accessibilityState={{ checked: note === p }} className={`min-h-11 justify-center rounded-full border px-3.5 ${note === p ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
            <Text className="text-[13px] font-semibold text-ink">{p}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={note} onChangeText={setNote} maxLength={200} accessibilityLabel="Ghi chú thu tiền" placeholderTextColor={COLORS.subtle} className="min-h-12 rounded-2xl border border-slate-200 px-4 text-[15px] text-ink" testID="paid-note" />
      {!!error && <StatusBanner tone="error" text={error} />}
      <Button title="Xác nhận đã thu" size="lg" loading={busy} onPress={confirm} testID="paid-confirm" />
      <Text className="text-xs leading-[17px] text-ink-subtle">Phụ huynh nhận biên nhận điện tử ngay sau khi xác nhận. Chỉ xác nhận khi đã thấy tiền.</Text>
    </SettingsSheet>
  );
}

function AdSpendSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const branch = useCommandCenterStore((s) => s.branch);
  const [channel, setChannel] = useState<SpendChannel>('FACEBOOK');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const month = monthStart();
  const save = async () => {
    const v = Number(amount.replace(/[^\d]/g, ''));
    if (!amount.trim() || !Number.isFinite(v)) return setError('Nhập số tiền (VD: 3000000)');
    setBusy(true);
    setError(null);
    try {
      await saveAdSpend({ branch, channel, month, amountVnd: v });
      haptics.success();
      setAmount('');
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSheet visible={visible} title="Chi phí quảng cáo tháng này" onClose={onClose} testID="spend-sheet">
      <Text className="text-[13px] leading-[19px] text-ink-muted">
        Tháng {month.slice(5, 7)}/{month.slice(0, 4)} · {branch === 'ALL' ? 'chung cả 2 cơ sở' : CAMPUS_LABELS[branch]}. Nhập tổng đã chi, nhập lại sẽ thay số cũ.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {SPEND_CHANNELS.map((c) => (
          <Pressable key={c} onPress={() => setChannel(c)} accessibilityRole="radio" aria-checked={channel === c} accessibilityState={{ checked: channel === c }} className={`min-h-11 justify-center rounded-full border px-3.5 ${channel === c ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`} testID={`spend-${c}`}>
            <Text className="text-[13px] font-semibold text-ink">{CHANNEL_LABELS[c]}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="Số tiền (đồng), VD: 3000000" placeholderTextColor={COLORS.subtle} accessibilityLabel="Số tiền quảng cáo" className="min-h-12 rounded-2xl border border-slate-200 px-4 text-[15px] text-ink" testID="spend-amount" />
      {!!amount && Number(amount.replace(/[^\d]/g, '')) > 0 && <Text className="text-[13px] text-ink-muted">= {formatVnd(Number(amount.replace(/[^\d]/g, '')))}</Text>}
      {!!error && <StatusBanner tone="error" text={error} />}
      <Button title="Lưu chi phí" size="lg" loading={busy} onPress={save} testID="spend-save" />
    </SettingsSheet>
  );
}
