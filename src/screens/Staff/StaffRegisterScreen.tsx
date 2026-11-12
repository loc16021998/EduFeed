import { CheckCircle2, Lock, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import { ApiError } from '@/services/apiClient';
import { registerStaff, validateRegistration, type RegisterErrors, type RegisterStaffInput } from '@/services/staffRequests';
import { useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';

import { CreateStaffModal } from './components/AccountModals';

const EMPTY: RegisterStaffInput = { displayName: '', email: '', phone: '', password: '', confirmPassword: '', note: '' };

/**
 * Account registration, one kind per page:
 *  - type 'staff' (from the teacher / staff sign-in): self-registration → pending until an admin approves.
 *  - type 'admin' (from the admin sign-in, dark look): locked — only a signed-in admin can create an admin account.
 */
export default function StaffRegisterScreen({ navigation, route }: RootStackScreenProps<'StaffRegister'>) {
  const { status, isAdmin, email: signedInEmail } = useStaffStore();
  const kind = route.params?.type ?? 'staff';
  const adminKind = kind === 'admin';
  const [form, setForm] = useState<RegisterStaffInput>(EMPTY);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; needsEmailConfirmation: boolean } | null>(null);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const set = (k: keyof RegisterStaffInput) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));
  };

  const submit = async () => {
    const v = validateRegistration(form);
    if (Object.keys(v).length) return setErrors(v);
    setBusy(true);
    try {
      const res = await registerStaff(form);
      setDone({ email: form.email.trim().toLowerCase(), needsEmailConfirmation: res.needsEmailConfirmation });
      setForm(EMPTY);
    } catch (e) {
      const field = e instanceof ApiError ? (e.field as keyof RegisterErrors | undefined) : undefined;
      const message = e instanceof Error ? e.message : 'Đã có lỗi xảy ra';
      setErrors(field && field in EMPTY ? { [field]: message } : { form: message });
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate(adminKind ? 'AdminLogin' : 'StaffLogin'));

  return (
    <KeyboardAvoidingView className={`flex-1 ${adminKind ? 'bg-ink' : 'bg-surface'}`} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        tone={adminKind ? 'dark' : 'light'}
        title={adminKind ? 'Đăng ký tài khoản quản trị' : 'Đăng ký giáo viên / nhân viên'}
        onBack={goBack}
      />
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-2" keyboardShouldPersistTaps="handled">

        {kind === 'staff' ? (
          done ? (
            <View className="items-center gap-3 rounded-3xl bg-white p-6" testID="register-done">
              <CheckCircle2 size={44} color="#059669" />
              <Text className="text-center text-lg font-extrabold text-ink">Đã gửi yêu cầu đăng ký</Text>
              <Text className="text-center text-[13px] leading-5 text-ink-muted">
                {done.needsEmailConfirmation
                  ? `Bước 1: mở email ${done.email} và bấm link xác nhận.\nBước 2: chờ quản trị viên duyệt — sau đó bạn đăng nhập được.`
                  : `Quản trị viên đã nhận được yêu cầu của ${done.email}. Bạn đăng nhập được ngay sau khi được duyệt.`}
              </Text>
              <Button title="Về trang đăng nhập" onPress={() => navigation.navigate('StaffLogin')} className="self-stretch" />
            </View>
          ) : (
            <View className="gap-4">
              <Text className="text-[13px] leading-5 text-ink-muted">
                Tài khoản mới cần <Text className="font-semibold text-ink">quản trị viên duyệt</Text> trước khi dùng được. Quản trị viên sẽ
                nhận thông báo ngay khi bạn gửi.
              </Text>
              {!hasSupabase && __DEV__ && (
                <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Chế độ thử: yêu cầu chỉ lưu tạm trên máy này.</Text>
              )}
              <FormField label="Họ và tên" value={form.displayName} onChangeText={set('displayName')} error={errors.displayName} placeholder="VD: Nguyễn Thị Lan" autoComplete="name" maxLength={60} />
              <FormField label="Email" value={form.email} onChangeText={set('email')} error={errors.email} placeholder="ten@gmail.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              <FormField label="Số điện thoại" value={form.phone} onChangeText={set('phone')} error={errors.phone} placeholder="0912 345 678" keyboardType="phone-pad" autoComplete="tel" />
              <FormField label="Mật khẩu" value={form.password} onChangeText={set('password')} error={errors.password} placeholder="Ít nhất 8 ký tự, có chữ và số" secureTextEntry autoCapitalize="none" autoComplete="new-password" />
              <FormField label="Nhập lại mật khẩu" value={form.confirmPassword} onChangeText={set('confirmPassword')} error={errors.confirmPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
              <FormField label="Vị trí / ghi chú cho quản trị viên (không bắt buộc)" value={form.note} onChangeText={set('note')} error={errors.note} placeholder="VD: Giáo viên Luyện chữ, cơ sở Xa La" maxLength={300} />
              {!!errors.form && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{errors.form}</Text>}
              <Button title="Gửi đăng ký" size="lg" loading={busy} onPress={submit} />
              <Pressable onPress={() => navigation.navigate('StaffLogin')} accessibilityRole="link" className="self-center py-1">
                <Text className="text-[13px] font-semibold text-brand-600">Đã có tài khoản? Đăng nhập</Text>
              </Pressable>
            </View>
          )
        ) : isAdmin ? (
          <View className="gap-3 rounded-3xl bg-white p-5">
            <View className="flex-row items-center gap-2">
              <ShieldCheck size={20} color={COLORS.brand} />
              <Text className="text-[15px] font-bold text-ink">Tạo tài khoản quản trị</Text>
            </View>
            <Text className="text-[13px] leading-5 text-ink-muted">
              Bạn đang đăng nhập bằng tài khoản quản trị ({signedInEmail}). Tài khoản mới sẽ có toàn quyền: xem doanh thu, tạo và khóa tài khoản
              khác.
            </Text>
            <Button title="Tạo tài khoản quản trị" icon={<ShieldCheck size={18} color="#fff" />} onPress={() => setCreatingAdmin(true)} />
          </View>
        ) : (
          <View className="items-center gap-3 rounded-3xl bg-white p-6" testID="admin-locked">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Lock size={26} color={COLORS.muted} />
            </View>
            <Text className="text-center text-[15px] font-bold text-ink">Chỉ quản trị viên được tạo tài khoản quản trị</Text>
            <Text className="text-center text-[13px] leading-5 text-ink-muted">
              {status === 'signedIn'
                ? `Tài khoản ${signedInEmail} không phải quản trị viên nên không tạo được tài khoản quản trị.`
                : 'Đăng nhập bằng tài khoản quản trị để mở khóa.'}
            </Text>
            {status !== 'signedIn' && (
              <Button title="Đăng nhập quản trị để mở khóa" className="self-stretch" onPress={() => navigation.navigate('AdminLogin', { next: 'createAdmin' })} />
            )}
            <Pressable onPress={() => navigation.navigate('StaffRegister', { type: 'staff' })} accessibilityRole="link" className="py-1">
              <Text className="text-center text-[13px] font-semibold text-brand-600">Bạn là giáo viên / nhân viên? Đăng ký tại đây</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <CreateStaffModal visible={creatingAdmin} initialRole="admin" lockRole onClose={() => setCreatingAdmin(false)} onCreated={() => {}} />
    </KeyboardAvoidingView>
  );
}
