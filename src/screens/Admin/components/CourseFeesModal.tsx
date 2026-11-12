import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button } from '@/components';
import { FEE_MAX_VND, FEE_MIN_VND } from '@/services/dashboard';
import type { CourseCategory, CourseFees } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';

import { formatInt } from '../format';

const COURSES: CourseCategory[] = ['TIEN_TIEU_HOC', 'LUYEN_CHU_DEP', 'TOAN_TU_DUY', 'BOI_DUONG_TOAN_TV'];

interface Props {
  visible: boolean;
  fees: CourseFees;
  onSave: (fees: Partial<Record<CourseCategory, number | null>>) => Promise<string | null>;
  onClose: () => void;
}

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9);

/** Staff enter the real monthly tuition per course; the revenue KPI only uses these numbers. */
export default function CourseFeesModal({ visible, fees, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Record<CourseCategory, string>>({} as Record<CourseCategory, string>);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(Object.fromEntries(COURSES.map((c) => [c, fees[c] ? String(fees[c]) : ''])) as Record<CourseCategory, string>);
    setError(null);
  }, [visible, fees]);

  const save = async () => {
    const out: Partial<Record<CourseCategory, number | null>> = {};
    for (const c of COURSES) {
      const v = draft[c] ? Number(draft[c]) : null;
      if (v !== null && (v < FEE_MIN_VND || v > FEE_MAX_VND)) {
        return setError(`${CATEGORY_LABELS[c]}: học phí phải từ ${formatInt(FEE_MIN_VND)}đ đến ${formatInt(FEE_MAX_VND)}đ / tháng.`);
      }
      if (v !== (fees[c] ?? null)) out[c] = v;
    }
    if (!Object.keys(out).length) return onClose();
    setBusy(true);
    const err = await onSave(out);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 items-center justify-end bg-black/40">
        <Pressable className="w-full flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="w-full max-w-[560px] rounded-t-3xl bg-white p-5">
          <ScrollView contentContainerClassName="gap-3" keyboardShouldPersistTaps="handled">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Học phí theo tháng
            </Text>
            <Text className="text-[13px] leading-5 text-ink-muted">
              Doanh thu ước tính = học phí tháng đầu của các bé nhập học trong tháng. Để trống khóa nào chưa có giá — hệ thống
              sẽ báo thiếu thay vì tự đoán.
            </Text>
            {COURSES.map((c) => (
              <View key={c} className="gap-1">
                <View className="flex-row items-center gap-2">
                  <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] }} />
                  <Text className="text-[13px] font-semibold text-ink">{CATEGORY_LABELS[c]}</Text>
                </View>
                <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4">
                  <TextInput
                    value={draft[c] ? formatInt(Number(draft[c])) : ''}
                    onChangeText={(t) => {
                      setDraft((d) => ({ ...d, [c]: digits(t) }));
                      setError(null);
                    }}
                    keyboardType="number-pad"
                    placeholder="Chưa nhập"
                    placeholderTextColor={COLORS.subtle}
                    accessibilityLabel={`Học phí một tháng, ${CATEGORY_LABELS[c]}`}
                    className="h-12 flex-1 text-[15px] text-ink"
                  />
                  <Text className="text-[13px] text-ink-muted">đ / tháng</Text>
                </View>
              </View>
            ))}
            {!!error && <Text className="text-xs text-red-600">{error}</Text>}
            <View className="flex-row gap-2.5 pt-1">
              <Button className="flex-1" title="Hủy" variant="outline" onPress={onClose} disabled={busy} />
              <Button className="flex-[2]" title="Lưu học phí" loading={busy} onPress={save} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
