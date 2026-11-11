import { CheckCircle2, Eye, Share2, Wand2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, ScreenHeader, Select, type SelectOption } from '@/components';
import type { RootStackScreenProps } from '@/navigation/types';
import FeedVideoCard from '@/screens/Home/components/FeedVideoCard';
import { canCaptureFrame, captureVideoFrame, pickImage, pickVideo } from '@/services/media/mediaPicker';
import { buildShareUrl, shareMessage } from '@/services/media/shareLinks';
import { checkMedia, MAX_VIDEO_MB } from '@/services/media/storageUpload';
import { useStaffStore, useVideoAdminStore } from '@/store';
import type { AdminVideo, CourseCategory, FeedItem, PickedMedia, VideoDraft } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS, COURSE_CATEGORIES } from '@/utils/constants';
import { TEACHERS } from '@/utils/mockData';
import { confirmAsync, shareText, useAppWidth } from '@/utils/platform';

import MediaField from './components/MediaField';
import TagInput from './components/TagInput';
import UploadProgressModal from './components/UploadProgressModal';

const COURSE_OPTIONS: SelectOption<CourseCategory>[] = COURSE_CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_LABELS[c],
  color: CATEGORY_COLORS[c],
}));

const TAG_SUGGESTIONS: Record<CourseCategory, string[]> = {
  TIEN_TIEU_HOC: ['#TienTieuHoc', '#VaoLop1', '#ChuanBiVaoLop1', '#THEDU'],
  LUYEN_CHU_DEP: ['#LuyenChuDep', '#VoSachChuDep', '#HocSinhLop1', '#THEDU'],
  TOAN_TU_DUY: ['#ToanTuDuy', '#TinhNham', '#TuDuyLogic', '#THEDU'],
  BOI_DUONG_TOAN_TV: ['#BoiDuongToanTV', '#OnThiHocKy', '#TiengViet', '#THEDU'],
};

const ctaSuggestion = (c: CourseCategory) => `🎁 ĐĂNG KÝ HỌC THỬ ${CATEGORY_LABELS[c].toUpperCase()} MIỄN PHÍ`;

type Errors = Partial<Record<'video' | 'thumbnail' | 'title' | 'teacherName' | 'ctaText', string>>;

function validate(d: VideoDraft, existing?: AdminVideo): Errors {
  const e: Errors = {};
  if (!d.video && !existing) e.video = 'Chọn video để đăng.';
  else if (d.video) e.video = checkMedia(d.video, 'video') ?? undefined;
  if (!d.thumbnail && !existing) e.thumbnail = 'Chọn ảnh bìa — ảnh này hiện khi video chưa phát và khi chia sẻ.';
  else if (d.thumbnail) e.thumbnail = checkMedia(d.thumbnail, 'image') ?? undefined;
  const t = d.title.trim();
  if (t.length < 3) e.title = 'Tiêu đề tối thiểu 3 ký tự.';
  else if (t.length > 200) e.title = 'Tiêu đề tối đa 200 ký tự.';
  if (d.teacherName.trim().length < 2) e.teacherName = 'Nhập tên giáo viên.';
  const c = d.ctaText.trim().length;
  if (c < 3 || c > 80) e.ctaText = 'Nút kêu gọi cần 3–80 ký tự.';
  (Object.keys(e) as (keyof Errors)[]).forEach((k) => e[k] === undefined && delete e[k]);
  return e;
}

