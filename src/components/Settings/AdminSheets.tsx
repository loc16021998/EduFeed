import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import Button from '@/components/Button';
import { StatusBanner } from '@/components/ux';
import { EmptyState } from '@/components/ux';
import FormField from '@/screens/Booking/components/FormField';
import { fetchReleaseConfigs, isVersion, listDeletionRequests, resolveDeletionRequest, ROLE_BADGE, saveReleaseConfig, type DeletionRequest } from '@/services/account';
import type { ReleaseConfig } from '@/services/updateService';
import { confirmAsync } from '@/utils/platform';
import { COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { haptics } from '@/utils/haptics';

import { SettingsSheet } from './SettingsSection';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Không thực hiện được, vui lòng thử lại.');
const PLATFORM_LABEL = { android: 'Android (Google Play)', ios: 'iPhone (App Store)' } as const;

// ─── Release config ─────────────────────────────────────────────────────────

export function ReleaseConfigSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<ReleaseConfig[] | null>(null);
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');
  const [draft, setDraft] = useState<ReleaseConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNotice(null);
    fetchReleaseConfigs().then(setRows, (e) => setNotice({ ok: false, text: msg(e) }));
  }, [visible]);
  useEffect(() => {
    const r = rows?.find((x) => x.platform === platform);
    setDraft(r ? { ...r } : null);
  }, [rows, platform]);

  const set = (p: Partial<ReleaseConfig>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const save = async () => {
    if (!draft) return;
    if (draft.isForceUpdate && !(await confirmAsync('Bắt buộc cập nhật?', `Mọi người dùng ${PLATFORM_LABEL[draft.platform]} dưới bản ${draft.latestVersion} sẽ phải cập nhật mới dùng tiếp được.`, 'Bắt buộc'))) return;
    setBusy(true);
    setNotice(null);
    try {
      await saveReleaseConfig(draft);
      setRows((rs) => rs?.map((r) => (r.platform === draft.platform ? { ...draft } : r)) ?? null);
      haptics.success();
      setNotice({ ok: true, text: `Đã lưu cấu hình ${PLATFORM_LABEL[draft.platform]}. Ứng dụng áp dụng ở lần mở tiếp theo.` });
    } catch (e) {
      setNotice({ ok: false, text: msg(e) });
    } finally {
      setBusy(false);
    }
  };

  const bad = (v: string) => (v && !isVersion(v) ? 'Dạng 1.2.3' : undefined);
  return (
    <SettingsSheet visible={visible} title="Cấu hình phiên bản ứng dụng" onClose={onClose} testID="release-sheet">
      <View className="flex-row rounded-2xl bg-slate-100 p-1" accessibilityRole="tablist">
        {(['android', 'ios'] as const).map((p) => (
          <Pressable key={p} onPress={() => setPlatform(p)} accessibilityRole="tab" aria-selected={platform === p} accessibilityState={{ selected: platform === p }} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${platform === p ? 'bg-white' : ''}`} testID={`release-${p}`}>
            <Text className={`text-[14px] font-bold ${platform === p ? 'text-ink' : 'text-ink-muted'}`}>{p === 'android' ? 'Android' : 'iPhone'}</Text>
          </Pressable>
        ))}
      </View>
      {!draft ? (
        <ActivityIndicator color={COLORS.brand} className="py-6" />
      ) : (
        <>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField label="Bản tối thiểu (chặn)" value={draft.minSupportedVersion} onChangeText={(t) => set({ minSupportedVersion: t })} error={bad(draft.minSupportedVersion)} keyboardType="numbers-and-punctuation" testID="release-min" />
            </View>
            <View className="flex-1">
              <FormField label="Bản mới nhất" value={draft.latestVersion} onChangeText={(t) => set({ latestVersion: t })} error={bad(draft.latestVersion)} keyboardType="numbers-and-punctuation" testID="release-latest" />
            </View>
          </View>
          <FormField label="Link cửa hàng (https://…)" value={draft.storeUrl} onChangeText={(t) => set({ storeUrl: t })} autoCapitalize="none" placeholder="Để trống = chưa hiện lời nhắc" testID="release-url" />
          <FormField label="Điểm mới (hiện cho người dùng)" value={draft.releaseNotesVi} onChangeText={(t) => set({ releaseNotesVi: t })} maxLength={600} multiline placeholder="VD: Báo cáo tuần cho ba mẹ" testID="release-notes" />
          <View className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-slate-200 px-4 py-2">
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-ink">Bắt buộc cập nhật</Text>
              <Text className="text-[13px] leading-[18px] text-ink-muted">Chỉ dùng cho bản sửa lỗi nghiêm trọng</Text>
            </View>
            <Switch value={draft.isForceUpdate} onValueChange={(v) => set({ isForceUpdate: v })} trackColor={{ true: '#DC2626', false: '#CBD5E1' }} thumbColor="#fff" accessibilityLabel="Bắt buộc cập nhật" testID="release-force" />
          </View>
          {!!notice && <StatusBanner tone={notice.ok ? 'success' : 'error'} text={notice.text} onDismiss={() => setNotice(null)} testID="release-notice" />}
          <Button title="Lưu cấu hình" size="lg" loading={busy} onPress={save} testID="release-save" />
          <Text className="text-xs leading-[17px] text-ink-subtle">Bản đang cài thấp hơn "Bản tối thiểu" → màn hình bắt buộc cập nhật. Thấp hơn "Bản mới nhất" → lời mời cập nhật có thể bỏ qua.</Text>
        </>
      )}
      {!draft && !!notice && <StatusBanner tone="error" text={notice.text} />}
    </SettingsSheet>
  );
}

// ─── Deletion requests ──────────────────────────────────────────────────────

export function DeletionRequestsSheet({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged?: (pending: number) => void }) {
  const [rows, setRows] = useState<DeletionRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    listDeletionRequests('PENDING').then(setRows, (e) => setError(msg(e)));
  }, [visible]);

  const resolve = async (r: DeletionRequest, status: 'DONE' | 'CANCELLED') => {
    const ask =
      status === 'DONE'
        ? await confirmAsync('Xác nhận xoá tài khoản?', `${r.displayName} (${r.contact}) sẽ không đăng nhập được nữa.${r.role === 'PARENT' ? '' : ' Nhớ khoá tài khoản ở mục Tài khoản nhân viên.'}`, 'Xoá tài khoản')
        : await confirmAsync('Từ chối yêu cầu?', 'Hãy gọi lại cho người gửi để giải thích.', 'Từ chối');
    if (!ask) return;
    setBusy(r.id);
    try {
      await resolveDeletionRequest(r.id, status);
      const next = (rows ?? []).filter((x) => x.id !== r.id);
      setRows(next);
      onChanged?.(next.length);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSheet visible={visible} title="Yêu cầu xoá tài khoản" onClose={onClose} testID="deletion-sheet">
      {!!error && <StatusBanner tone="error" text={error} onDismiss={() => setError(null)} />}
      {!rows ? (
        <ActivityIndicator color={COLORS.brand} className="py-6" />
      ) : rows.length === 0 ? (
        <EmptyState compact emoji="✅" title="Không có yêu cầu chờ xử lý" message="Khi phụ huynh hoặc nhân viên gửi yêu cầu xoá tài khoản, yêu cầu sẽ hiện ở đây." />
      ) : (
        rows.map((r) => (
          <View key={r.id} className="gap-2 rounded-2xl border border-slate-200 p-3" testID="deletion-row">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-[15px] font-bold text-ink">{r.displayName}</Text>
              <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-ink-muted">{ROLE_BADGE[r.role]}</Text>
            </View>
            <Text className="text-[13px] text-ink-muted">
              {/^\d+$/.test(r.contact) ? formatPhone(r.contact) : r.contact} · {new Date(r.createdAt).toLocaleDateString('vi-VN')}
            </Text>
            {!!r.reason && <Text className="text-[13px] leading-[19px] text-ink">“{r.reason}”</Text>}
            <View className="flex-row gap-2">
              <Button className="flex-1" size="sm" variant="outline" title="Từ chối" disabled={busy === r.id} onPress={() => resolve(r, 'CANCELLED')} />
              <Button className="flex-1" size="sm" title="Đã xoá xong" loading={busy === r.id} onPress={() => resolve(r, 'DONE')} testID="deletion-done" />
            </View>
          </View>
        ))
      )}
    </SettingsSheet>
  );
}
