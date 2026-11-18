import { ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components';
import { createCommunityPost, POST_KINDS, postProblem, type PostKind } from '@/services/community';
import { pickImage } from '@/services/media/mediaPicker';
import { checkMedia } from '@/services/media/storageUpload';
import type { PickedMedia } from '@/types';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';

/** Bottom sheet: kind, text, optional photo — with the community rules right above the button. */
export default function PostComposer({ visible, onClose, onPosted }: { visible: boolean; onClose: () => void; onPosted: () => void }) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<PostKind | null>(null);
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<PickedMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPhoto = async () => {
    setError(null);
    try {
      const p = await pickImage();
      if (!p) return;
      const problem = checkMedia(p, 'image');
      if (problem) return setError(problem);
      setPhoto(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không chọn được ảnh');
    }
  };

  const submit = async () => {
    const problem = postProblem(kind, body);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await createCommunityPost({ kind: kind!, body, photo });
      haptics.success();
      setKind(null);
      setBody('');
      setPhoto(null);
      onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa đăng được bài');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="max-h-[90%] rounded-t-3xl bg-white" style={{ paddingBottom: insets.bottom + 12 }} testID="post-composer">
          <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
            <Text className="text-[17px] font-bold text-ink">Viết bài cho cộng đồng</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100">
              <X size={20} color={COLORS.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-3 px-4" keyboardShouldPersistTaps="handled">
            <View className="flex-row flex-wrap gap-2">
              {POST_KINDS.map((k) => {
                const on = k.kind === kind;
                return (
                  <Pressable
                    key={k.kind}
                    onPress={() => setKind(k.kind)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    className={`h-10 flex-row items-center gap-1.5 rounded-full border px-3.5 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
                  >
                    <Text>{k.emoji}</Text>
                    <Text className={`text-[13px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={2000}
              placeholder="Chia sẻ mẹo hay, câu hỏi, hay niềm vui của bé…"
              placeholderTextColor={COLORS.subtle}
              accessibilityLabel="Nội dung bài viết"
              className="min-h-[120px] rounded-2xl border border-slate-200 px-4 py-3 text-[15px] text-ink"
              style={{ textAlignVertical: 'top' }}
              testID="post-body"
            />
            {photo ? (
              <View className="h-28 w-28 overflow-hidden rounded-2xl">
                <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} />
                <Pressable onPress={() => setPhoto(null)} accessibilityLabel="Bỏ ảnh" className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-black/60">
                  <X size={14} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={addPhoto} accessibilityRole="button" className="h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 active:bg-slate-50" testID="post-photo">
                <ImagePlus size={18} color={COLORS.brand} />
                <Text className="text-[14px] font-semibold text-ink">Thêm 1 ảnh (không bắt buộc)</Text>
              </Pressable>
            )}
            <Text className="rounded-xl bg-slate-50 p-3 text-[11px] leading-4 text-ink-muted">
              Cộng đồng chỉ dành cho phụ huynh đang học tại TH EDU. Vui lòng không đăng ảnh rõ mặt bé khác khi chưa được ba mẹ bé đồng ý, không chia sẻ số điện thoại / địa chỉ, không quảng cáo. Bài bị 3 thành viên báo cáo sẽ tạm ẩn để trung tâm xem lại.
            </Text>
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{error}</Text>}
            <Button title="Đăng bài" size="lg" loading={busy} onPress={submit} testID="post-submit" />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