export default function VideoEditorScreen({ navigation, route }: RootStackScreenProps<'VideoEditor'>) {
  const insets = useSafeAreaInsets();
  const width = useAppWidth();
  const { isStaff, status: authStatus } = useStaffStore();
  const { videos, saving, progress, error: saveError, save } = useVideoAdminStore();
  const existing = useMemo(() => videos.find((v) => v.id === route.params?.id), [videos, route.params?.id]);

  const [draft, setDraft] = useState<VideoDraft>(() =>
    existing
      ? { title: existing.title, category: existing.category, teacherName: existing.teacherName, teacherAvatar: existing.teacherAvatar, tags: existing.tags, ctaText: existing.ctaText }
      : { title: '', category: 'TOAN_TU_DUY', teacherName: TEACHERS[0].name, teacherAvatar: TEACHERS[0].avatarUrl, tags: [], ctaText: ctaSuggestion('TOAN_TU_DUY') },
  );
  const [ctaEdited, setCtaEdited] = useState(!!existing);
  const [errors, setErrors] = useState<Errors>({});
  const [pickError, setPickError] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [saved, setSaved] = useState<AdminVideo | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
  }, [authStatus, isStaff, navigation]);

  const patch = (p: Partial<VideoDraft>) => {
    setDraft((d) => ({ ...d, ...p }));
    // Editing a field clears its error right away (re-validated on the next submit).
    setErrors((e) => {
      const keys = Object.keys(p).filter((k) => k in e);
      if (!keys.length) return e;
      const next = { ...e };
      keys.forEach((k) => delete next[k as keyof Errors]);
      return next;
    });
  };

  const setCategory = (c: CourseCategory) => patch(ctaEdited ? { category: c } : { category: c, ctaText: ctaSuggestion(c) });

  const choose = async (kind: 'video' | 'image') => {
    setPickError(null);
    try {
      const media = kind === 'video' ? await pickVideo() : await pickImage();
      if (!media) return;
      const err = checkMedia(media, kind);
      if (kind === 'video') {
        patch({ video: media });
        // Web: generate a cover automatically if none chosen yet.
        if (!err && canCaptureFrame && !draft.thumbnail && !existing) {
          const frame = await captureVideoFrame(media);
          if (frame) patch({ thumbnail: frame });
        }
      } else {
        patch({ thumbnail: media });
      }
      setErrors((e) => ({ ...e, [kind === 'video' ? 'video' : 'thumbnail']: err ?? undefined }));
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Không chọn được file.');
    }
  };

  const grabFrame = async (video: PickedMedia) => {
    const frame = await captureVideoFrame(video);
    if (frame) patch({ thumbnail: frame });
  };

  const submit = async (publish: boolean) => {
    const e = validate(draft, existing);
    setErrors(e);
    if (Object.keys(e).length) return;
    const result = await save(draft, publish, existing);
    if (result) setSaved(result);
  };

  const leave = async () => {
    const dirty = !saved && (draft.video || draft.thumbnail || (!existing && draft.title));
    if (!dirty || (await confirmAsync('Bỏ bài đăng?', 'Video và nội dung đang soạn sẽ không được lưu.', 'Bỏ'))) {
      navigation.canGoBack() ? navigation.goBack() : navigation.navigate('StaffVideos');
    }
  };

  const previewItem: FeedItem = {
    id: existing?.id ?? 'preview',
    title: draft.title.trim() || 'Tiêu đề video sẽ hiện ở đây…',
    videoUrl: draft.video?.uri ?? existing?.videoUrl ?? '',
    thumbnailUrl: draft.thumbnail?.uri ?? existing?.thumbnailUrl ?? '',
    category: draft.category,
    teacherName: draft.teacherName || 'Giáo viên',
    teacherAvatar: draft.teacherAvatar,
    tags: draft.tags,
    ctaText: draft.ctaText || ctaSuggestion(draft.category),
    ctaLink: '',
  };

  // ── Success ──────────────────────────────────────────────────────────────
  if (saved) {
    const url = buildShareUrl(saved.shareSlug);
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-6" style={{ paddingBottom: insets.bottom }}>
        <CheckCircle2 size={64} color="#10B981" />
        <Text className="text-center text-xl font-extrabold text-ink">
          {saved.isPublished ? 'Đã đăng video lên EduFeed! 🎉' : 'Đã lưu bản nháp'}
        </Text>
        <Text className="text-center text-[13px] leading-5 text-ink-muted">
          {saved.isPublished
            ? 'Phụ huynh đã có thể xem video. Chia sẻ link lên Facebook, Zalo, nhóm phụ huynh — mỗi lượt đăng ký qua link được ghi nhận cho video này.'
            : 'Video chưa hiển thị với phụ huynh. Bật "Hiển thị" trong danh sách khi sẵn sàng.'}
        </Text>
        {saved.isPublished && url && (
          <View className="w-full gap-2 rounded-2xl bg-white p-3">
            <Text className="text-xs font-semibold text-ink-muted">Link chia sẻ</Text>
            <Text selectable className="text-[13px] font-semibold text-brand-600">
              {url}
            </Text>
          </View>
        )}
        <View className="w-full gap-2.5">
          {saved.isPublished && url && (
            <Button
              title="Chia sẻ link video"
              variant="accent"
              size="lg"
              icon={<Share2 size={18} color="#fff" />}
              onPress={() => shareText(shareMessage(saved.title, url))}
            />
          )}
          <Button title="Về danh sách video" variant="outline" onPress={() => navigation.navigate('StaffVideos')} />
          {!existing && (
            <Button
              title="Đăng video khác"
              variant="ghost"
              onPress={() => {
                setSaved(null);
                setDraft({ title: '', category: draft.category, teacherName: draft.teacherName, teacherAvatar: draft.teacherAvatar, tags: [], ctaText: ctaSuggestion(draft.category) });
                setCtaEdited(false);
                setErrors({});
              }}
            />
          )}
        </View>
      </View>
    );
  }

  // ── Editor ───────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView className="flex-1 bg-surface" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={existing ? 'Sửa video' : 'Đăng video mới'} onBack={leave} />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-6" keyboardShouldPersistTaps="handled">
        <Section step={1} title="Video & ảnh bìa">
          <MediaField
            kind="video"
            label="Video"
            hint={`MP4/MOV, tối đa ${MAX_VIDEO_MB} MB. Nên quay dọc, 30–90 giây, xuất 720p.`}
            media={draft.video}
            existingUri={existing?.videoUrl}
            onPick={() => choose('video')}
            error={errors.video}
          />
          <MediaField
            kind="image"
            label="Ảnh bìa"
            hint="Ảnh hiện trước khi video phát và khi chia sẻ link. JPG/PNG, tối đa 5 MB."
            media={draft.thumbnail}
            existingUri={existing?.thumbnailUrl}
            onPick={() => choose('image')}
            error={errors.thumbnail}
            extra={
              canCaptureFrame && draft.video ? (
                <Pressable
                  onPress={() => grabFrame(draft.video!)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 active:bg-brand-100"
                >
                  <Wand2 size={13} color={COLORS.brand} />
                  <Text className="text-xs font-semibold text-brand-700">Lấy ảnh từ video</Text>
                </Pressable>
              ) : undefined
            }
          />
          {!!pickError && <Text className="text-xs text-red-500">{pickError}</Text>}
        </Section>

        <Section step={2} title="Nội dung">
          <View className="gap-1.5">
            <Text className="text-[13px] font-semibold text-ink-muted">Tiêu đề / mô tả ngắn</Text>
            <TextInput
              value={draft.title}
              onChangeText={(title) => patch({ title })}
              placeholder="VD: Tính nhẩm siêu tốc trong phạm vi 100 chỉ 3 giây 🚀"
              placeholderTextColor={COLORS.subtle}
              multiline
              maxLength={200}
              className={`min-h-[84px] rounded-2xl border bg-white px-4 py-3 text-[15px] text-ink ${errors.title ? 'border-red-400' : 'border-slate-200'}`}
              style={{ textAlignVertical: 'top' }}
            />
            <View className="flex-row justify-between">
              <Text className="text-xs text-red-500">{errors.title ?? ''}</Text>
              <Text className="text-xs text-ink-subtle">{draft.title.length}/200</Text>
            </View>
          </View>

          <Select label="Khóa học" value={draft.category} options={COURSE_OPTIONS} onChange={setCategory} />

          <View className="gap-1.5">
            <Text className="text-[13px] font-semibold text-ink-muted">Giáo viên trong video</Text>
            <View className="flex-row flex-wrap gap-2">
              {TEACHERS.map((t) => {
                const active = draft.teacherName === t.name;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => patch({ teacherName: t.name, teacherAvatar: t.avatarUrl })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    className={`flex-row items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 ${active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
                  >
                    <Avatar uri={t.avatarUrl} name={t.name} size={28} />
                    <Text className={`text-sm font-semibold ${active ? 'text-brand-700' : 'text-ink'}`}>{t.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={draft.teacherName}
              onChangeText={(teacherName) => patch({ teacherName, teacherAvatar: TEACHERS.find((t) => t.name === teacherName)?.avatarUrl ?? '' })}
              placeholder="Hoặc nhập tên giáo viên khác"
              placeholderTextColor={COLORS.subtle}
              className={`h-11 rounded-2xl border bg-white px-4 text-[14px] text-ink ${errors.teacherName ? 'border-red-400' : 'border-slate-200'}`}
            />
            {!!errors.teacherName && <Text className="text-xs text-red-500">{errors.teacherName}</Text>}
          </View>

          <TagInput value={draft.tags} onChange={(tags) => patch({ tags })} suggestions={TAG_SUGGESTIONS[draft.category]} />

          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] font-semibold text-ink-muted">Nút kêu gọi đăng ký</Text>
              {ctaEdited && (
                <Pressable
                  onPress={() => {
                    patch({ ctaText: ctaSuggestion(draft.category) });
                    setCtaEdited(false);
                  }}
                  hitSlop={6}
                >
                  <Text className="text-xs font-semibold text-brand-600">Dùng gợi ý</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              value={draft.ctaText}
              onChangeText={(ctaText) => {
                setCtaEdited(true);
                patch({ ctaText });
              }}
              maxLength={80}
              placeholderTextColor={COLORS.subtle}
              className={`h-11 rounded-2xl border bg-white px-4 text-[14px] font-semibold text-ink ${errors.ctaText ? 'border-red-400' : 'border-slate-200'}`}
            />
            <Text className="text-xs text-ink-subtle">
              Bấm nút này, phụ huynh vào thẳng form đăng ký học thử {CATEGORY_LABELS[draft.category]} — lượt đăng ký được ghi cho video.
            </Text>
            {!!errors.ctaText && <Text className="text-xs text-red-500">{errors.ctaText}</Text>}
          </View>
        </Section>

        <Section step={3} title="Xem trước như phụ huynh thấy">
          <View className="-mx-4">
            <FeedVideoCard
              item={previewItem}
              height={Math.round((width - 32) * 1.25)}
              active={previewPlaying && !!previewItem.videoUrl}
              muted
              liked={false}
              following={false}
              onToggleMute={() => {}}
              onLike={() => {}}
              onFollow={() => {}}
              onCta={() => {}}
            />
          </View>
          {!!previewItem.videoUrl && (
            <Button
              title={previewPlaying ? 'Dừng xem thử' : 'Phát xem thử'}
              variant="outline"
              size="sm"
              icon={<Eye size={16} color="#1E54E0" />}
              onPress={() => setPreviewPlaying((p) => !p)}
            />
          )}
        </Section>
      </ScrollView>

      <View className="gap-2 border-t border-slate-200 bg-white px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {!!saveError && <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-600">{saveError}</Text>}
        {Object.keys(errors).length > 0 && (
          <Text className="text-center text-xs text-red-500">Vui lòng kiểm tra các mục được đánh dấu đỏ.</Text>
        )}
        <View className="flex-row gap-2.5">
          <Button className="flex-1" title="Lưu nháp" variant="outline" disabled={saving} onPress={() => submit(false)} />
          <Button className="flex-[2]" title={existing?.isPublished ? 'Lưu & cập nhật' : 'Đăng ngay'} variant="accent" loading={saving} onPress={() => submit(true)} />
        </View>
      </View>

      <UploadProgressModal visible={saving} progress={progress} />
    </KeyboardAvoidingView>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3.5 rounded-3xl bg-white p-4">
      <View className="flex-row items-center gap-2.5">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-brand-500">
          <Text className="text-[13px] font-extrabold text-white">{step}</Text>
        </View>
        <Text className="flex-1 text-base font-bold text-ink" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
