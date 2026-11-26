import { BookOpenCheck, ChevronLeft, Clapperboard, LayoutDashboard, RefreshCw, Rocket, Target, UserCog, type LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CommandRange } from '@/services/commandCenter';
import { useCommandCenterStore, type CommandModule } from '@/store/useCommandCenterStore';
import type { CampusFilter } from '@/types';
import { haptics } from '@/utils/haptics';

export const MODULES: { id: CommandModule; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'OVERVIEW', label: 'Tổng quan KPI & Doanh thu', short: 'Tổng quan', icon: LayoutDashboard },
  { id: 'LEADS_CRM', label: 'Lead học thử & Chăm sóc', short: 'Lead & CRM', icon: Target },
  { id: 'ACADEMIC_OPS', label: 'Sổ liên lạc & Chuyên cần', short: 'Học vụ', icon: BookOpenCheck },
  { id: 'CONTENT_FEED', label: 'EduFeed & Before/After', short: 'Nội dung', icon: Clapperboard },
  { id: 'ACCOUNTS_RBAC', label: 'Tài khoản & Phân quyền', short: 'Tài khoản', icon: UserCog },
  { id: 'SYSTEM_RELEASE', label: 'OTA / Phiên bản App', short: 'Hệ thống', icon: Rocket },
];

const BRANCHES: { id: CampusFilter; label: string }[] = [
  { id: 'ALL', label: 'Tất cả cơ sở' },
  { id: 'XA_LA', label: 'CS1: Xa La' },
  { id: 'NGO_THI_NHAM', label: 'CS2: Ngô Thì Nhậm' },
];
const RANGES: { id: CommandRange; label: string }[] = [
  { id: 'TODAY', label: 'Hôm nay' },
  { id: '7D', label: '7 ngày' },
  { id: '30D', label: '30 ngày' },
];

/** Dark header of the command center: back, refresh, branch + time filters, module rail. */
export default function CommandTopBar({ onBack, badges }: { onBack: () => void; badges?: Partial<Record<CommandModule, number>> }) {
  const insets = useSafeAreaInsets();
  const { module, setModule, refresh } = useCommandCenterStore();
  const current = MODULES.find((m) => m.id === module) ?? MODULES[0];

  return (
    <View className="gap-2.5 bg-ink pb-3" style={{ paddingTop: insets.top + 6 }} testID="command-top-bar">
      <View className="flex-row items-center gap-2 px-3">
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Quay lại" className="h-11 w-11 items-center justify-center rounded-full active:bg-white/10">
          <ChevronLeft size={24} color="#fff" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">Trung tâm điều hành</Text>
          <Text className="text-[17px] font-extrabold text-white" numberOfLines={1} accessibilityRole="header" testID="command-title">
            {current.label}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            haptics.light();
            refresh();
          }}
          accessibilityRole="button"
          accessibilityLabel="Làm mới"
          className="h-11 w-11 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          testID="command-refresh"
        >
          <RefreshCw size={18} color="#fff" />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-3" accessibilityRole="tablist">
        {MODULES.map((m) => {
          const on = m.id === module;
          const Icon = m.icon;
          const badge = badges?.[m.id] ?? 0;
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                haptics.light();
                setModule(m.id);
              }}
              accessibilityRole="tab"
              aria-selected={on}
              accessibilityState={{ selected: on }}
              accessibilityLabel={badge > 0 ? `${m.label}, ${badge} việc chờ` : m.label}
              className={`h-11 flex-row items-center gap-1.5 rounded-2xl px-3.5 ${on ? 'bg-white' : 'bg-white/10 active:bg-white/20'}`}
              testID={`module-${m.id}`}
            >
              <Icon size={16} color={on ? '#0F172A' : '#fff'} />
              <Text className={`text-[13px] font-bold ${on ? 'text-ink' : 'text-white'}`}>{m.short}</Text>
              {badge > 0 && (
                <View className="min-w-[20px] items-center rounded-full bg-red-500 px-1.5">
                  <Text className="text-[11px] font-black text-white">{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Global context bar: branch + time range, three equal segments each (always fully visible on a phone). */
export function CommandFilters() {
  const { branch, range, setBranch, setRange } = useCommandCenterStore();
  const wide = useWindowDimensions().width >= 720;
  return (
    <View className={wide ? 'flex-row gap-2' : 'gap-2'} testID="command-filters">
      <View className={wide ? 'flex-[3]' : ''}>
        <Segmented options={BRANCHES} value={branch} onChange={setBranch} prefix="branch" label="Cơ sở" />
      </View>
      <View className={wide ? 'flex-[2]' : ''}>
        <Segmented options={RANGES} value={range} onChange={setRange} prefix="range" label="Khoảng thời gian" />
      </View>
    </View>
  );
}

function Segmented<T extends string>({ options, value, onChange, prefix, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; prefix: string; label: string }) {
  return (
    <View className="flex-row rounded-2xl bg-slate-200/70 p-1" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              haptics.light();
              onChange(o.id);
            }}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityState={{ checked: on }}
            className={`min-h-11 flex-1 items-center justify-center rounded-xl px-1 ${on ? 'bg-white shadow-sm shadow-black/10' : 'active:bg-white/50'}`}
            testID={`${prefix}-${o.id}`}
          >
            <Text className={`text-center text-[12.5px] font-bold leading-4 ${on ? 'text-ink' : 'text-ink-muted'}`} numberOfLines={2}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
