import { MessageCircleMore, ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader } from '@/components';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import FormField from '@/screens/Booking/components/FormField';
import { ApiError } from '@/services/apiClient';
import { DEMO_EXISTING_PHONE, DEMO_OTP, requestParentOtp, signupParent, verifyParentOtp, type Relationship } from '@/services/parentPortal';
import { useParentStore } from '@/store';
import type { CampusLocation } from '@/types';
import { CAMPUS_LABELS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';

import { normalizeVnMobile } from '../../../supabase/functions/_shared/parentAuth';

type Step = 'phone' | 'otp' | 'profile';
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra, vui lòng thử lại.');
const RELATIONSHIPS: { id: Relationship; label: string }[] = [
  { id: 'MOM', label: 'Mẹ' },
  { id: 'DAD', label: 'Bố' },
  { id: 'OTHER', label: 'Người thân' },
];

/** Parents: phone → 4-digit code over Zalo → (new number) quick profile → parent portal. */
export default function ParentAuthScreen({ navigation }: RootStackScreenProps<'ParentAuth'>) {
  const insets = useSafeAreaInsets();
  const onSignedIn = useParentStore((s) => s.onSignedIn);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [signupToken, setSignupToken] = useState('');
  const [parentName, setParentName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('MOM');
  const [childName, setChildName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [campus, setCampus] = useState<CampusLocation | null>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const fail = (e: unknown) => setError({ field: e instanceof ApiError ? e.field : undefined, message: msg(e) });

  const finish = async () => {
    await onSignedIn();
    navigation.replace('ParentPortal');
  };

  const sendCode = async () => {
    setError(null);
    if (!normalizeVnMobile(phone)) return setError({ field: 'phone', message: 'Số điện thoại không hợp lệ (VD: 0912 345 678 hoặc +84 912 345 678)' });
    setBusy(true);
    try {
      const r = await requestParentOtp(phone);
      setResendIn(r.resendAfterSec);
      setCode('');
      setStep('otp');
      setTimeout(() => codeRef.current?.focus(), 250);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async (value = code) => {
    if (!/^\d{4}$/.test(value)) return setError({ field: 'code', message: 'Nhập đủ 4 chữ số' });
    setError(null);
    setBusy(true);
    try {
      const r = await verifyParentOtp(phone, value);
      if (r.status === 'SIGNED_IN') return await finish();
      setSignupToken(r.signupToken);
      setStep('profile');
    } catch (e) {
      fail(e);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const createProfile = async () => {
    setError(null);
    if (parentName.trim().length < 2) return setError({ field: 'parentName', message: 'Nhập tên của ba mẹ' });
    if (childName.trim().length < 2) return setError({ field: 'childName', message: 'Nhập tên của bé' });
    const year = birthYear.trim() ? Number(birthYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 2008 || year > 2035)) return setError({ field: 'birthYear', message: 'Năm sinh không hợp lệ (VD: 2019)' });
    if (!campus) return setError({ field: 'campus', message: 'Chọn cơ sở gần nhà' });
    setBusy(true);
    try {
      await signupParent({ phone, signupToken, parentName, childName, birthYear: year, campus, relationship });
      await finish();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (f: string) => (error?.field === f ? error.message : undefined);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-surface">
      <ScreenHeader
        title={step === 'profile' ? 'Thông tin gia đình' : 'Đăng nhập phụ huynh'}
        onBack={() => {
          if (step === 'otp') return setStep('phone');
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.navigate('MainTabs', { screen: 'Home' });
        }}
      />
      <ScrollView contentContainerClassName="gap-4 px-5 pt-2" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" testID="parent-auth">
        {!hasSupabase && (
          <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
            Dữ liệu mẫu: mã thử là {DEMO_OTP}. Số {formatPhone(DEMO_EXISTING_PHONE)} là tài khoản trung tâm đã tạo sẵn (2 bé); số khác sẽ tạo tài khoản mới.
          </Text>
        )}

        {step === 'phone' && (
          <>
            <View className="gap-1.5">
              <Text className="text-[22px] font-extrabold leading-7 text-ink" accessibilityRole="header">
                Sổ liên lạc điện tử của bé
              </Text>
              <Text className="text-[14px] leading-5 text-ink-muted">Xem nhận xét mỗi buổi học, số buổi còn lại, báo nghỉ và đóng học phí. Không cần mật khẩu.</Text>
            </View>
            <FormField
              label="Số điện thoại của ba mẹ"
              value={phone}
              onChangeText={(t) => {
                setPhone(t.replace(/[^\d+ .]/g, ''));
                setError(null);
              }}
              placeholder="VD: 0912 345 678"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={16}
              error={fieldError('phone')}
              onSubmitEditing={sendCode}
            />
            {!!error && !error.field && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error.message}</Text>}
            <Button title="Nhận mã qua Zalo" size="lg" loading={busy} onPress={sendCode} icon={<MessageCircleMore size={18} color="#fff" />} />
            <Text className="text-center text-xs leading-[18px] text-ink-subtle">Mã 4 số được gửi qua Zalo tới số điện thoại này (số cần đã đăng ký Zalo).</Text>
          </>
        )}

        {step === 'otp' && (
          <>
            <View className="gap-1.5">
              <Text className="text-[22px] font-extrabold text-ink" accessibilityRole="header">
                Nhập mã xác thực
              </Text>
              <Text className="text-[14px] leading-5 text-ink-muted">
                Mã 4 số đã gửi qua Zalo tới <Text className="font-bold text-ink">{formatPhone(normalizeVnMobile(phone) ?? phone)}</Text>. Mã có hiệu lực 5 phút.
              </Text>
            </View>
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 4);
                setCode(v);
                setError(null);
                if (v.length === 4 && !busy) checkCode(v);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={4}
              accessibilityLabel="Mã OTP 4 số"
              placeholder="• • • •"
              placeholderTextColor={COLORS.subtle}
              className={`h-16 rounded-2xl border bg-white text-center text-[28px] font-extrabold text-ink ${fieldError('code') ? 'border-red-400' : 'border-slate-200'}`}
              style={{ letterSpacing: 16 }}
              testID="otp-input"
            />
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error.message}</Text>}
            <Button title="Xác nhận" size="lg" loading={busy} disabled={code.length !== 4} onPress={() => checkCode()} icon={<ShieldCheck size={18} color="#fff" />} />
            <View className="flex-row items-center justify-between">
              <Pressable onPress={() => setStep('phone')} accessibilityRole="button" hitSlop={8} className="-ml-2 h-11 justify-center px-2">
                <Text className="text-[13px] font-semibold text-brand-700">Đổi số điện thoại</Text>
              </Pressable>
              <Pressable onPress={sendCode} disabled={resendIn > 0 || busy} accessibilityRole="button" hitSlop={8} className="-mr-2 h-11 justify-center px-2">
                <Text className={`text-[13px] font-semibold ${resendIn > 0 ? 'text-ink-subtle' : 'text-brand-700'}`}>{resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : 'Gửi lại mã'}</Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 'profile' && (
          <>
            <View className="gap-1.5">
              <Text className="text-[22px] font-extrabold text-ink" accessibilityRole="header">
                Chào mừng ba mẹ!
              </Text>
              <Text className="text-[14px] leading-5 text-ink-muted">Số điện thoại mới — cho trung tâm biết đôi chút về gia đình để tạo sổ liên lạc của bé.</Text>
            </View>
            <FormField label="Tên ba mẹ" value={parentName} onChangeText={(t) => { setParentName(t); setError(null); }} placeholder="VD: Nguyễn Thu Trang" maxLength={60} error={fieldError('parentName')} />
            <Chips label="Ba mẹ là" options={RELATIONSHIPS} value={relationship} onChange={setRelationship} />
            <FormField label="Tên của bé" value={childName} onChangeText={(t) => { setChildName(t); setError(null); }} placeholder="VD: Trần Gia Bảo" maxLength={60} error={fieldError('childName')} />
            <FormField label="Năm sinh của bé (không bắt buộc)" value={birthYear} onChangeText={(t) => { setBirthYear(t.replace(/\D/g, '').slice(0, 4)); setError(null); }} placeholder="VD: 2019" keyboardType="number-pad" maxLength={4} error={fieldError('birthYear')} />
            <Chips
              label="Cơ sở gần nhà"
              options={(Object.keys(CAMPUS_LABELS) as CampusLocation[]).map((c) => ({ id: c, label: CAMPUS_LABELS[c] }))}
              value={campus}
              onChange={(c) => { setCampus(c); setError(null); }}
              error={fieldError('campus')}
            />
            {!!error && !['parentName', 'childName', 'birthYear', 'campus'].includes(error.field ?? '') && (
              <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error.message}</Text>
            )}
            <Button title="Tạo sổ liên lạc" size="lg" variant="accent" loading={busy} onPress={createProfile} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chips<T extends string>({ label, options, value, onChange, error }: { label: string; options: { id: T; label: string }[]; value: T | null; onChange: (v: T) => void; error?: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-ink-muted">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              className={`rounded-full border px-4 py-2.5 ${on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
            >
              <Text className={`text-[14px] font-semibold ${on ? 'text-brand-700' : 'text-ink'}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {!!error && <Text className="text-xs text-red-500">{error}</Text>}
    </View>
  );
}
