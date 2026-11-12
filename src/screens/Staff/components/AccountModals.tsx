import { Check, Copy, Eye, EyeOff, RefreshCw, ShieldCheck, UserRound } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button } from '@/components';
import { ENV } from '@/config/env';
import { ApiError } from '@/services/apiClient';
import { createStaff, generatePassword, resetStaffPassword, ROLE_LABELS, staffPasswordProblem, type StaffAccount, type StaffRole } from '@/services/staffAccounts';
import { COLORS } from '@/utils/constants';
import { shareText } from '@/utils/platform';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
const loginUrl = () => (ENV.webUrl ? `${ENV.webUrl}/quan-ly/dang-nhap` : 'app TH EDU (nhấn giữ logo ở EduFeed)');
const credentialsText = (email: string, password: string) =>
  `Tài khoản TH EDU của bạn\nĐăng nhập: ${loginUrl()}\nEmail: ${email}\nMật khẩu: ${password}\n(Vui lòng không chia sẻ mật khẩu này.)`;

// ─── Shared pieces ──────────────────────────────────────────────────────────

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 items-center justify-end bg-black/40">
        <Pressable className="w-full flex-1" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="max-h-[92%] w-full max-w-[560px] rounded-t-3xl bg-white">
          <ScrollView contentContainerClassName="gap-3 p-5" keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-ink-muted">{label}</Text>
      {children}
      {!!error && <Text className="text-xs text-red-600">{error}</Text>}
    </View>
  );
}

const inputClass = (error?: string | null) =>
  `h-12 rounded-2xl border bg-white px-4 text-[15px] text-ink ${error ? 'border-red-400' : 'border-slate-200'}`;

function PasswordInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  const [visible, setVisible] = useState(true);
  return (
    <Field label="Mật khẩu" error={error}>
      <View className={`flex-row items-center gap-1 rounded-2xl border bg-white pl-4 pr-1 ${error ? 'border-red-400' : 'border-slate-200'}`}>
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Ít nhất 8 ký tự, có chữ và số"
          placeholderTextColor={COLORS.subtle}
          accessibilityLabel="Mật khẩu"
          className="h-12 flex-1 text-[15px] text-ink"
        />
        <Pressable onPress={() => setVisible((v) => !v)} accessibilityRole="button" accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="h-10 w-10 items-center justify-center rounded-xl active:bg-slate-100">
          {visible ? <EyeOff size={18} color={COLORS.muted} /> : <Eye size={18} color={COLORS.muted} />}
        </Pressable>
        <Pressable onPress={() => onChange(generatePassword())} accessibilityRole="button" className="h-10 flex-row items-center gap-1 rounded-xl bg-slate-100 px-3 active:bg-slate-200">
          <RefreshCw size={14} color={COLORS.ink} />
          <Text className="text-xs font-semibold text-ink">Tạo ngẫu nhiên</Text>
        </Pressable>
      </View>
    </Field>
  );
}

/** Shown once after creating / resetting: the admin passes these on to the person. */
function CredentialsCard({ title, email, password, onDone }: { title: string; email: string; password: string; onDone: () => void }) {
  return (
    <>
      <View className="items-center gap-2 pt-2">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <Check size={26} color="#047857" strokeWidth={3} />
        </View>
        <Text className="text-center text-lg font-extrabold text-ink" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-center text-[13px] leading-5 text-ink-muted">
          Gửi thông tin này cho người dùng qua kênh riêng (Zalo cá nhân, gặp trực tiếp). Mật khẩu chỉ hiện một lần.
        </Text>
      </View>
      <View className="gap-1 rounded-2xl bg-slate-50 p-4">
        <Text className="text-xs text-ink-muted">Email</Text>
        <Text selectable className="text-[15px] font-semibold text-ink">{email}</Text>
        <Text className="mt-2 text-xs text-ink-muted">Mật khẩu</Text>
        <Text selectable className="font-mono text-[17px] font-bold tracking-wider text-ink" testID="new-password">{password}</Text>
      </View>
      <Button title="Sao chép / gửi thông tin đăng nhập" variant="outline" icon={<Copy size={16} color={COLORS.ink} />} onPress={() => shareText(credentialsText(email, password))} />
      <Button title="Xong" onPress={onDone} />
    </>
  );
}

// ─── Create account ─────────────────────────────────────────────────────────

const ROLE_HELP: Record<StaffRole, string> = {
  staff: 'Đăng video, xem lịch học thử, xác nhận / hoàn thành học thử.',
  admin: 'Toàn quyền: như giáo viên, thêm tạo / khóa tài khoản và xem tổng quan kinh doanh.',
};

