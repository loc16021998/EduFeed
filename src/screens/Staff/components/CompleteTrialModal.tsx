import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components';
import type { CrmLead } from '@/types';
import { COLORS } from '@/utils/constants';

interface Props {
  lead: CrmLead | null;
  busy: boolean;
  onSubmit: (note: string) => Promise<string | null>;
  onClose: () => void;
}

const STARTERS = ['Con tiếp thu nhanh, ', 'Con ngồi học tập trung, ', 'Con cần luyện thêm '];

/** Teacher marks the trial done + writes the feedback the parent receives (T+2h message). */
export default function CompleteTrialModal({ lead, busy, onSubmit, onClose }: Props) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setError(null);
  }, [lead?.id]);

  const len = note.trim().length;
  const submit = async () => {
    if (len < 10) return setError('Viết ít nhất 10 ký tự để phụ huynh nhận được nhận xét có ý nghĩa.');
    const err = await onSubmit(note.trim());
    if (err) setError(err);
  };

  return (
    <Modal visible={!!lead} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        {lead && (
          <View className="gap-3 rounded-t-3xl bg-white p-5">
            <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
              Hoàn thành học thử · {lead.studentName}
            </Text>
            <Text className="text-[13px] leading-5 text-ink-muted">
              Nhận xét này được lưu vào hồ sơ và gửi cho phụ huynh qua Zalo khoảng 2 giờ sau buổi học (khi đã cấu hình mẫu tin
              và ưu đãi).
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <Pressable key={s} onPress={() => setNote((n) => (n ? `${n} ${s}` : s))} className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 active:bg-slate-50">
                  <Text className="text-xs text-ink-muted">+ {s.trim().replace(/,$/, '')}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={note}
              onChangeText={(t) => {
                setNote(t);
                setError(null);
              }}
              multiline
              maxLength={1000}
              placeholder="VD: Gia Bảo cầm bút đúng, viết đều nét; cần luyện thêm nét khuyết và độ cao chữ."
              placeholderTextColor={COLORS.subtle}
              className={`min-h-[110px] rounded-2xl border bg-white px-4 py-3 text-[15px] text-ink ${error ? 'border-red-400' : 'border-slate-200'}`}
              style={{ textAlignVertical: 'top' }}
            />
            <View className="flex-row justify-between">
              <Text className="flex-1 text-xs text-red-500">{error ?? ''}</Text>
              <Text className="text-xs text-ink-subtle">{len}/1000</Text>
            </View>
            <View className="flex-row gap-2.5">
              <Button className="flex-1" title="Để sau" variant="outline" onPress={onClose} disabled={busy} />
              <Button className="flex-[2]" title="Lưu & hoàn thành" variant="accent" loading={busy} onPress={submit} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
