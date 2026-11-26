import { useFocusEffect } from '@react-navigation/native';
import { ShieldAlert } from 'lucide-react-native';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CommandTopBar, { CommandFilters } from '@/components/Admin/CommandTopBar';
import AcademicOpsTab from '@/components/Admin/modules/AcademicOpsTab';
import AccountsRbacTab from '@/components/Admin/modules/AccountsRbacTab';
import ContentModerationTab from '@/components/Admin/modules/ContentModerationTab';
import LeadsPipelineTab from '@/components/Admin/modules/LeadsPipelineTab';
import OverviewTab from '@/components/Admin/modules/OverviewTab';
import SystemReleaseTab from '@/components/Admin/modules/SystemReleaseTab';
import { useModuleData } from '@/components/Admin/modules/ui';
import Button from '@/components/Button';
import type { RootStackScreenProps } from '@/navigation/types';
import { fetchCommandOverview } from '@/services/commandCenter';
import { useStaffStore } from '@/store';
import { useCommandCenterStore, type CommandModule } from '@/store/useCommandCenterStore';
import { useUiStore } from '@/store/useUiStore';
import { isWeb } from '@/utils/platform';
import { COLORS } from '@/utils/constants';

/**
 * Admin Command Center (/quan-tri/dieu-hanh): one place for KPIs & tuition, the lead pipeline,
 * academic queues, EduFeed moderation, accounts and release control — filtered by branch + time range.
 * Admin only (owners); everyone else gets a polite stop screen.
 */
export default function AdminCommandCenterScreen({ navigation }: RootStackScreenProps<'AdminCommandCenter'>) {
  const status = useStaffStore((s) => s.status);
  const isAdmin = useStaffStore((s) => s.isAdmin);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'));

  if (status === 'unknown') {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }
  if (!isAdmin) return <NotAdmin signedIn={status === 'signedIn'} onSignIn={() => navigation.navigate('AdminLogin')} onHome={() => navigation.navigate('MainTabs', { screen: 'Home' })} />;
  return <CommandCenter navigation={navigation} onBack={goBack} />;
}

function CommandCenter({ navigation, onBack }: { navigation: RootStackScreenProps<'AdminCommandCenter'>['navigation']; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { branch, range, module } = useCommandCenterStore();
  // Web: use the full browser width here (tablet / desktop split panes); other screens stay phone-width.
  const setWideLayout = useUiStore((s) => s.setWideLayout);
  useFocusEffect(
    useCallback(() => {
      if (!isWeb) return undefined;
      setWideLayout(true);
      return () => setWideLayout(false);
    }, [setWideLayout]),
  );
  // Small counts for the module rail (refreshes with the filters / "Làm mới").
  const badges = useModuleData(() => fetchCommandOverview(branch, range), [branch, range]).data?.queues;
  const badgeMap: Partial<Record<CommandModule, number>> = badges
    ? { LEADS_CRM: badges.newLeads, ACADEMIC_OPS: badges.attendanceRequests, CONTENT_FEED: badges.commentsToday, ACCOUNTS_RBAC: badges.deletionRequests }
    : {};

  return (
    <View className="flex-1 bg-surface" testID="command-center">
      <CommandTopBar onBack={onBack} badges={badgeMap} />
      <ScrollView contentContainerClassName="gap-3 px-3 pt-3" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <CommandFilters />
        {module === 'OVERVIEW' && <OverviewTab onOpenReceipt={(id) => navigation.navigate('Payment', { id })} onOpenCrm={() => navigation.navigate('AdminDashboard')} />}
        {module === 'LEADS_CRM' && <LeadsPipelineTab onOpenCrm={() => navigation.navigate('AdminDashboard')} />}
        {module === 'ACADEMIC_OPS' && <AcademicOpsTab onOpenClasses={() => navigation.navigate('Classes')} onOpenParents={() => navigation.navigate('AccountManagement')} />}
        {module === 'CONTENT_FEED' && (
          <ContentModerationTab onEditVideo={(id) => navigation.navigate('VideoEditor', { id })} onNewVideo={() => navigation.navigate('VideoEditor')} onNewPortfolio={() => navigation.navigate('TeacherUpload')} />
        )}
        {module === 'ACCOUNTS_RBAC' && <AccountsRbacTab onCreateParent={() => navigation.navigate('AccountManagement')} onOpenStaffAccounts={() => navigation.navigate('StaffAccounts')} />}
        {module === 'SYSTEM_RELEASE' && <SystemReleaseTab />}
      </ScrollView>
    </View>
  );
}

function NotAdmin({ signedIn, onSignIn, onHome }: { signedIn: boolean; onSignIn: () => void; onHome: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface px-8" testID="command-not-admin">
      <View className="h-16 w-16 items-center justify-center rounded-3xl bg-amber-50">
        <ShieldAlert size={30} color="#B45309" />
      </View>
      <Text className="text-center text-[20px] font-extrabold text-ink">Chỉ dành cho quản trị viên</Text>
      <Text className="text-center text-[14px] leading-5 text-ink-muted">
        {signedIn ? 'Tài khoản này không có quyền xem Trung tâm điều hành. Nhờ chủ trung tâm cấp quyền quản trị nếu cần.' : 'Đăng nhập bằng tài khoản quản trị để xem số liệu và xử lý công việc của cả 2 cơ sở.'}
      </Text>
      <Button title="Đăng nhập quản trị" size="lg" className="self-stretch" onPress={onSignIn} testID="command-admin-login" />
      <Button title="Về trang chủ" variant="ghost" className="self-stretch" onPress={onHome} />
    </View>
  );
}