export function CreateStaffModal({
  visible,
  onClose,
  onCreated,
  initialRole = 'staff',
  lockRole = false,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (a: StaffAccount) => void;
  initialRole?: StaffRole;
  /** Hide the role choice (e.g. "Đăng ký tài khoản quản trị"). */
  lockRole?: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('staff');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setEmail('');
    setPassword(generatePassword());
    setRole(initialRole);
    setErrors({});
    setCreated(null);
  }, [visible, initialRole]);

  const submit = async () => {
    const pw = staffPasswordProblem(password);
    if (pw) return setErrors({ password: pw });
    setBusy(true);
    setErrors({});
    try {
      const acc = await createStaff({ email, password, role, displayName: name });
      setCreated({ email: acc.email, password });
      onCreated(acc);
    } catch (e) {
      const field = e instanceof ApiError ? e.field : undefined;
      setErrors(field === 'email' || field === 'password' ? { [field]: msg(e) } : { form: msg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      {created ? (
        <CredentialsCard title="Đã tạo tài khoản" email={created.email} password={created.password} onDone={onClose} />
      ) : (
        <>
          <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
            {lockRole && initialRole === 'admin' ? 'Tạo tài khoản quản trị' : 'Tạo tài khoản nhân viên'}
          </Text>
          <Field label="Tên hiển thị (không bắt buộc)">
            <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="VD: Cô Hường" placeholderTextColor={COLORS.subtle} accessibilityLabel="Tên hiển thị" className={inputClass()} />
          </Field>
          <Field label="Email đăng nhập" error={errors.email}>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setErrors((x) => ({ ...x, email: undefined }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ten@thedu.vn"
              placeholderTextColor={COLORS.subtle}
              accessibilityLabel="Email đăng nhập"
              className={inputClass(errors.email)}
            />
          </Field>
          <PasswordInput
            value={password}
            onChange={(v) => {
              setPassword(v);
              setErrors((x) => ({ ...x, password: undefined }));
            }}
            error={errors.password}
          />
          {!lockRole && (
          <Field label="Quyền">
            <View className="gap-2" accessibilityRole="radiogroup">
              {(['staff', 'admin'] as const).map((r) => {
                const active = r === role;
                const Icon = r === 'admin' ? ShieldCheck : UserRound;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    className={`flex-row items-start gap-3 rounded-2xl border p-3.5 ${active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
                  >
                    <Icon size={20} color={active ? COLORS.brand : COLORS.muted} />
                    <View className="flex-1">
                      <Text className={`text-[15px] font-bold ${active ? 'text-brand-700' : 'text-ink'}`}>{ROLE_LABELS[r]}</Text>
                      <Text className="text-xs leading-[17px] text-ink-muted">{ROLE_HELP[r]}</Text>
                    </View>
                    <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${active ? 'border-brand-500' : 'border-slate-300'}`}>
                      {active && <View className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          )}
          {!!errors.form && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{errors.form}</Text>}
          <View className="flex-row gap-2.5 pt-1">
            <Button className="flex-1" title="Hủy" variant="outline" onPress={onClose} disabled={busy} />
            <Button className="flex-[2]" title="Tạo tài khoản" loading={busy} onPress={submit} />
          </View>
        </>
      )}
    </Sheet>
  );
}

// ─── Reset password ─────────────────────────────────────────────────────────

export function ResetPasswordModal({ account, onClose }: { account: StaffAccount | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPassword(generatePassword());
    setError(null);
    setDone(false);
  }, [account?.id]);

  const submit = async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      await resetStaffPassword(account.id, password);
      setDone(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!account} onClose={onClose}>
      {account && done ? (
        <CredentialsCard title="Đã đặt lại mật khẩu" email={account.email} password={password} onDone={onClose} />
      ) : account ? (
        <>
          <Text className="text-lg font-extrabold text-ink" accessibilityRole="header">
            Đặt lại mật khẩu
          </Text>
          <Text className="text-[13px] leading-5 text-ink-muted">
            {account.displayName ? `${account.displayName} · ` : ''}
            {account.email}. Mật khẩu cũ ngừng hoạt động ngay.
          </Text>
          <PasswordInput
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
            error={error}
          />
          <View className="flex-row gap-2.5 pt-1">
            <Button className="flex-1" title="Hủy" variant="outline" onPress={onClose} disabled={busy} />
            <Button className="flex-[2]" title="Đặt lại mật khẩu" loading={busy} onPress={submit} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}
