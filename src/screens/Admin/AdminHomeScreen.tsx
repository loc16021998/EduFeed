import { useFocusEffect } from '@react-navigation/native';
import { BarChart3, Bell, CalendarClock, ChevronRight, Clapperboard, GraduationCap, ImagePlus, LogOut, ShieldCheck, UserCheck, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logo from '@/assets/branding/play-store-512.png';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { listStaffRequests } from '@/services/staffRequests';
import { useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { confirmAsync } from '@/utils/platform';

const LOGO: ImageSourcePropType = typeof logo === 'string' ? { uri: logo } : logo;

type Target = 'AdminDashboard' | 'StaffAccounts' | 'StaffRequests' | 'StaffVideos' | 'StaffTrials' | 'TeacherUpload' | 'StaffEnrollments';

/** Admin area home (owner / manager). Teachers and staff have their own area at /quan-ly. */
export default function AdminHomeScreen({ navigation }: RootStackScreenProps<'AdminHome'>) {
  const { status, isStaff, isAdmin, email, demo, signOut } = useStaffStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (status === 'signedOut' || (status === 'signedIn' && !isStaff)) navigation.replace('AdminLogin');
    else if (status === 'signedIn' && !isAdmin) navigation.replace('StaffVideos');
  }, [status, isStaff, isAdmin, navigation]);

  const go = (t: Target) => navigation.navigate(t);

  // Approval notifications: pending sign-ups, refreshed whenever this screen is shown.
  const [pending, setPending] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return;
      listStaffRequests('PENDING').then((l) => setPending(l.length), () => setPending(null));
    }, [isAdmin]),
  );

  const onSignOut = async () => {
    if (await confirmAsync('Đăng xuất?', 'Bạn sẽ cần đăng nhập lại để vào trang quản trị.', 'Đăng xuất')) {
      await signOut();
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <View style={{ paddingTop: insets.top }} className="bg-ink">
        <View className="flex-row items-center gap-3 px-4 pb-5 pt-4">
          <Image source={LOGO} style={{ width: 44, height: 44, borderRadius: 12 }} accessible={false} />
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <ShieldCheck size={14} color="#93B4FF" />
              <Text className="text-xs font-bold uppercase tracking-wide text-[#93B4FF]">Quản trị</Text>
            </View>
            <Text className="text-[19px] font-extrabold text-white" accessibilityRole="header">
              Quản trị TH EDU
            </Text>
            <Text className="text-xs text-slate-400" numberOfLines={1}>
              {email}
            </Text>
          </View>
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel="Đăng xuất"
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          >
            <LogOut size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="gap-3 px-4 pb-10 pt-4">
        {(demo || !hasSupabase) && (
          <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
            Chế độ thử: dữ liệu mẫu, chỉ lưu tạm trên máy này. Kết nối Supabase để dùng thật.
          </Text>
        )}

        {!!pending && (
          <Pressable
            onPress={() => go('StaffRequests')}
            accessibilityRole="button"
            testID="pending-banner"
            className="flex-row items-center gap-3 rounded-2xl bg-amber-100 p-3.5 active:opacity-90"
          >
            <Bell size={20} color="#92400E" />
            <Text className="flex-1 text-[14px] font-semibold text-amber-900">
              {pending} yêu cầu tài khoản giáo viên / nhân viên đang chờ duyệt
            </Text>
            <ChevronRight size={18} color="#92400E" />
          </Pressable>
        )}

        <Section title="Kinh doanh & nhân sự" />
        <Tile
          icon={<BarChart3 size={22} color={COLORS.brand} />}
          title="Tổng quan kinh doanh"
          subtitle="Đăng ký mới, nguồn quảng cáo, phễu chuyển đổi, doanh thu, học phí"
          onPress={() => go('AdminDashboard')}
          primary
        />
        <Tile
          icon={<UserCheck size={22} color={COLORS.brand} />}
          title="Duyệt tài khoản"
          subtitle="Giáo viên / nhân viên tự đăng ký cần bạn duyệt"
          badge={pending ? String(pending) : undefined}
          onPress={() => go('StaffRequests')}
        />
        <Tile
          icon={<Users size={22} color={COLORS.brand} />}
          title="Tài khoản nhân viên"
          subtitle="Tạo tài khoản, phân quyền, đặt lại mật khẩu"
          onPress={() => go('StaffAccounts')}
        />

        <Section title="Công cụ giáo viên" note="Quản trị viên cũng dùng được các công cụ này." />
        <View className="flex-row flex-wrap gap-3">
          <GridTile icon={<Clapperboard size={22} color={COLORS.brand} />} title="Video EduFeed" subtitle="Đăng, sửa, ẩn video" onPress={() => go('StaffVideos')} />
          <GridTile icon={<CalendarClock size={22} color={COLORS.brand} />} title="Lịch học thử" subtitle="Xác nhận, hoàn thành" onPress={() => go('StaffTrials')} />
          <GridTile icon={<GraduationCap size={22} color={COLORS.brand} />} title="Học viên & lộ trình" subtitle="Chứng nhận, gọi tư vấn" onPress={() => go('StaffEnrollments')} />
          <GridTile icon={<ImagePlus size={22} color={COLORS.brand} />} title="Nhật ký tiến bộ" subtitle="Ảnh trước / sau" onPress={() => go('TeacherUpload')} />
        </View>
      </ScrollView>
    </View>
  );
}

/** Compact 2-column tile for the frequently used teacher tools. */
function GridTile({ icon, title, subtitle, onPress }: { icon: ReactNode; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${subtitle}`}
      style={{ flexBasis: '46%', flexGrow: 1 }}
      className="min-h-[112px] gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 active:opacity-90"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">{icon}</View>
      <View className="gap-0.5">
        <Text className="text-[14px] font-bold text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-xs text-ink-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <View className="pt-2">
      <Text className="text-xs font-bold uppercase tracking-wide text-ink-subtle">{title}</Text>
      {!!note && <Text className="text-xs text-ink-subtle">{note}</Text>}
    </View>
  );
}

function Tile({ icon, title, subtitle, onPress, primary, badge }: { icon: ReactNode; title: string; subtitle: string; onPress: () => void; primary?: boolean; badge?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center gap-3 rounded-2xl border p-4 active:opacity-90 ${primary ? 'border-brand-100 bg-brand-50' : 'border-slate-200 bg-white'}`}
    >
      <View className={`h-11 w-11 items-center justify-center rounded-xl ${primary ? 'bg-white' : 'bg-slate-50'}`}>{icon}</View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-ink">{title}</Text>
        <Text className="text-xs leading-[17px] text-ink-muted">{subtitle}</Text>
      </View>
      {!!badge && (
        <View className="min-w-[24px] items-center rounded-full bg-red-500 px-2 py-0.5" accessibilityLabel={`${badge} chờ duyệt`}>
          <Text className="text-xs font-bold text-white">{badge}</Text>
        </View>
      )}
      <ChevronRight size={18} color={COLORS.muted} />
    </Pressable>
  );
}
