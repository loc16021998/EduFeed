import { MessageCircle, Phone } from 'lucide-react-native';
import { memo } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { Badge } from '@/components';
import { STATUS_UI } from '@/screens/Staff/components/TrialLeadCard';
import type { DashboardLead, LeadStatus, LeadStatusGroup } from '@/types';
import { CATEGORY_COLORS, CATEGORY_LABELS, CHANNEL_LABELS, COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { CAMPUSES } from '@/utils/mockData';

import { formatDateTime } from '../format';

const SHORT_STATUS: Record<LeadStatus, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  CONFIRMED: 'Đã xác nhận lịch',
  REMINDED_24H: 'Đã nhắc lịch',
  REMINDED_2H: 'Đã nhắc lịch',
  COMPLETED_TRIAL: 'Đã học thử',
  ENROLLED: 'Đã nhập học',
  CANCELLED: 'Đã hủy',
};

export const GROUP_FILTERS: { id: LeadStatusGroup; label: string }[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'TO_CONTACT', label: 'Cần liên hệ' },
  { id: 'SCHEDULED', label: 'Đã đặt lịch' },
  { id: 'TRIAL_DONE', label: 'Đã học thử' },
  { id: 'ENROLLED', label: 'Đã nhập học' },
  { id: 'CANCELLED', label: 'Đã hủy' },
];

const campusCode = (id: DashboardLead['campus']) => CAMPUSES.find((c) => c.id === id)?.code ?? id;

/** Column widths for the wide (table) layout; the parent / student columns share the rest. */
const COL = { campus: 64, channel: 150, status: 130, date: 92, actions: 168 } as const;

export function StatusFilterBar({ value, onChange }: { value: LeadStatusGroup; onChange: (g: LeadStatusGroup) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" accessibilityRole="tablist">
      {GROUP_FILTERS.map((f) => {
        const active = f.id === value;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`rounded-full px-3.5 py-1.5 ${active ? 'bg-ink' : 'border border-slate-200 bg-white'}`}
          >
            <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink-muted'}`}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function LeadTableHeader() {
  const h = 'text-[11px] font-bold uppercase tracking-wide text-ink-subtle';
  return (
    <View className="flex-row items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
      <Text className={`flex-1 ${h}`}>Phụ huynh</Text>
      <Text className={`flex-1 ${h}`}>Học sinh & khóa học</Text>
      <Text className={h} style={{ width: COL.campus }}>Cơ sở</Text>
      <Text className={h} style={{ width: COL.channel }}>Nguồn</Text>
      <Text className={h} style={{ width: COL.status }}>Trạng thái</Text>
      <Text className={h} style={{ width: COL.date }}>Ngày ĐK</Text>
      <Text className={`${h} text-right`} style={{ width: COL.actions }}>Liên hệ</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const ui = STATUS_UI[status];
  return (
    <View className="self-start rounded-full px-2.5 py-1" style={{ backgroundColor: ui.bg }}>
      <Text className="text-[11px] font-bold" style={{ color: ui.fg }} numberOfLines={1}>
        {SHORT_STATUS[status]}
      </Text>
    </View>
  );
}

const call = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => {});
// zalo.me/<phone> opens a chat with that number in Zalo (app or web), if the number has a Zalo account.
const zalo = (phone: string) => Linking.openURL(`https://zalo.me/${phone}`).catch(() => {});

function Actions({ lead, compact }: { lead: DashboardLead; compact?: boolean }) {
  return (
    <View className={`flex-row gap-2 ${compact ? '' : 'justify-end'}`}>
      <Pressable
        onPress={() => call(lead.phone)}
        accessibilityRole="button"
        accessibilityLabel={`Gọi ${lead.parentName}, số ${formatPhone(lead.phone)}`}
        className={`flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 active:bg-slate-50 ${compact ? 'flex-1' : ''}`}
      >
        <Phone size={14} color={COLORS.ink} />
        <Text className="text-[13px] font-semibold text-ink">Gọi</Text>
      </Pressable>
      <Pressable
        onPress={() => zalo(lead.phone)}
        accessibilityRole="link"
        accessibilityLabel={`Mở Zalo chat với ${lead.parentName}`}
        className={`flex-row items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 active:bg-brand-600 ${compact ? 'flex-1' : ''}`}
      >
        <MessageCircle size={14} color="#fff" />
        <Text className="text-[13px] font-semibold text-white">Chat Zalo</Text>
      </Pressable>
    </View>
  );
}

interface RowProps {
  lead: DashboardLead;
  /** Table row (desktop) vs stacked card (phone). */
  wide: boolean;
  last?: boolean;
}

function LeadRowBase({ lead, wide, last }: RowProps) {
  const channel = CHANNEL_LABELS[lead.channel];
  if (wide) {
    return (
      <View className={`flex-row items-center gap-3 bg-white px-4 py-3 ${last ? '' : 'border-b border-slate-100'}`} testID="lead-row">
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-ink" numberOfLines={1}>{lead.parentName}</Text>
          <Text className="text-xs text-ink-muted">{formatPhone(lead.phone)} · {lead.code}</Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-[14px] text-ink" numberOfLines={1}>
            {lead.studentName} <Text className="text-ink-muted">({lead.studentAge} tuổi)</Text>
          </Text>
          <Badge label={CATEGORY_LABELS[lead.course]} color={CATEGORY_COLORS[lead.course]} />
        </View>
        <Text className="text-[13px] font-semibold text-ink" style={{ width: COL.campus }}>{campusCode(lead.campus)}</Text>
        <View style={{ width: COL.channel }}>
          <Text className={`text-[13px] ${lead.channel === 'UNTRACKED' ? 'text-ink-subtle' : 'text-ink'}`} numberOfLines={1}>{channel}</Text>
          {!!lead.campaign && <Text className="text-[11px] text-ink-muted" numberOfLines={1}>{lead.campaign}</Text>}
        </View>
        <View style={{ width: COL.status }}>
          <StatusBadge status={lead.status} />
        </View>
        <Text className="text-xs text-ink-muted" style={{ width: COL.date }}>{formatDateTime(lead.createdAt)}</Text>
        <View style={{ width: COL.actions }}>
          <Actions lead={lead} />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2.5 rounded-3xl bg-white p-4" testID="lead-row">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>{lead.parentName}</Text>
          <Text className="text-xs text-ink-muted">{formatPhone(lead.phone)} · {lead.code}</Text>
        </View>
        <StatusBadge status={lead.status} />
      </View>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="text-[13px] text-ink">
          {lead.studentName} <Text className="text-ink-muted">({lead.studentAge} tuổi)</Text>
        </Text>
        <Badge label={CATEGORY_LABELS[lead.course]} color={CATEGORY_COLORS[lead.course]} />
      </View>
      <Text className="text-xs text-ink-muted">
        {campusCode(lead.campus)} · {channel}
        {lead.campaign ? ` (${lead.campaign})` : ''} · {formatDateTime(lead.createdAt)}
      </Text>
      <Actions lead={lead} compact />
    </View>
  );
}

export const LeadRow = memo(LeadRowBase);
