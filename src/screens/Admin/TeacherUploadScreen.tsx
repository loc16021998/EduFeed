import { CheckCircle2, CloudUpload, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import MediaField from '@/screens/Staff/components/MediaField';
import { pickImage } from '@/services/media/mediaPicker';
import { MAX_IMAGE_MB } from '@/services/media/storageUpload';
import { savePortfolio, validateDraft, type DraftErrors, type PortfolioDraft, type SaveResult } from '@/services/portfolioAdmin';
import { useStaffStore } from '@/store';
import type { CampusLocation, CourseCategory } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { CAMPUSES, TEACHERS } from '@/utils/mockData';

const COURSES: CourseCategory[] = ['LUYEN_CHU_DEP', 'TOAN_TU_DUY', 'TIEN_TIEU_HOC', 'BOI_DUONG_TOAN_TV'];

const EMPTY: PortfolioDraft = {
  displayName: '',
  studentName: '',
  className: '',
  course: null,
  campus: null,
  teacherName: '',
  teacherNote: '',
  duration: '',
  before: null,
  after: null,
  parentConsent: false,
  publish: false,
};

/** Teachers (staff + admins): publish a student's before / after progress from the phone. */
export default function TeacherUploadScreen({ navigation }: RootStackScreenProps<'TeacherUpload'>) {
  const { status: authStatus, isStaff, demo } = useStaffStore();
  const [d, setD] = useState<PortfolioDraft>(EMPTY);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<SaveResult | null>(null);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
  }, [authStatus, isStaff, navigation]);

  const set = <K extends keyof PortfolioDraft>(k: K, v: PortfolioDraft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));
  };

  const choose = async (k: 'before' | 'after') => {
    const m = await pickImage().catch(() => null);
    if (m) set(k, m);
  };

  const submit = async () => {
    const v = validateDraft(d);
    if (Object.keys(v).length) return setErrors(v);
    setProgress(0);
    try {
      setDone(await savePortfolio(d, setProgress));
      setD(EMPTY);
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : 'Đã có lỗi xảy ra' });
    } finally {
      setProgress(null);
    }
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('StaffVideos'));

  if (done) {
    return (
      <View className="flex-1 bg-surface">
        <ScreenHeader title="Đăng nhật ký tiến bộ" onBack={goBack} />
        <View className="mx-5 mt-6 items-center gap-3 rounded-3xl bg-white p-6" testID="portfolio-saved">
          <CheckCircle2 size={44} color="#059669" />
          <Text className="text-center text-lg font-extrabold text-ink">{done.published ? 'Đã đăng nhật ký tiến bộ' : 'Đã lưu bản nháp'}</Text>
          <Text className="text-center text-[13px] leading-5 text-ink-muted">
            {done.published
              ? 'Phụ huynh đã thấy được trong mục Thành quả.'
              : 'Bản nháp chưa hiển thị với phụ huynh. Khi có đồng ý bằng văn bản của phụ huynh, quản trị viên bật hiển thị trong Supabase.'}
          </Text>
          {done.published && <Button className="self-stretch" title="Xem trong Thành quả" onPress={() => navigation.navigate('MainTabs', { screen: 'Portfolio' })} />}
          <Button className="self-stretch" title="Đăng nhật ký khác" variant="outline" onPress={() => setDone(null)} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-surface" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Đăng nhật ký tiến bộ" onBack={goBack} />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-12" keyboardShouldPersistTaps="handled">
        {(demo || !hasSupabase) && (
          <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Chế độ thử: không có gì được tải lên. Kết nối Supabase để đăng thật.</Text>
        )}

        <MediaField kind="image" pickLabel="Chọn ảnh TRƯỚC" label="Ảnh TRƯỚC khi học" hint={`Bài viết / bài làm ngày đầu. JPG/PNG/WEBP, tối đa ${MAX_IMAGE_MB} MB.`} media={d.before ?? undefined} onPick={() => choose('before')} error={errors.before} />
        <MediaField kind="image" pickLabel="Chọn ảnh SAU" label="Ảnh SAU khi học" hint="Cùng loại bài, chụp cùng góc để phụ huynh dễ so sánh." media={d.after ?? undefined} onPick={() => choose('after')} error={errors.after} />
        <Text className="-mt-2 text-[11px] leading-4 text-ink-subtle">Không chụp khuôn mặt hay thông tin cá nhân của bé (tên trường, địa chỉ…) trong ảnh.</Text>

        <FormField label="Tên hiển thị cho phụ huynh" value={d.displayName} onChangeText={(t) => set('displayName', t)} error={errors.displayName} placeholder="VD: Bé Gia Bảo" maxLength={60} />
        <FormField label="Họ tên học sinh (chỉ nhân viên thấy)" value={d.studentName} onChangeText={(t) => set('studentName', t)} error={errors.studentName} placeholder="VD: Trần Gia Bảo" maxLength={60} />
        <FormField label="Lớp (không bắt buộc)" value={d.className} onChangeText={(t) => set('className', t)} error={errors.className} placeholder="VD: Lớp 1" maxLength={40} />

        <Chips label="Khóa học" error={errors.course} options={COURSES.map((c) => ({ id: c, label: CATEGORY_LABELS[c], color: CATEGORY_COLORS[c] }))} value={d.course} onChange={(v) => set('course', v as CourseCategory)} />
        <Chips label="Cơ sở" error={errors.campus} options={CAMPUSES.map((c) => ({ id: c.id, label: c.name.replace(/^Cơ sở\s*/, '') }))} value={d.campus} onChange={(v) => set('campus', v as CampusLocation)} />

        <View className="gap-1.5">
          <FormField label="Giáo viên" value={d.teacherName} onChangeText={(t) => set('teacherName', t)} error={errors.teacherName} placeholder="VD: Cô Hường" maxLength={60} />
          <View className="flex-row flex-wrap gap-1.5">
            {TEACHERS.map((t) => (
              <Pressable key={t.id} onPress={() => set('teacherName', t.name)} accessibilityRole="button" className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 active:bg-slate-50">
                <Text className="text-xs text-ink-muted">{t.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <FormField label="Thời gian học" value={d.duration} onChangeText={(t) => set('duration', t)} error={errors.duration} placeholder="VD: 2 tháng" maxLength={30} />

        <View className="gap-1.5">
          <Text className="text-[13px] font-semibold text-ink-muted">Nhận xét của giáo viên</Text>
          <TextInput
            value={d.teacherNote}
            onChangeText={(t) => set('teacherNote', t)}
            multiline
            maxLength={600}
            placeholder="Cụ thể và trung thực, VD: Gia Bảo cầm bút đúng tư thế, chữ đều nét hơn; cần luyện thêm nét khuyết."
            placeholderTextColor={COLORS.subtle}
            accessibilityLabel="Nhận xét của giáo viên"
            className={`min-h-[110px] rounded-2xl border bg-white px-4 py-3 text-[15px] text-ink ${errors.teacherNote ? 'border-red-400' : 'border-slate-200'}`}
            style={{ textAlignVertical: 'top' }}
          />
          <View className="flex-row">
            <Text className="flex-1 text-xs text-red-500">{errors.teacherNote ?? ''}</Text>
            <Text className="text-xs text-ink-subtle">{d.teacherNote.trim().length}/600</Text>
          </View>
        </View>

        <View className="gap-2 rounded-2xl border border-slate-200 bg-white p-3.5">
          <Check value={d.parentConsent} onChange={(v) => {
              set('parentConsent', v);
              if (!v) set('publish', false);
            }} label="Phụ huynh đã đồng ý bằng văn bản cho đăng công khai" testID="consent" />
          <Check value={d.publish} onChange={(v) => set('publish', v)} label="Hiển thị ngay cho phụ huynh (mục Thành quả)" disabled={!d.parentConsent} testID="publish" />
          {!!errors.parentConsent && <Text className="text-xs text-red-600">{errors.parentConsent}</Text>}
          <View className="flex-row items-start gap-1.5">
            <ShieldCheck size={14} color={COLORS.muted} />
            <Text className="flex-1 text-[11px] leading-4 text-ink-muted">Chưa có đồng ý → lưu bản nháp, phụ huynh không thấy. Lưu giấy đồng ý tại trung tâm.</Text>
          </View>
        </View>

        {!!errors.form && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{errors.form}</Text>}
        <Button title={d.publish && d.parentConsent ? 'Đăng nhật ký' : 'Lưu bản nháp'} size="lg" icon={<CloudUpload size={20} color="#fff" />} onPress={submit} loading={progress !== null} />
      </ScrollView>

      <Modal visible={progress !== null} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50 p-8">
          <View className="w-full max-w-[320px] gap-3 rounded-3xl bg-white p-6">
            <Text className="text-center text-[15px] font-bold text-ink">Đang tải ảnh lên… {Math.round((progress ?? 0) * 100)}%</Text>
            <View className="h-2 overflow-hidden rounded-full bg-slate-100">
              <View className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </View>
            <Text className="text-center text-xs text-ink-muted">Giữ màn hình này cho tới khi xong.</Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Chips({ label, options, value, onChange, error }: { label: string; options: { id: string; label: string; color?: string }[]; value: string | null; onChange: (id: string) => void; error?: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-ink-muted">{label}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {options.map((o) => {
          const active = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 ${active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
            >
              {!!o.color && <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: o.color }} />}
              <Text className={`text-[13px] font-semibold ${active ? 'text-brand-700' : 'text-ink'}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {!!error && <Text className="text-xs text-red-500">{error}</Text>}
    </View>
  );
}

function Check({ value, onChange, label, disabled, testID }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; testID?: string }) {
  const on = value && !disabled;
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      testID={testID}
      className={`flex-row items-center gap-2.5 ${disabled ? 'opacity-50' : ''}`}
    >
      <View className={`h-5 w-5 items-center justify-center rounded-md border-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'}`}>
        {on && <Text className="text-[11px] font-black text-white">✓</Text>}
      </View>
      <Text className="flex-1 text-[13px] text-ink">{label}</Text>
    </Pressable>
  );
}
