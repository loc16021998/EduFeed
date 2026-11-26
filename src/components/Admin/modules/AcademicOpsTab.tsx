import { useState } from 'react';
import { Text, View } from 'react-native';

import { StatusBanner } from '@/components/ux';
import { fetchClassReportStatus, fetchSystemHealth, missingReports } from '@/services/commandCenter';
import { adminDecideRequest, adminListRequests, type AdminRequestRow } from '@/services/parentPortal';
import { useCommandCenterStore } from '@/store/useCommandCenterStore';
import { CAMPUS_LABELS, CATEGORY_LABELS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { haptics } from '@/utils/haptics';

import { Empty, ErrorRow, errMsg, Grid, LoadingRows, ModuleCard, RowAction, useModuleData, useWide } from './ui';

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export default function AcademicOpsTab({ onOpenClasses, onOpenParents }: { onOpenClasses: () => void; onOpenParents: () => void }) {
  const wide = useWide();
  const branch = useCommandCenterStore((s) => s.branch);
  const requests = useModuleData(() => adminListRequests('PENDING'), []);
  const classes = useModuleData(() => fetchClassReportStatus(branch), [branch]);
  const health = useModuleData(() => fetchSystemHealth(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const pending = (requests.data ?? []).filter((r) => branch === 'ALL' || r.campus === branch);
  const decide = async (r: AdminRequestRow, approve: boolean) => {
    setBusy(r.id);
    const before = requests.data;
    requests.setData((d) => d && d.filter((x) => x.id !== r.id)); // optimistic
    try {
      await adminDecideRequest(r.id, approve);
      haptics.success();
      setNotice({ ok: true, text: `${approve ? 'Đã duyệt' : 'Đã từ chối'} đơn của ${r.studentName}. Phụ huynh nhận thông báo ngay.` });
    } catch (e) {
      requests.setData(before);
      setNotice({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const missing = classes.data ? missingReports(classes.data) : [];
  const digest = health.data?.weeklyDigest;

  return (
    <View className="gap-3" testID="academic-tab">
      {!!notice && <StatusBanner tone={notice.ok ? 'success' : 'error'} text={notice.text} onDismiss={() => setNotice(null)} testID="academic-notice" />}

      <ModuleCard title={`Đơn nghỉ / học bù chờ duyệt${requests.data ? ` (${pending.length})` : ''}`} subtitle="Duyệt trước giờ học để giáo viên biết" action="Tất cả phụ huynh" onAction={onOpenParents} full testID="requests-card">
        {!requests.data ? (
          requests.loading ? <LoadingRows rows={2} /> : <ErrorRow text={requests.error ?? ''} onRetry={requests.reload} />
        ) : pending.length === 0 ? (
          <Empty text="Không có đơn nào chờ duyệt. 🎉" />
        ) : (
          <View className={wide ? 'flex-row flex-wrap gap-2.5' : 'gap-2.5'}>
            {pending.map((r) => (
              <View key={r.id} className="gap-1.5 rounded-2xl border border-slate-100 p-3" style={wide ? { width: '49%' } : undefined} testID="request-row">
                <View className="flex-row items-center gap-2">
                  <Text className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.type === 'LEAVE' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>{r.type === 'LEAVE' ? 'Xin nghỉ' : 'Học bù'}</Text>
                  <Text className="flex-1 text-[15px] font-bold text-ink" numberOfLines={1}>
                    {r.studentName}
                  </Text>
                  <Text className="text-[13px] font-semibold text-ink">{fmtDate(r.requestedDate)}</Text>
                </View>
                <Text className="text-[13px] leading-[19px] text-ink">“{r.reason}”</Text>
                <Text className="text-[12px] text-ink-muted">
                  {r.parentName ?? 'Phụ huynh'}
                  {r.parentPhone ? ` · ${formatPhone(r.parentPhone)}` : ''} · {CAMPUS_LABELS[r.campus]}
                </Text>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <RowAction label="Từ chối" tone="danger" disabled={busy === r.id} onPress={() => decide(r, false)} testID="request-reject" />
                  </View>
                  <View className="flex-1">
                    <RowAction label="Duyệt" tone="primary" disabled={busy === r.id} onPress={() => decide(r, true)} testID="request-approve" />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ModuleCard>

      <Grid wide={wide}>
        <ModuleCard title="Lớp học hôm nay" subtitle={classes.data ? `${missing.length} lớp chưa gửi sổ liên lạc` : 'Điểm danh & sổ liên lạc'} action="Lớp học" onAction={onOpenClasses} wide={wide} testID="classes-card">
          {!classes.data ? (
            classes.loading ? <LoadingRows rows={2} /> : <ErrorRow text={classes.error ?? ''} onRetry={classes.reload} />
          ) : classes.data.length === 0 ? (
            <Empty text="Hôm nay không có lớp nào theo lịch." />
          ) : (
            classes.data.map((c) => {
              const late = c.students > 0 && c.reports === 0;
              return (
                <View key={c.classId} className="min-h-[52px] flex-row items-center gap-3 border-t border-slate-100 pt-2" testID="class-row">
                  <View className={`h-2.5 w-2.5 rounded-full ${late ? 'bg-red-500' : c.reports >= c.students ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  <View className="flex-1">
                    <Text className="text-[14px] font-bold text-ink">{c.className}</Text>
                    <Text className="text-[12px] text-ink-muted">
                      {c.slot ?? '—'} · {c.teacherName} · {CATEGORY_LABELS[c.course]}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className={`text-[13px] font-bold ${late ? 'text-red-600' : 'text-ink'}`} testID="class-reports">
                      {c.reports}/{c.students} sổ
                    </Text>
                    <Text className="text-[11px] text-ink-muted">{c.attended} có mặt</Text>
                  </View>
                </View>
              );
            })
          )}
          {missing.length > 0 && <Text className="text-xs leading-[17px] text-amber-700">Nhắc giáo viên gửi sổ liên lạc trước 20:00 — phụ huynh nhận thông báo buổi tối.</Text>}
        </ModuleCard>

        <ModuleCard title="Báo cáo tuần" subtitle="Gửi tự động 19:30 Chủ nhật" wide={wide} testID="digest-card">
          {!health.data ? (
            health.loading ? <LoadingRows rows={1} /> : <ErrorRow text={health.error ?? ''} onRetry={health.reload} />
          ) : !digest?.weekStart ? (
            <Empty text="Chưa có báo cáo tuần nào (cần chạy lịch weekly digest)." />
          ) : (
            <View className="gap-2">
              <Text className="text-[13px] text-ink-muted">Tuần bắt đầu {fmtDate(digest.weekStart)}</Text>
              <View className="flex-row gap-2">
                <Stat n={digest.published} label="đã gửi phụ huynh" />
                <Stat n={digest.zaloSent} label="kèm Zalo" />
                <Stat n={digest.drafts} label="đang nháp" warn={digest.drafts > 0} />
              </View>
            </View>
          )}
        </ModuleCard>
      </Grid>
    </View>
  );
}

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-slate-50 p-2.5">
      <Text className={`text-[20px] font-black ${warn ? 'text-amber-700' : 'text-ink'}`}>{n}</Text>
      <Text className="text-center text-[11px] text-ink-muted">{label}</Text>
    </View>
  );
}
