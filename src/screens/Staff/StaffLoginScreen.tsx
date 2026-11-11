import { LockKeyhole } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import { useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';

export default function StaffLoginScreen({ navigation }: RootStackScreenProps<'StaffLogin'>) {
  const { status, isStaff, email: signedInEmail, signIn, signOut } = useStaffStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Already signed in as staff → straight to the video manager.
  useEffect(() => {
    if (status === 'signedIn' && isStaff) navigation.replace('StaffVideos');
  }, [status, isStaff, navigation]);

  const onSubmit = async () => {
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };

  const signedInWithoutRole = status === 'signedIn' && !isStaff;

  return (
    <KeyboardAvoidingView className="flex-1 bg-surface" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Đăng nhập nhân viên" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Home' }))} />
      <ScrollView contentContainerClassName="gap-5 p-5" keyboardShouldPersistTaps="handled">
        <View className="items-center gap-2 py-2">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <LockKeyhole size={30} color={COLORS.brand} />
          </View>
          <Text className="text-center text-[15px] font-bold text-ink">Khu vực dành cho giáo viên & nhân viên TH EDU</Text>
          <Text className="text-center text-[13px] leading-5 text-ink-muted">
            Đăng nhập để đăng video lên EduFeed. Phụ huynh không cần tài khoản để sử dụng ứng dụng.
          </Text>
        </View>

        {!hasSupabase && __DEV__ && (
          <View className="rounded-2xl bg-amber-50 p-3">
            <Text className="text-xs leading-[18px] text-amber-800">
              Chế độ thử (chưa kết nối Supabase): nhập email bất kỳ và mật khẩu từ 6 ký tự. Video đăng thử chỉ lưu tạm trên
              máy này và mất khi tải lại.
            </Text>
          </View>
        )}

        {signedInWithoutRole ? (
          <View className="gap-3 rounded-2xl bg-red-50 p-4">
            <Text className="text-[13px] leading-5 text-red-700">
              Tài khoản {signedInEmail} chưa được cấp quyền đăng video. Liên hệ quản trị viên để được cấp quyền nhân viên.
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
            <Text className="text-center text-[11px] text-ink-subtle">
              Chưa có tài khoản? Quản trị viên tạo trong Supabase → Authentication (xem supabase/README.md).
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
