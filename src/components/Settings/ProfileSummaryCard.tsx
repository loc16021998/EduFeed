import { Camera, LogIn, Pencil, ShieldCheck } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import Skeleton from '@/components/Skeleton';
import { ROLE_BADGE, type MyAccount } from '@/services/account';
import { CAMPUS_LABELS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';

interface Props {
  /** null + loading = skeleton; null + !loading = guest. */
  account: MyAccount | null;
  loading: boolean;
  avatarBusy?: boolean;
  onChangeAvatar: () => void;
  onEdit: () => void;
  onSignIn: () => void;
  onStaffSignIn: () => void;
}

/** Top of "Cài đặt": who is signed in (avatar, name, phone, role badge) — or a sign-in invitation for guests. */
export default function ProfileSummaryCard({ account, loading, avatarBusy, onChangeAvatar, onEdit, onSignIn, onStaffSignIn }: Props) {
  if (loading && !account) {
    return (
      <View className="flex-row items-center gap-4 rounded-3xl bg-white p-4" testID="profile-loading">
        <Skeleton width={64} height={64} radius={32} />
        <View className="flex-1 gap-2">
          <Skeleton width="60%" height={18} />
          <Skeleton width="40%" height={14} />
        </View>
      </View>
    );
  }

  if (!account) {
    return (
      <View className="gap-3 rounded-3xl bg-brand-600 p-5" testID="profile-guest">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
          <ShieldCheck size={24} color="#fff" />
        </View>
        <Text className="text-[18px] font-extrabold leading-6 text-white">Đăng nhập để mở khóa Sổ liên lạc & Ví ưu đãi</Text>
        <Text className="text-[13px] leading-[19px] text-white/85">Xem nhận xét mỗi buổi học của bé, báo nghỉ, đóng học phí và nhận voucher giới thiệu — chỉ cần số điện thoại, không cần mật khẩu.</Text>
        <Button title="Đăng nhập / Tạo tài khoản OTP" variant="accent" size="lg" icon={<LogIn size={18} color="#fff" />} onPress={onSignIn} testID="guest-sign-in" />
        <Pressable onPress={onStaffSignIn} accessibilityRole="link" className="min-h-11 items-center justify-center" testID="staff-sign-in">
          <Text className="text-[13px] font-semibold text-white underline">Giáo viên / nhân viên đăng nhập tại đây</Text>
        </Pressable>
      </View>
    );
  }

  const contact = account.phone ? formatPhone(account.phone) : account.email;
  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="profile-card">
      <View className="flex-row items-center gap-4">
        <Pressable
          onPress={onChangeAvatar}
          disabled={avatarBusy}
          accessibilityRole="button"
          accessibilityLabel="Đổi ảnh đại diện"
          className="relative"
          hitSlop={4}
          testID="avatar-button"
        >
          <Avatar uri={account.avatarUrl ?? undefined} name={account.fullName} size={64} />
          <View className="absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-500">
            {avatarBusy ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={13} color="#fff" />}
          </View>
        </Pressable>
        <View className="flex-1 gap-0.5">
          <Text className="text-[18px] font-extrabold text-ink" numberOfLines={2} testID="profile-name">
            {account.fullName}
          </Text>
          {!!contact && (
            <Text className="text-[13px] text-ink-muted" numberOfLines={1} testID="profile-contact">
              {contact}
            </Text>
          )}
          <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
            <View className="rounded-full bg-brand-50 px-2.5 py-1">
              <Text className="text-[12px] font-bold text-brand-700" testID="role-badge">
                {ROLE_BADGE[account.role]}
              </Text>
            </View>
            {!!account.campus && (
              <View className="rounded-full bg-slate-100 px-2.5 py-1">
                <Text className="text-[12px] font-semibold text-ink-muted">{CAMPUS_LABELS[account.campus]}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 active:bg-slate-50"
        testID="edit-profile"
      >
        <Pencil size={16} color={COLORS.ink} />
        <Text className="text-[14px] font-bold text-ink">Chỉnh sửa hồ sơ</Text>
      </Pressable>
      {account.deletionPending && (
        <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800" testID="deletion-pending">
          Đã gửi yêu cầu xoá tài khoản — trung tâm sẽ liên hệ xác nhận trong 7 ngày làm việc.
        </Text>
      )}
    </View>
  );
}
