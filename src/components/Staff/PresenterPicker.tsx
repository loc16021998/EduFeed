import { Camera, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import { SettingsSheet } from '@/components/Settings/SettingsSection';
import { StatusBanner } from '@/components/ux';
import FormField from '@/screens/Booking/components/FormField';
import { pickImage } from '@/services/media/mediaPicker';
import { useFeedStore } from '@/store/useFeedStore';
import { FALLBACK_PRESENTERS, listPresenters, presenterNameProblem, savePresenter, uploadPresenterAvatar, type Presenter } from '@/services/presenters';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';
import { confirmAsync } from '@/utils/platform';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Không thực hiện được, vui lòng thử lại.');

interface Props {
  /** Selected teacher name (free text is allowed too). */
  value: string;
  onChange: (p: { name: string; avatarUrl: string }) => void;
  error?: string;
  /** What the content is called in messages ("video" / "bài"). */
  noun?: string;
}

/**
 * "Giáo viên trong video": pick a teacher, change their photo in one tap, or add a new teacher.
 * A new photo can be applied to that teacher's older videos too, so EduFeed stays consistent.
 */
export default function PresenterPicker({ value, onChange, error, noun = 'video' }: Props) {
  const [list, setList] = useState<Presenter[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    listPresenters().then(
      (l) => {
        setList(l);
        setLoadError(null);
      },
      (e) => setLoadError(msg(e)),
    );
  }, []);
  useEffect(load, [load]);

  const items = list ?? FALLBACK_PRESENTERS;
  const selected = items.find((p) => p.name.trim().toLowerCase() === value.trim().toLowerCase()) ?? null;

  // Keep the draft's avatar in sync with the presenter list (e.g. a photo changed on another phone).
  useEffect(() => {
    if (selected && list) onChange({ name: selected.name, avatarUrl: selected.avatarUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const changePhoto = async () => {
    if (!selected) return;
    setNotice(null);
    try {
      const media = await pickImage();
      if (!media) return;
      setBusy(true);
      const url = await uploadPresenterAvatar(media);
      const others = Math.max(0, selected.videos);
      const apply = others === 0 ? true : await confirmAsync('Cập nhật video cũ?', `Đổi ảnh cho cả ${others} ${noun} đã đăng của ${selected.name}?`, 'Đổi tất cả');
      const r = await savePresenter({ id: selected.id, name: selected.name, avatarUrl: url, applyExisting: apply });
      setList((l) => (l ?? FALLBACK_PRESENTERS).map((p) => (p.id === selected.id || p.name === selected.name ? { ...p, id: r.presenter.id, avatarUrl: r.presenter.avatarUrl } : p)));
      onChange({ name: r.presenter.name, avatarUrl: r.presenter.avatarUrl });
      haptics.success();
      const total = r.updatedVideos + r.updatedPosts;
      // EduFeed shows the new photo right away (without waiting for a pull-to-refresh).
      if (r.updatedVideos > 0) useFeedStore.getState().load().catch(() => {});
      setNotice({ ok: true, text: `Đã đổi ảnh của ${selected.name}${total > 0 ? ` · cập nhật ${total} bài đã đăng` : ''}.` });
    } catch (e) {
      setNotice({ ok: false, text: msg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2" testID="presenter-picker">
      <Text className="text-[13px] font-semibold text-ink-muted">Giáo viên trong {noun}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {items.map((p) => {
          const on = selected?.id === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                haptics.light();
                onChange({ name: p.name, avatarUrl: p.avatarUrl });
              }}
              accessibilityRole="radio"
              aria-checked={on}
              accessibilityState={{ checked: on }}
              className={`min-h-11 flex-row items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
              testID="presenter-option"
            >
              <Avatar uri={p.avatarUrl || undefined} name={p.name} size={30} />
              <Text className={`text-sm font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{p.name}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border-2 border-dashed border-slate-300 px-3.5 active:bg-slate-50"
          testID="presenter-add"
        >
          <Plus size={16} color={COLORS.ink} />
          <Text className="text-sm font-semibold text-ink">Thêm giáo viên</Text>
        </Pressable>
      </View>

      {selected && (
        <View className="flex-row items-center gap-3 rounded-2xl bg-slate-50 p-3" testID="presenter-selected">
          <Pressable onPress={changePhoto} disabled={busy} accessibilityRole="button" accessibilityLabel={`Đổi ảnh đại diện của ${selected.name}`} hitSlop={4} testID="presenter-photo">
            <Avatar uri={selected.avatarUrl || undefined} name={selected.name} size={52} />
            <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-500">
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={12} color="#fff" />}
            </View>
          </Pressable>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-ink">{selected.name}</Text>
            <Text className="text-[12px] leading-[17px] text-ink-muted">
              {selected.avatarUrl ? 'Ảnh này hiện trên EduFeed' : 'Chưa có ảnh — đang hiện chữ cái đầu'}
              {selected.videos > 0 ? ` · ${selected.videos} ${noun}` : ''}
            </Text>
          </View>
          <Pressable onPress={changePhoto} disabled={busy} accessibilityRole="button" className="min-h-11 justify-center rounded-xl border border-slate-200 bg-white px-3 active:bg-slate-100" testID="presenter-change-photo">
            <Text className="text-[13px] font-bold text-brand-600">{selected.avatarUrl ? 'Đổi ảnh' : 'Thêm ảnh'}</Text>
          </Pressable>
        </View>
      )}
      {!!error && <Text className="text-xs text-red-500">{error}</Text>}
      {!!notice && <StatusBanner tone={notice.ok ? 'success' : 'error'} text={notice.text} onDismiss={() => setNotice(null)} testID="presenter-notice" />}
      {!!loadError && !list && <Text className="text-xs leading-[17px] text-amber-700">{loadError}</Text>}

      <AddPresenterSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={(p) => {
          setAdding(false);
          setList((l) => [...(l ?? FALLBACK_PRESENTERS).filter((x) => x.id !== p.id), p]);
          onChange({ name: p.name, avatarUrl: p.avatarUrl });
          setNotice({ ok: true, text: `Đã thêm ${p.name}.` });
        }}
      />
    </View>
  );
}

function AddPresenterSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (p: Presenter) => void }) {
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; url: string } | null>(null);
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setName('');
      setPhoto(null);
      setError(null);
    }
  }, [visible]);

  const pick = async () => {
    try {
      const media = await pickImage();
      if (!media) return;
      setBusy('photo');
      const url = await uploadPresenterAvatar(media);
      setPhoto({ uri: media.uri, url });
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    const bad = presenterNameProblem(name);
    if (bad) return setError(bad);
    setBusy('save');
    setError(null);
    try {
      const r = await savePresenter({ id: null, name, avatarUrl: photo?.url ?? '', applyExisting: false });
      haptics.success();
      onAdded(r.presenter);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSheet visible={visible} title="Thêm giáo viên" onClose={onClose} testID="presenter-add-sheet">
      <View className="flex-row items-center gap-3">
        <Avatar uri={photo?.uri} name={name || 'GV'} size={56} />
        <View className="flex-1">
          <Button title={photo ? 'Chọn ảnh khác' : 'Chọn ảnh đại diện'} variant="outline" size="sm" loading={busy === 'photo'} icon={<Camera size={16} color={COLORS.brand} />} onPress={pick} testID="presenter-add-photo" />
        </View>
      </View>
      <FormField label="Tên hiển thị trên EduFeed" value={name} onChangeText={(t) => (setName(t), setError(null))} maxLength={60} placeholder="VD: Cô Lan" testID="presenter-add-name" />
      {!!error && <StatusBanner tone="error" text={error} />}
      <Button title="Thêm giáo viên" size="lg" loading={busy === 'save'} disabled={busy === 'photo'} onPress={save} testID="presenter-add-save" />
      <Text className="text-xs leading-[17px] text-ink-subtle">Nên dùng ảnh chân dung rõ mặt, nền sáng. Ảnh hiện tròn ở góc trên video.</Text>
    </SettingsSheet>
  );
}
