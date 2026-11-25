import {
  BookOpen,
  CalendarClock,
  Check,
  ClipboardList,
  Clapperboard,
  Gift,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircleMore,
  NotebookPen,
  Phone,
  Receipt,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  Users,
  Wifi,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppVersionFooter from '@/components/AppVersionFooter';
import { ScreenHeader } from '@/components';
import { DeleteAccountSheet, EditProfileSheet, PrivacySheet } from '@/components/Settings/AccountSheets';
import { DeletionRequestsSheet, ReleaseConfigSheet } from '@/components/Settings/AdminSheets';
import ProfileSummaryCard from '@/components/Settings/ProfileSummaryCard';
import { SettingsRow, SettingsSection } from '@/components/Settings/SettingsSection';
import { StatusBanner } from '@/components/ux';
import { ENV, hasHotline } from '@/config/env';
import type { OnboardingRole } from '@/config/onboardingSlides';
import type { RootStackScreenProps } from '@/navigation/types';
import ReplayGuideCard from '@/screens/Onboarding/ReplayGuideCard';
import { cancelAccountDeletion, fetchMyAccount, listDeletionRequests, updateMyProfile, uploadAvatar, type MyAccount } from '@/services/account';
import { pickImage } from '@/services/media/mediaPicker';
import { push } from '@/services/pushNotificationService';
import { buildZaloOAUrl } from '@/services/zalo';
import { useParentStore, useStaffStore } from '@/store';
import { useNetworkStore } from '@/store/networkStore';
import { useRoleOnboardingStore } from '@/store/onboardingStore';
import { useUserStore } from '@/store/useUserStore';
import type { CampusLocation } from '@/types';
import { COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { haptics } from '@/utils/haptics';
import { clearMediaCache, formatBytes, getMediaCacheReport } from '@/utils/mediaCache';
import { CAMPUSES } from '@/utils/mockData';
import { confirmAsync } from '@/utils/platform';

import NotificationSettingsCard from './NotificationSettingsCard';

type Sheet = null | 'edit' | 'privacy' | 'delete' | 'release' | 'deletions';
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Không thực hiện được, vui lòng thử lại.');

const CAMPUS_OPTIONS: { id: CampusLocation | null; title: string; body: string }[] = [
  ...CAMPUSES.map((c) => ({ id: c.id, title: `${c.code}: ${c.name.replace('Cơ sở ', '')}`, body: c.shortAddress })),
  { id: null, title: 'Tất cả cơ sở', body: 'Chọn cơ sở mỗi lần đặt lịch' },
];

/**
 * "Cài đặt & Tài khoản" (route /cai-dat) — one screen for every role:
 * profile header, campus + data saver + cache, notifications + Zalo OA, role shortcuts,
 * support / legal / version, sign out and the in-app account deletion request.
 */
export default function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const insets = useSafeAreaInsets();
  const staffIn = useStaffStore((s) => s.status === 'signedIn' && s.isStaff);
  const isAdmin = useStaffStore((s) => s.isAdmin);
  const parentIn = useParentStore((s) => s.status === 'signedIn');
  const signedIn = staffIn || parentIn;
  const currentRole = useRoleOnboardingStore((s) => s.currentRole);
  const replay = useRoleOnboardingStore((s) => s.resetOnboardingForPreview);

  const [account, setAccount] = useState<MyAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingDeletions, setPendingDeletions] = useState(0);

  const preferredCampus = useUserStore((s) => s.preferredCampus);
  const setProfile = useUserStore((s) => s.setProfile);
  const saverMode = useNetworkStore((s) => s.mode);
  const setSaverMode = useNetworkStore((s) => s.setMode);
  const [cache, setCache] = useState<{ bytes: number | null; items: number } | null>(null);
  const [clearing, setClearing] = useState(false);

  // ── Account ──
  useEffect(() => {
    if (!signedIn) {
      setAccount(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchMyAccount()
      .then((a) => alive && setAccount(a))
      .catch((e) => alive && setNotice({ ok: false, text: msg(e) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [signedIn, staffIn, parentIn]);

  useEffect(() => {
    if (!isAdmin) return;
    listDeletionRequests('PENDING').then((r) => setPendingDeletions(r.length), () => {});
  }, [isAdmin]);

  // ── Cache ──
  const refreshCache = useCallback(() => {
    getMediaCacheReport().then(
      (r) => setCache({ bytes: r.storage?.usageBytes ?? null, items: r.prefetchedImages + r.caches.reduce((a, c) => a + c.size, 0) }),
      () => setCache(null),
    );
  }, []);
  useEffect(refreshCache, [refreshCache]);

  const onClearCache = async () => {
    setClearing(true);
    try {
      const n = await clearMediaCache();
      haptics.success();
      setNotice({ ok: true, text: n > 0 ? `Đã xoá ${n} mục trong bộ nhớ đệm. Ảnh sẽ tải lại khi cần.` : 'Bộ nhớ đệm đã trống.' });
      refreshCache();
    } finally {
      setClearing(false);
    }
  };

  // ── Avatar ──
  const changeAvatar = async () => {
    if (!account) return;
    try {
      const media = await pickImage();
      if (!media) return;
      setAvatarBusy(true);
      const url = await uploadAvatar(media);
      const a = await updateMyProfile(account.fullName, url);
      setAccount(a);
      haptics.success();
      setNotice({ ok: true, text: 'Đã cập nhật ảnh đại diện.' });
    } catch (e) {
      setNotice({ ok: false, text: msg(e) });
    } finally {
      setAvatarBusy(false);
    }
  };

  // ── Account actions ──
  const signOut = async () => {
    const who = staffIn ? 'tài khoản nhân viên' : 'sổ liên lạc';
    if (!(await confirmAsync('Đăng xuất?', `Ba mẹ / thầy cô sẽ cần đăng nhập lại để mở ${who}. Máy này sẽ ngừng nhận thông báo của tài khoản.`, 'Đăng xuất'))) return;
    haptics.medium();
    if (staffIn) await useStaffStore.getState().signOut();
    if (parentIn) await useParentStore.getState().signOut();
    setAccount(null);
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  const cancelDeletion = async () => {
    try {
      setAccount(await cancelAccountDeletion());
      setNotice({ ok: true, text: 'Đã huỷ yêu cầu xoá tài khoản.' });
    } catch (e) {
      setNotice({ ok: false, text: msg(e) });
    }
  };

  const ownRole: OnboardingRole | null = parentIn ? 'PARENT' : account?.role === 'ADVISOR' ? 'ADVISOR' : account?.role === 'TEACHER' ? 'TEACHER' : (currentRole ?? null);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Home' }));
  const zaloUrl = ENV.zaloOAId ? buildZaloOAUrl(ENV.zaloOAId) : '';
  const role = account?.role ?? (parentIn ? 'PARENT' : null);
  const isStaffRole = role === 'TEACHER' || role === 'ADVISOR' || role === 'MANAGER' || role === 'ADMIN';

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Cài đặt & Tài khoản" onBack={goBack} />
      <ScrollView contentContainerClassName="gap-5 px-4 pt-1" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} testID="settings-screen">
        <ProfileSummaryCard
          account={account}
          loading={signedIn && loading}
          avatarBusy={avatarBusy}
          onChangeAvatar={changeAvatar}
          onEdit={() => setSheet('edit')}
          onSignIn={() => navigation.navigate('ParentAuth')}
          onStaffSignIn={() => navigation.navigate('StaffLogin')}
        />
        {!!notice && <StatusBanner tone={notice.ok ? 'success' : 'error'} text={notice.text} onDismiss={() => setNotice(null)} testID="settings-notice" />}

        {/* ── 1. Campus & app experience ── */}
        <SettingsSection title="Cơ sở & trải nghiệm" testID="section-experience">
          <View className="gap-2 px-4 pb-3 pt-3.5" accessibilityRole="radiogroup" accessibilityLabel="Cơ sở ưu tiên">
            <Text className="text-[15px] font-semibold text-ink">Cơ sở ưu tiên</Text>
            <Text className="-mt-1.5 text-[13px] leading-[18px] text-ink-muted">Tự chọn sẵn khi ba mẹ đặt lịch học thử</Text>
            {CAMPUS_OPTIONS.map((o) => {
              const on = preferredCampus === o.id;
              return (
                <Pressable
                  key={o.id ?? 'ALL'}
                  onPress={() => {
                    haptics.light();
                    setProfile({ preferredCampus: o.id });
                  }}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityState={{ checked: on }}
                  className={`min-h-[52px] flex-row items-center gap-3 rounded-2xl border px-3.5 py-2 ${on ? 'border-brand-500 bg-brand-50/60' : 'border-slate-200 active:bg-slate-50'}`}
                  testID={`campus-${o.id ?? 'ALL'}`}
                >
                  <View className={`h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                    {on && <Check size={14} color="#fff" strokeWidth={3} />}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-bold text-ink">{o.title}</Text>
                    <Text className="text-[12px] text-ink-muted">{o.body}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <SettingsRow
            icon={Wifi}
            title="Tiết kiệm dữ liệu di động"
            subtitle={saverMode === 'ON' ? 'Không tự phát video, ảnh gửi lên được nén nhẹ hơn' : saverMode === 'OFF' ? 'Đang tắt: luôn tự phát video' : 'Tự động: chỉ tiết kiệm khi dùng 4G/5G'}
            right={
              <Switch
                value={saverMode === 'ON'}
                onValueChange={(v) => {
                  haptics.light();
                  setSaverMode(v ? 'ON' : 'AUTO');
                }}
                trackColor={{ true: COLORS.brand, false: '#CBD5E1' }}
                thumbColor="#fff"
                accessibilityLabel="Tiết kiệm dữ liệu di động"
                testID="saver-switch"
              />
            }
            testID="row-saver"
          />
          <SettingsRow icon={SlidersHorizontal} title="Tuỳ chỉnh dữ liệu chi tiết" subtitle="Chế độ tự động / luôn tiết kiệm / tắt" onPress={() => navigation.navigate('DataSettings')} testID="row-data-detail" />
          <SettingsRow
            icon={HardDrive}
            title="Xoá bộ nhớ đệm ảnh & video"
            subtitle={cache ? `${cache.bytes != null ? `Khoảng ${formatBytes(cache.bytes)} · ` : ''}${cache.items} mục lưu tạm` : 'Ảnh đã xem được lưu tạm để mở lại nhanh hơn'}
            onPress={onClearCache}
            disabled={clearing}
            right={<Text className="text-[13px] font-bold text-brand-600">{clearing ? 'Đang xoá…' : 'Xoá'}</Text>}
            testID="row-clear-cache"
          />
        </SettingsSection>

        {/* ── 2. Notifications & Zalo ── */}
        <View className="gap-1.5" testID="section-notifications">
          <Text className="px-1 text-[13px] font-extrabold uppercase tracking-wide text-ink-muted" accessibilityRole="header">
            Thông báo & Zalo
          </Text>
          <NotificationSettingsCard />
          <View className="overflow-hidden rounded-3xl bg-white">
            <SettingsRow
              first
              icon={MessageCircleMore}
              title="Kết nối Zalo OA TH EDU"
              subtitle={
                role === 'PARENT'
                  ? account?.zaloLinked
                    ? 'Đã liên kết — nhắc lịch học & học phí gửi qua Zalo'
                    : 'Chưa liên kết — quan tâm OA để nhận nhắc lịch qua Zalo'
                  : isStaffRole
                    ? 'Tin nội bộ gửi qua ứng dụng; OA dùng để trò chuyện với phụ huynh'
                    : 'Quan tâm OA để nhận tư vấn và ưu đãi'
              }
              right={
                role === 'PARENT' ? (
                  <View className={`rounded-full px-2.5 py-1 ${account?.zaloLinked ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <Text className={`text-[12px] font-bold ${account?.zaloLinked ? 'text-emerald-700' : 'text-amber-700'}`} testID="zalo-status">
                      {account?.zaloLinked ? 'Đã liên kết' : 'Chưa liên kết'}
                    </Text>
                  </View>
                ) : undefined
              }
              testID="row-zalo"
            />
            {!!zaloUrl && <SettingsRow icon={MessageCircleMore} title="Mở Zalo OA TH EDU" subtitle="Nhắn tin, nhận nhắc lịch tự động" onPress={() => Linking.openURL(zaloUrl).catch(() => {})} testID="row-open-zalo" />}
          </View>
        </View>

        {/* ── 3. Role shortcuts ── */}
        {role === 'PARENT' && (
          <SettingsSection title="Tiện ích của ba mẹ" testID="section-parent">
            <SettingsRow first icon={Users} title="Hồ sơ các bé" subtitle="Chuyển giữa các bé, xem sổ liên lạc từng bé" onPress={() => navigation.navigate('ParentPortal')} testID="row-children" />
            <SettingsRow icon={CalendarClock} title="Lịch học thử đã đặt" subtitle="Đổi giờ, huỷ hoặc đặt lại lịch" onPress={() => navigation.navigate('ManageBookings')} testID="row-bookings" />
            <SettingsRow icon={Receipt} title="Học phí & giao dịch" subtitle="Hoá đơn, thanh toán và biên nhận" onPress={() => navigation.navigate('ParentPortal')} testID="row-fees" />
            <SettingsRow icon={Gift} title="Mã giới thiệu & Ví voucher" subtitle="Mời bạn bè học thử, nhận voucher học phí" onPress={() => navigation.navigate('Referral')} testID="row-referral" />
          </SettingsSection>
        )}
        {(role === 'TEACHER' || role === 'ADVISOR') && (
          <SettingsSection title={role === 'TEACHER' ? 'Tiện ích giáo viên' : 'Tiện ích tư vấn viên'} testID="section-staff">
            <SettingsRow
              first
              icon={CalendarClock}
              title={role === 'TEACHER' ? 'Thông báo lớp học' : 'Thông báo lead nóng'}
              subtitle={push.available ? 'Máy này đang nhận thông báo — chọn loại tin ở mục Thông báo' : push.reason}
              testID="row-push-status"
            />
            {role === 'TEACHER' ? (
              <>
                <SettingsRow icon={ClipboardList} title="Lớp của tôi & điểm danh" subtitle="Điểm danh QR, sổ liên lạc cả lớp" onPress={() => navigation.navigate('TeacherDashboard')} testID="row-classes" />
                <SettingsRow icon={NotebookPen} title="Mẫu nhận xét nhanh & nhật ký" subtitle="Đăng bài trước / sau, chọn nhận xét có sẵn" onPress={() => navigation.navigate('TeacherUpload')} testID="row-journal" />
                <SettingsRow icon={Clapperboard} title="Studio video" subtitle="Đăng và quản lý video EduFeed" onPress={() => navigation.navigate('StaffVideos')} testID="row-studio" />
              </>
            ) : (
              <>
                <SettingsRow icon={ClipboardList} title="Công việc hôm nay" subtitle="Gọi / nhắn Zalo khách được giao" onPress={() => navigation.navigate('AdvisorTasks')} testID="row-tasks" />
                <SettingsRow icon={CalendarClock} title="Lịch học thử" subtitle="Xác nhận lịch, ghi kết quả buổi học thử" onPress={() => navigation.navigate('StaffTrials')} testID="row-trials" />
                <SettingsRow icon={Users} title="Học viên & gia hạn" subtitle="Danh sách cần gọi tư vấn" onPress={() => navigation.navigate('StaffEnrollments')} testID="row-enrollments" />
              </>
            )}
          </SettingsSection>
        )}
        {(role === 'ADMIN' || role === 'MANAGER') && (
          <SettingsSection title="Quản trị" testID="section-admin">
            <SettingsRow first icon={LayoutDashboard} title="Trang quản trị" subtitle="Tổng quan kinh doanh, lớp học, phụ huynh" onPress={() => navigation.navigate('AdminHome')} testID="row-admin-home" />
            <SettingsRow icon={UserCog} title="Tài khoản & phân quyền" subtitle="Nhân viên, vai trò, cơ sở" onPress={() => navigation.navigate('StaffAccounts')} testID="row-staff-accounts" />
            {role === 'ADMIN' && (
              <>
                <SettingsRow icon={Rocket} title="Cấu hình phiên bản ứng dụng" subtitle="Bản tối thiểu, bản mới nhất, link cửa hàng" onPress={() => setSheet('release')} testID="row-release" />
                <SettingsRow
                  icon={Trash2}
                  title="Yêu cầu xoá tài khoản"
                  subtitle={pendingDeletions > 0 ? `${pendingDeletions} yêu cầu chờ xử lý` : 'Không có yêu cầu chờ'}
                  onPress={() => setSheet('deletions')}
                  right={
                    pendingDeletions > 0 ? (
                      <View className="min-w-[24px] items-center rounded-full bg-red-500 px-2 py-0.5">
                        <Text className="text-[12px] font-black text-white">{pendingDeletions}</Text>
                      </View>
                    ) : undefined
                  }
                  testID="row-deletions"
                />
              </>
            )}
          </SettingsSection>
        )}

        {/* ── 4. Support, legal & version ── */}
        <SettingsSection title="Hỗ trợ & pháp lý" testID="section-support">
          {ownRole ? (
            <SettingsRow first icon={BookOpen} title="Xem lại hướng dẫn sử dụng" subtitle="3 bước làm quen, xem lại bất cứ lúc nào" onPress={() => replay(ownRole)} testID="row-replay" />
          ) : (
            <SettingsRow first icon={BookOpen} title="Xem hướng dẫn cho phụ huynh" subtitle="3 bước làm quen với ứng dụng" onPress={() => replay('PARENT')} testID="row-replay" />
          )}
          {hasHotline && (
            <SettingsRow icon={Phone} title={`Gọi hotline ${formatPhone(ENV.hotline)}`} subtitle="Cơ sở Xa La & Ngô Thì Nhậm · 8:00 – 21:00" onPress={() => Linking.openURL(`tel:${ENV.hotline}`).catch(() => {})} testID="row-hotline" />
          )}
          {CAMPUSES.map((c) => (
            <SettingsRow key={c.id} icon={MapPin} title={`Chỉ đường tới ${c.code} ${c.name.replace('Cơ sở ', '')}`} subtitle={c.address} onPress={() => Linking.openURL(c.mapUrl).catch(() => {})} testID={`row-map-${c.id}`} />
          ))}
          <SettingsRow icon={ShieldCheck} title="Bảo mật & quyền riêng tư của bé" subtitle="Ảnh của bé và số điện thoại được bảo vệ thế nào" onPress={() => setSheet('privacy')} testID="row-privacy" />
        </SettingsSection>

        {isAdmin && <ReplayGuideCard />}

        {!!account && (
          <SettingsSection title="Tài khoản" testID="section-account">
            <SettingsRow first icon={LogOut} title="Đăng xuất" subtitle={account.phone ? formatPhone(account.phone) : account.email ?? undefined} onPress={signOut} testID="row-sign-out" />
            {account.deletionPending ? (
              <SettingsRow icon={Trash2} title="Huỷ yêu cầu xoá tài khoản" subtitle="Yêu cầu đang chờ trung tâm xử lý" onPress={cancelDeletion} testID="row-cancel-delete" />
            ) : (
              <SettingsRow icon={Trash2} tone="danger" title="Yêu cầu xoá tài khoản" subtitle="Xoá dữ liệu cá nhân, xử lý trong 7 ngày" onPress={() => setSheet('delete')} testID="row-delete" />
            )}
          </SettingsSection>
        )}

        <AppVersionFooter />
      </ScrollView>

      {!!account && (
        <>
          <EditProfileSheet
            visible={sheet === 'edit'}
            account={account}
            onClose={() => setSheet(null)}
            onChangeAvatar={changeAvatar}
            avatarBusy={avatarBusy}
            onSaved={(a) => {
              setAccount(a);
              setSheet(null);
              setNotice({ ok: true, text: 'Đã lưu hồ sơ.' });
            }}
          />
          <DeleteAccountSheet
            visible={sheet === 'delete'}
            account={account}
            onClose={() => setSheet(null)}
            onDone={(a) => {
              setAccount(a);
              setSheet(null);
              setNotice({ ok: true, text: 'Đã gửi yêu cầu xoá tài khoản. Trung tâm sẽ liên hệ xác nhận.' });
            }}
          />
        </>
      )}
      <PrivacySheet visible={sheet === 'privacy'} onClose={() => setSheet(null)} />
      {role === 'ADMIN' && (
        <>
          <ReleaseConfigSheet visible={sheet === 'release'} onClose={() => setSheet(null)} />
          <DeletionRequestsSheet visible={sheet === 'deletions'} onClose={() => setSheet(null)} onChanged={setPendingDeletions} />
        </>
      )}
    </View>
  );
}
