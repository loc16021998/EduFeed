import { useIsFocused } from '@react-navigation/native';
import { Lock, ShieldCheck, UserPlus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, Text, TextInput, View, type ImageSourcePropType } from 'react-native';

import logo from '@/assets/branding/logo-th-edu-transparent.png';
import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import { myStaffRequest, type MyRequest } from '@/services/staffRequests';
import { useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';

const LOGO: ImageSourcePropType = typeof logo === 'string' ? { uri: logo } : logo;
// logo-th-edu-transparent.png is 572 × 434 (white background removed).
const LOGO_RATIO = 572 / 434;

/** Sign-in for teachers / staff (StaffLogin, /quan-ly/dang-nhap) and for admins (AdminLogin, /quan-tri/dang-nhap). */
export default function StaffLoginScreen({ navigation, route }: RootStackScreenProps<'StaffLogin' | 'AdminLogin'>) {
  const next = route.params?.next;
  const adminMode = route.name === 'AdminLogin';
  const focused = useIsFocused();
  const { status, isStaff, isAdmin, email: signedInEmail, signIn, signOut } = useStaffStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Signed in → the area for this role: admins to /quan-tri, teachers / staff to /quan-ly.
  // (Came from "Đăng ký tài khoản quản trị": an admin continues straight to creating the account.)
  // Admin sign-in: a teacher account is not sent anywhere — it is told it is not an admin.
  useEffect(() => {
    if (status !== 'signedIn' || !isStaff) return;
    if (next === 'createAdmin' && isAdmin) navigation.replace('StaffRegister', { type: 'admin' });
    else if (isAdmin) navigation.replace('AdminHome');
    else if (!adminMode) navigation.replace('StaffVideos');
  }, [status, isStaff, isAdmin, next, adminMode, navigation]);

  // Signed in without a role: is it a registration waiting for approval?
  const [request, setRequest] = useState<MyRequest | null>(null);
  useEffect(() => {
    if (status === 'signedIn' && !isStaff) myStaffRequest().then(setRequest, () => setRequest(null));
    else setRequest(null);
  }, [status, isStaff]);

  const onSubmit = async () => {
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };

  const signedInWithoutRole = status === 'signedIn' && !isStaff;
  const signedInNotAdmin = adminMode && status === 'signedIn' && isStaff && !isAdmin;

  return (
    <KeyboardAvoidingView className={`flex-1 ${adminMode ? 'bg-ink' : 'bg-surface'}`} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {adminMode && focused && <StatusBar barStyle="light-content" backgroundColor="#0F172A" />}
      <ScreenHeader tone={adminMode ? 'dark' : 'light'} title={adminMode ? 'Đăng nhập quản trị' : 'Đăng nhập nhân viên'} onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Home' }))} />
      <ScrollView contentContainerClassName="gap-5 p-5" keyboardShouldPersistTaps="handled">
        <View className="items-center gap-2 py-2">
          {/* Transparent logo, straight on the page background (dark for admins, light for teachers). */}
          <View testID="login-logo">
            <Image source={LOGO} style={{ width: 170, height: 170 / LOGO_RATIO }} resizeMode="contain" accessibilityLabel="Logo TH EDU" />
          </View>
          {adminMode && (
            <View className="mt-1 flex-row items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
              <ShieldCheck size={14} color="#93B4FF" />
              <Text className="text-xs font-bold uppercase tracking-wide text-[#93B4FF]">Quản trị</Text>
            </View>
          )}
          <Text className={`text-center text-[15px] font-bold ${adminMode ? 'text-white' : 'text-ink'}`}>
            {adminMode ? 'Khu vực quản trị TH EDU' : 'Khu vực dành cho giáo viên & nhân viên TH EDU'}
          </Text>
          <Text className={`text-center text-[13px] leading-5 ${adminMode ? 'text-slate-400' : 'text-ink-muted'}`}>
            {adminMode
              ? 'Dành cho chủ trung tâm / quản lý: tổng quan kinh doanh, học phí, tài khoản nhân viên.'
              : 'Đăng nhập để đăng video lên EduFeed. Phụ huynh không cần tài khoản để sử dụng ứng dụng.'}
          </Text>
        </View>

        {!hasSupabase && __DEV__ && (
          <View className="rounded-2xl bg-amber-50 p-3">
            <Text className="text-xs leading-[18px] text-amber-800">
              Chế độ thử (chưa kết nối Supabase): nhập email bất kỳ và mật khẩu từ 6 ký tự. Email bắt đầu bằng "admin" vào
              trang quản trị, email khác vào trang giáo viên. Dữ liệu thử chỉ lưu tạm trên máy này.
            </Text>
          </View>
        )}

        {/* Admin page: the form sits on a light card over the dark background (readable labels and inputs). */}
        <View className={adminMode ? 'rounded-3xl bg-white p-5' : ''}>
        {signedInNotAdmin ? (
          <View className="gap-3 rounded-2xl bg-amber-50 p-4" testID="not-admin">
            <Text className="text-[13px] leading-5 text-amber-900">
              Tài khoản {signedInEmail} là tài khoản giáo viên / nhân viên, không phải quản trị viên.
            </Text>
            <Button title="Vào khu giáo viên" onPress={() => navigation.replace('StaffVideos')} />
            <Button title="Đăng xuất để đăng nhập quản trị" variant="outline" onPress={signOut} />
          </View>
        ) : signedInWithoutRole ? (
          <View className="gap-3 rounded-2xl bg-red-50 p-4">
            <Text className="text-[13px] leading-5 text-red-700">
              {request?.status === 'PENDING'
                ? `Tài khoản ${signedInEmail} đang chờ quản trị viên duyệt. Bạn sẽ dùng được ngay sau khi được duyệt (đăng xuất rồi đăng nhập lại).`
                : request?.status === 'REJECTED'
                  ? `Yêu cầu đăng ký của ${signedInEmail} đã bị từ chối. Liên hệ quản trị viên nếu đây là nhầm lẫn.`
                  : `Tài khoản ${signedInEmail} chưa được cấp quyền. Liên hệ quản trị viên để được cấp quyền nhân viên.`}
            </Text>
            <Button title="Đăng xuất" variant="outline" onPress={signOut} />
          </View>
        ) : (
          <View className="gap-4">
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="ten@thedu.vn"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />
            <View className="gap-1.5">
              <FormField
                ref={passwordRef}
                label="Mật khẩu"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} className="self-end" accessibilityRole="button">
                <Text className="text-xs font-semibold text-brand-600">{showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</Text>
              </Pressable>
            </View>

            {!!error && (
              <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-600" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            )}

            <Button title="Đăng nhập" size="lg" loading={busy} onPress={onSubmit} />
            {next === 'createAdmin' && (
              <Text className="rounded-xl bg-brand-50 p-2.5 text-xs leading-[18px] text-brand-700">
                Đăng nhập bằng tài khoản quản trị để tiếp tục tạo tài khoản quản trị mới.
              </Text>
            )}

            {adminMode ? (
              <View className="gap-2.5 border-t border-slate-200 pt-4">
                <Pressable
                  onPress={() => navigation.navigate('StaffRegister', { type: 'admin' })}
                  accessibilityRole="button"
                  accessibilityHint="Chỉ quản trị viên đang đăng nhập mới tạo được"
                  className="flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 active:bg-slate-50"
                >
                  <Lock size={16} color={COLORS.muted} />
                  <Text className="text-[15px] font-semibold text-ink">Đăng ký tài khoản quản trị</Text>
                </Pressable>
                <Text className="text-center text-[11px] leading-4 text-ink-subtle">
                  Chỉ quản trị viên đang đăng nhập mới tạo được tài khoản quản trị mới.
                </Text>
                <Pressable onPress={() => navigation.navigate('StaffLogin')} accessibilityRole="link" className="items-center pt-1">
                  <Text className="text-[13px] font-semibold text-brand-600">Bạn là giáo viên / nhân viên? Đăng nhập tại đây</Text>
                </Pressable>
              </View>
            ) : (
              <View className="gap-2.5 border-t border-slate-200 pt-4">
                <Text className="text-center text-[13px] font-semibold text-ink-muted">Chưa có tài khoản?</Text>
                <Pressable
                  onPress={() => navigation.navigate('StaffRegister', { type: 'staff' })}
                  accessibilityRole="button"
                  className="flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 active:bg-slate-50"
                >
                  <UserPlus size={18} color={COLORS.brand} />
                  <Text className="text-[15px] font-semibold text-ink">Đăng ký giáo viên / nhân viên</Text>
                </Pressable>
                <Text className="text-center text-[11px] leading-4 text-ink-subtle">Tài khoản mới cần quản trị viên duyệt trước khi dùng.</Text>
              </View>
            )}
          </View>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
