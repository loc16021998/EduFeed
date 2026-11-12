import { useFocusEffect } from '@react-navigation/native';
import { CalendarCheck, ChevronLeft, Percent, RefreshCw, Users, Wallet } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import logo from '@/assets/branding/play-store-512.png';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { useDashboardStore, useStaffStore, useUiStore } from '@/store';
import type { DashboardLead, DashboardPeriod, DashboardSummary } from '@/types';
import { CATEGORY_LABELS, COLORS } from '@/utils/constants';
import { isWeb, MAX_WIDE_WIDTH } from '@/utils/platform';

import CampusDropdown from './components/CampusDropdown';
import ChannelBreakdown from './components/ChannelBreakdown';
import ConversionFunnel from './components/ConversionFunnel';
import CourseFeesModal from './components/CourseFeesModal';
import KpiCard from './components/KpiCard';
import { LeadRow, LeadTableHeader, StatusFilterBar } from './components/LeadTable';
import { formatInt, formatPct, formatVnd, formatVndShort, growth, monthLabel } from './format';

const LOGO: ImageSourcePropType = typeof logo === 'string' ? { uri: logo } : logo;
const PERIODS: DashboardPeriod[] = [7, 30, 90];

/** Owner / admin overview: KPIs, traffic sources, conversion funnel and the lead list. Staff only. */
export default function DashboardScreen({ navigation }: RootStackScreenProps<'AdminDashboard'>) {
  const { status: authStatus, isStaff, isAdmin, demo } = useStaffStore();
  const {
    campus, period, group, summary, summaryStatus, summaryError, leads, leadsStatus, leadsError, hasMore, loadingMore, fees,
    setCampus, setPeriod, setGroup, refresh, loadMore, loadFees, saveFees,
  } = useDashboardStore();
  const setWideLayout = useUiStore((s) => s.setWideLayout);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [feesOpen, setFeesOpen] = useState(false);

  useEffect(() => {
    if (authStatus === 'signedOut' || (authStatus === 'signedIn' && !isStaff)) navigation.replace('AdminLogin');
    // Business data is for admins only (the database enforces this too).
    else if (authStatus === 'signedIn' && !isAdmin) navigation.replace('StaffVideos');
  }, [authStatus, isStaff, isAdmin, navigation]);

  useEffect(() => {
    if (isAdmin) {
      refresh();
      loadFees();
    }
  }, [isAdmin, refresh, loadFees]);

  // Web: use the full browser width while this screen is shown (other screens stay phone-width).
  useFocusEffect(
    useCallback(() => {
      if (!isWeb) return undefined;
      setWideLayout(true);
      return () => setWideLayout(false);
    }, [setWideLayout]),
  );

  const width = isWeb ? Math.min(windowWidth, MAX_WIDE_WIDTH) : windowWidth;
  const desktop = width >= 960;
  const tableMode = width >= 820;
  const kpiBasis = desktop ? '22%' : '40%';
  const updatedAt = useMemo(() => (summary ? new Date() : null), [summary]);

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome'));

  const header = (
    <View style={{ paddingTop: insets.top }} className="border-b border-slate-100 bg-white">
      <View className="flex-row items-center gap-2 px-3 py-2.5">
        <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Quay lại" hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100">
          <ChevronLeft size={24} color={COLORS.ink} />
        </Pressable>
        <Image source={LOGO} style={{ width: 36, height: 36, borderRadius: 10 }} accessibilityIgnoresInvertColors accessible={false} />
        <View className="flex-1">
          <Text className="text-[17px] font-extrabold text-ink" accessibilityRole="header" numberOfLines={1}>
            Tổng quan kinh doanh
          </Text>
          <Text className="text-xs text-ink-muted" numberOfLines={1}>
            TH EDU{updatedAt ? ` · cập nhật ${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}` : ''}
          </Text>
        </View>
        {desktop && <CampusDropdown value={campus} onChange={setCampus} full />}
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel="Tải lại số liệu"
          className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white active:bg-slate-50"
        >
          {summaryStatus === 'loading' ? <ActivityIndicator size="small" color={COLORS.brand} /> : <RefreshCw size={17} color={COLORS.ink} />}
        </Pressable>
      </View>
    </View>
  );

  const filters = (
    <View className="flex-row flex-wrap items-center gap-2">
      {!desktop && <CampusDropdown value={campus} onChange={setCampus} />}
      <View className="flex-row rounded-full bg-slate-200/70 p-1" accessibilityRole="radiogroup" accessibilityLabel="Khoảng thời gian">
        {PERIODS.map((p) => {
          const active = p === period;
          return (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              className={`rounded-full px-3.5 py-1.5 ${active ? 'bg-white shadow-sm shadow-black/10' : ''}`}
            >
              <Text className={`text-[13px] font-semibold ${active ? 'text-ink' : 'text-ink-muted'}`}>{p} ngày</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const listHeader = (
    <View className="gap-4 pb-3 pt-4">
      {filters}
      {(demo || !hasSupabase) && (
        <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
          Dữ liệu mẫu: kết nối Supabase để xem số liệu thật của trung tâm.
        </Text>
      )}
      {!!summaryError && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{summaryError}</Text>}

      <Kpis
        summary={summary}
        basis={kpiBasis}
        onOpenTrials={() => navigation.navigate('StaffTrials')}
        onOpenFees={() => setFeesOpen(true)}
      />

      {summary && (
        <View className={desktop ? 'flex-row items-start gap-4' : 'gap-4'}>
          <View className={desktop ? 'flex-1' : ''}>
            <ChannelBreakdown channels={summary.channels} periodDays={summary.periodDays} />
          </View>
          <View className={desktop ? 'flex-1' : ''}>
            <ConversionFunnel funnel={summary.funnel} periodDays={summary.periodDays} campusFiltered={campus !== 'ALL'} />
          </View>
        </View>
      )}

      <View className="gap-3 pt-2">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-base font-bold text-ink" accessibilityRole="header">
            Danh sách đăng ký
          </Text>
          <Text className="text-xs text-ink-muted">{period} ngày qua</Text>
        </View>
        <StatusFilterBar value={group} onChange={setGroup} />
        {!!leadsError && <Text className="rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{leadsError}</Text>}
      </View>
      {tableMode && leads.length > 0 && (
        <View className="-mb-3 overflow-hidden rounded-t-3xl border border-b-0 border-slate-100">
          <LeadTableHeader />
        </View>
      )}
    </View>
  );

  const footer = (
    <View className={tableMode && leads.length > 0 ? 'overflow-hidden rounded-b-3xl border border-t-0 border-slate-100 bg-white' : ''}>
      <View className="items-center py-4">
        {loadingMore ? (
          <ActivityIndicator color={COLORS.brand} />
        ) : hasMore ? (
          <Pressable onPress={loadMore} accessibilityRole="button" className="rounded-full border border-slate-200 bg-white px-5 py-2 active:bg-slate-50">
            <Text className="text-[13px] font-semibold text-ink">Tải thêm</Text>
          </Pressable>
        ) : leads.length > 0 ? (
          <Text className="text-xs text-ink-subtle">Đã hiển thị tất cả {leads.length} đăng ký</Text>
        ) : null}
      </View>
    </View>
  );

  const renderItem = useCallback(
    ({ item, index }: { item: DashboardLead; index: number }) => (
      <LeadRow lead={item} wide={tableMode} last={index === leads.length - 1 && !hasMore} />
    ),
    [tableMode, leads.length, hasMore],
  );

  return (
    <View className="flex-1 bg-surface">
      {header}
      <FlatList
        data={leads}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={footer}
        ItemSeparatorComponent={tableMode ? null : CardGap}
        ListEmptyComponent={
          leadsStatus === 'loading' ? (
            <ActivityIndicator className="mt-8" color={COLORS.brand} />
          ) : leadsStatus === 'success' ? (
            <Text className="mt-6 text-center text-ink-muted">Không có đăng ký nào phù hợp bộ lọc.</Text>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={isWeb ? undefined : <RefreshControl refreshing={false} onRefresh={refresh} tintColor={COLORS.brand} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: MAX_WIDE_WIDTH, alignSelf: 'center' }}
      />

      <CourseFeesModal visible={feesOpen} fees={fees} onSave={saveFees} onClose={() => setFeesOpen(false)} />
    </View>
  );
}

function CardGap() {
  return <View className="h-3" />;
}

interface KpisProps {
  summary: DashboardSummary | null;
  basis: string;
  onOpenTrials: () => void;
  onOpenFees: () => void;
}

function Kpis({ summary: s, basis, onOpenTrials, onOpenFees }: KpisProps) {
  const style = { flexBasis: basis as `${number}%`, flexGrow: 1 };
  const icon = (I: typeof Users) => <I size={17} color={COLORS.brand} />;

  if (!s) {
    return (
      <View className="flex-row flex-wrap gap-3">
        {['Đăng ký mới', 'Tỉ lệ chốt sau học thử', 'Học thử hôm nay', 'Doanh thu dự kiến'].map((l) => (
          <KpiCard key={l} style={style} icon={icon(Users)} label={l} value="…" />
        ))}
      </View>
    );
  }

  const conv = formatPct(s.trialConversion.enrolled, s.trialConversion.completed, 1);
  const r = s.revenue;
  const missing = r.missingFeeCourses.map((c) => CATEGORY_LABELS[c]).join(', ');
  const remaining = Math.max(0, s.trialsToday.scheduled - s.trialsToday.completed);

  return (
    <View className="flex-row flex-wrap gap-3">
      <KpiCard
        testID="kpi-leads"
        style={style}
        icon={icon(Users)}
        label="Đăng ký mới"
        value={formatInt(s.leads.current)}
        change={growth(s.leads.current, s.leads.previous)}
        changeLabel={`so với ${s.periodDays} ngày trước đó (${s.leads.previous})`}
      />
      <KpiCard
        testID="kpi-conversion"
        style={style}
        icon={icon(Percent)}
        label="Tỉ lệ chốt sau học thử"
        value={conv ?? '—'}
        detail={
          s.trialConversion.completed
            ? `${s.trialConversion.enrolled}/${s.trialConversion.completed} bé học thử trong kỳ đã nhập học`
            : 'Chưa có buổi học thử hoàn thành trong kỳ'
        }
      />
      <KpiCard
        testID="kpi-today"
        style={style}
        icon={icon(CalendarCheck)}
        label="Học thử hôm nay"
        value={formatInt(s.trialsToday.scheduled)}
        detail={s.trialsToday.scheduled ? `Đã học xong ${s.trialsToday.completed} · còn ${remaining} buổi` : 'Hôm nay không có lịch học thử'}
        onPress={onOpenTrials}
        accessibilityHint="Mở lịch học thử"
        footer={<Text className="text-xs font-semibold text-brand-600">Xem lịch học thử →</Text>}
      />
      <KpiCard
        testID="kpi-revenue"
        style={style}
        icon={icon(Wallet)}
        label="Doanh thu dự kiến"
        value={r.enrolled > 0 && r.priced === 0 ? '—' : formatVndShort(r.totalVnd)}
        detail={
          r.enrolled === 0
            ? `Chưa có bé nhập học trong ${monthLabel(r.monthStart)}`
            : `Học phí tháng đầu của ${r.priced}/${r.enrolled} bé nhập học ${monthLabel(r.monthStart)}${r.totalVnd ? ` (${formatVnd(r.totalVnd)})` : ''}`
        }
        footer={
          <View className="gap-1">
            {!!missing && <Text className="text-xs leading-[17px] text-amber-800">Chưa nhập học phí: {missing}</Text>}
            <Pressable onPress={onOpenFees} accessibilityRole="button" className="self-start py-0.5">
              <Text className="text-xs font-semibold text-brand-600">{missing ? 'Nhập học phí →' : 'Sửa học phí →'}</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
