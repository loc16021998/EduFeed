import AppVersionFooter from '@/components/AppVersionFooter';
import ReplayGuideCard from '@/screens/Onboarding/ReplayGuideCard';
import { LIST_PERF } from '@/utils/listPerf';
import { EmptyState } from '@/components/ux';
import { CalendarClock, ChevronLeft, ChevronRight, GraduationCap, ImagePlus, LogOut, Plus, ShieldCheck, ListChecks, QrCode, MessagesSquare } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { Button, HeaderIconButton, ScreenHeader } from '@/components';
import type { RootStackScreenProps } from '@/navigation/types';
import { buildShareUrl, shareMessage } from '@/services/media/shareLinks';
import { useStaffStore, useVideoAdminStore } from '@/store';
import type { AdminVideo } from '@/types';
import { COLORS } from '@/utils/constants';
import { confirmAsync, shareText } from '@/utils/platform';

import AdminVideoRow from './components/AdminVideoRow';

export default function StaffVideosScreen({ navigation }: RootStackScreenProps<'StaffVideos'>) {
  const { status: authStatus, isStaff, isAdmin, email, demo, signOut } = useStaffStore();
  const { videos, status, error, load, togglePublished, remove } = useVideoAdminStore();

  // Not (or no longer) signed in as staff → back to login.
  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('StaffLogin');
  }, [authStatus, isStaff, navigation]);

  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  const onEdit = useCallback((v: AdminVideo) => navigation.navigate('VideoEditor', { id: v.id }), [navigation]);
  const onShare = useCallback((v: AdminVideo) => {
    const url = buildShareUrl(v.shareSlug);
    if (url) shareText(shareMessage(v.title, url));
    else shareText('Chưa cấu hình PUBLIC_WEB_URL nên chưa tạo được link chia sẻ. Xem README.');
  }, []);

  const onDelete = useCallback(
    async (v: AdminVideo) => {
      if (await confirmAsync('Xóa video?', `"${v.title}" sẽ bị xóa vĩnh viễn khỏi EduFeed và link chia sẻ sẽ ngừng hoạt động.`, 'Xóa')) {
        remove(v);
      }
    },
    [remove],
  );

  const onSignOut = async () => {
    if (await confirmAsync('Đăng xuất?', 'Bạn sẽ cần đăng nhập lại để đăng video.', 'Đăng xuất')) {
      await signOut();
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  };

  const published = videos.filter((v) => v.isPublished).length;
  const totalLeads = videos.reduce((n, v) => n + v.leadCount, 0);

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Khu giáo viên"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Home' }))}
        right={
          <HeaderIconButton label="Đăng xuất" onPress={onSignOut}>
            <LogOut size={20} color={COLORS.ink} />
          </HeaderIconButton>
        }
      />

      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        contentContainerClassName="gap-3 px-4 pb-10"
        refreshControl={<RefreshControl refreshing={status === 'loading'} onRefresh={load} tintColor={COLORS.brand} />}
        // Version + manual update check for support calls (teachers at both campuses).
        ListFooterComponent={<View className="gap-3 pt-4"><ReplayGuideCard /><AppVersionFooter /></View>}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <Text className="text-xs text-ink-subtle">
              Đăng nhập: {email} · {isAdmin ? 'Quản trị' : 'Giáo viên / nhân viên'}
            </Text>
            {demo && (
              <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
                Chế độ thử: video chỉ lưu tạm trên máy này, mất khi tải lại. Kết nối Supabase để đăng thật.
              </Text>
            )}
            {isAdmin && (
              <Pressable
                onPress={() => navigation.navigate('AdminHome')}
                accessibilityRole="button"
                className="flex-row items-center gap-2 self-start rounded-full bg-ink px-3.5 py-2 active:opacity-90"
              >
                <ChevronLeft size={16} color="#fff" />
                <ShieldCheck size={14} color="#93B4FF" />
                <Text className="text-[13px] font-semibold text-white">Về trang quản trị</Text>
              </Pressable>
            )}
            <View className="flex-row gap-3">
              <Pressable onPress={() => navigation.navigate('TeacherDashboard')} accessibilityRole="button" className="flex-1 gap-1.5 rounded-2xl bg-brand-500 p-3.5 active:bg-brand-600" testID="go-classes">
                <QrCode size={22} color="#fff" />
                <Text className="text-[15px] font-bold text-white">Lớp của tôi</Text>
                <Text className="text-xs text-white/85">Điểm danh QR, gửi sổ liên lạc</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate('AdvisorTasks')} accessibilityRole="button" className="flex-1 gap-1.5 rounded-2xl bg-ink p-3.5 active:opacity-90" testID="go-tasks">
                <ListChecks size={22} color="#fff" />
                <Text className="text-[15px] font-bold text-white">Công việc</Text>
                <Text className="text-xs text-white/75">Gọi phụ huynh, học bù, chấm bài</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => navigation.navigate('Community')}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3.5 active:opacity-90"
              testID="go-community"
            >
              <MessagesSquare size={22} color="#059669" />
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">Cộng đồng phụ huynh</Text>
                <Text className="text-xs text-ink-muted">Trả lời câu hỏi (có dấu “Giáo viên TH EDU”), kiểm duyệt bài</Text>
              </View>
              <ChevronRight size={18} color={COLORS.muted} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('StaffTrials')}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-3.5 active:opacity-90"
            >
              <CalendarClock size={22} color={COLORS.brand} />
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">Lịch học thử & khách hàng</Text>
                <Text className="text-xs text-ink-muted">Xác nhận lịch, hoàn thành học thử, ghi nhận nhập học</Text>
              </View>
              <ChevronRight size={18} color={COLORS.muted} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('StaffEnrollments')}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 active:opacity-90"
            >
              <GraduationCap size={22} color={COLORS.brand} />
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">Học viên & lộ trình</Text>
                <Text className="text-xs text-ink-muted">Hoàn thành khóa, chứng nhận, gọi tư vấn khóa tiếp theo</Text>
              </View>
              <ChevronRight size={18} color={COLORS.muted} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('TeacherUpload')}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 active:opacity-90"
            >
              <ImagePlus size={22} color={COLORS.brand} />
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">Đăng nhật ký tiến bộ</Text>
                <Text className="text-xs text-ink-muted">Ảnh trước / sau và nhận xét của giáo viên</Text>
              </View>
              <ChevronRight size={18} color={COLORS.muted} />
            </Pressable>
            <View className="flex-row gap-3">
              <Stat value={published} label="video đang hiển thị" />
              <Stat value={totalLeads} label="lượt đăng ký từ video" />
            </View>
            <Button
              title="Đăng video mới"
              size="lg"
              icon={<Plus size={20} color="#fff" strokeWidth={3} />}
              onPress={() => navigation.navigate('VideoEditor')}
            />
            {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-600">{error}</Text>}
          </View>
        }
        {...LIST_PERF}
        renderItem={({ item }) => (
          <AdminVideoRow
            video={item}
            onEdit={onEdit}
            onShare={onShare}
            onTogglePublished={togglePublished}
            onDelete={onDelete}
          />
        )}
        ListEmptyComponent={
          status === 'loading' ? (
            <ActivityIndicator className="mt-8" color={COLORS.brand} />
          ) : (
            <View className="mt-6">
              <EmptyState emoji="🎬" title="Chưa có video nào" message="Video bài học giúp phụ huynh thấy con học thế nào ở lớp." action={{ label: 'Đăng video đầu tiên', onPress: () => navigation.navigate('VideoEditor') }} />
            </View>
          )
        }
      />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white p-3">
      <Text className="text-2xl font-extrabold text-brand-600">{value}</Text>
      <Text className="text-xs text-ink-muted">{label}</Text>
    </View>
  );
}
