import { CheckCircle2, CircleAlert, CircleDashed, Clock, Gift, MapPin, MinusCircle, Phone } from 'lucide-react-native';
import { memo } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Badge, Button } from '@/components';

import { PROMO_CODES } from '../../../../supabase/functions/_shared/contracts';
import type { CrmLead, CrmMessageKind, LeadStatus } from '@/types';
import { CAMPUS_LABELS, CATEGORY_COLORS, CATEGORY_LABELS, COLORS, SOURCE_LABELS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';

export const STATUS_UI: Record<LeadStatus, { label: string; bg: string; fg: string }> = {
  NEW: { label: 'Mới — chưa xác nhận', bg: '#FEF3C7', fg: '#92400E' },
  CONTACTED: { label: 'Đã liên hệ', bg: '#E0E7FF', fg: '#3730A3' },
  CONFIRMED: { label: 'Đã xác nhận', bg: '#DBEAFE', fg: '#1E40AF' },
  REMINDED_24H: { label: 'Đã nhắc trước 1 ngày', bg: '#DBEAFE', fg: '#1E40AF' },
  REMINDED_2H: { label: 'Đã nhắc trước 2 giờ', bg: '#DBEAFE', fg: '#1E40AF' },
  COMPLETED_TRIAL: { label: 'Đã học thử', bg: '#D1FAE5', fg: '#065F46' },
  ENROLLED: { label: 'Đã nhập học 🎉', bg: '#D1FAE5', fg: '#065F46' },
  CANCELLED: { label: 'Đã hủy', bg: '#F1F5F9', fg: '#64748B' },
};

const MESSAGE_LABEL: Record<CrmMessageKind, string> = {
  CONFIRMATION: 'Xác nhận',
  REMINDER_24H: 'Nhắc 24h',
  REMINDER_2H: 'Nhắc 2h',
  POST_TRIAL: 'Sau học thử',
};

const vnTime = (iso: string | null) => {
  if (!iso) return 'Chưa có lịch';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${days[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

interface Props {
  lead: CrmLead;
  busy: boolean;
  onConfirm: (l: CrmLead) => void;
  onCancel: (l: CrmLead) => void;
  onComplete: (l: CrmLead) => void;
  onEnroll: (l: CrmLead) => void;
}

function TrialLeadCard({ lead, busy, onConfirm, onCancel, onComplete, onEnroll }: Props) {
  const st = STATUS_UI[lead.status];
  const awaitingConfirm = lead.status === 'NEW' || lead.status === 'CONTACTED';
  const scheduled = lead.status === 'CONFIRMED' || lead.status === 'REMINDED_24H' || lead.status === 'REMINDED_2H';
  const kinds = Object.keys(lead.messages) as CrmMessageKind[];

  return (
    <View className="gap-3 rounded-3xl bg-white p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Clock size={14} color={COLORS.brand} />
            <Text className="text-[15px] font-extrabold text-ink">{vnTime(lead.appointmentTime)}</Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Badge label={CATEGORY_LABELS[lead.course]} color={CATEGORY_COLORS[lead.course]} />
            <View className="flex-row items-center gap-1">
              <MapPin size={12} color={COLORS.muted} />
              <Text className="text-xs text-ink-muted">{CAMPUS_LABELS[lead.campus]}</Text>
            </View>
          </View>
        </View>
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: st.bg }}>
          <Text className="text-[11px] font-bold" style={{ color: st.fg }}>
            {st.label}
          </Text>
        </View>
      </View>

      <View className="gap-0.5">
        <Text className="text-[15px] font-bold text-ink">
          {lead.studentName} <Text className="font-normal text-ink-muted">({lead.studentAge} tuổi)</Text>
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-[13px] text-ink-muted">
            {lead.parentName} · {lead.code}
          </Text>
          <Pressable
            onPress={() => Linking.openURL(`tel:${lead.phone}`)}
            accessibilityRole="link"
            accessibilityLabel={`Gọi ${lead.parentName}`}
            className="flex-row items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 active:bg-brand-100"
          >
            <Phone size={13} color={COLORS.brand} />
            <Text className="text-xs font-bold text-brand-700">{formatPhone(lead.phone)}</Text>
          </Pressable>
        </View>
        <Text className="text-[11px] text-ink-subtle">Nguồn: {SOURCE_LABELS[lead.source as keyof typeof SOURCE_LABELS] ?? lead.source}</Text>
        {!!lead.promoCode && (
          <View className="mt-1 flex-row items-center gap-1.5 self-start rounded-full bg-amber-100 px-2.5 py-1" testID="lead-promo">
            <Gift size={12} color="#B45309" />
            <Text className="text-[11px] font-bold text-amber-800">
              {PROMO_CODES[lead.promoCode as keyof typeof PROMO_CODES] ?? lead.promoCode}
            </Text>
          </View>
        )}
      </View>

      {kinds.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {kinds.map((k) => {
            const m = lead.messages[k]!;
            const Icon = m.status === 'SENT' ? CheckCircle2 : m.status === 'FAILED' ? CircleAlert : m.status === 'SKIPPED' ? MinusCircle : CircleDashed;
            const color = m.status === 'SENT' ? '#059669' : m.status === 'FAILED' ? '#DC2626' : '#94A3B8';
            return (
              <View key={k} className="flex-row items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5" accessible accessibilityLabel={`Tin ${MESSAGE_LABEL[k]}: ${m.status}${m.error ? `, ${m.error}` : ''}`}>
                <Icon size={11} color={color} />
                <Text className="text-[10px] font-semibold text-ink-muted">Zalo {MESSAGE_LABEL[k]}</Text>
              </View>
            );
          })}
        </View>
      )}

      {!!lead.teacherNote && (
        <Text className="rounded-xl bg-emerald-50 p-2.5 text-xs italic leading-[18px] text-emerald-900">“{lead.teacherNote}”</Text>
      )}
      {!!lead.staffNote && <Text className="text-xs text-ink-muted">Ghi chú: {lead.staffNote}</Text>}

      {(awaitingConfirm || scheduled || lead.status === 'COMPLETED_TRIAL') && (
        <View className="flex-row gap-2 border-t border-slate-100 pt-3">
          {awaitingConfirm && <Button className="flex-[2]" size="sm" title="Xác nhận lịch" loading={busy} onPress={() => onConfirm(lead)} />}
          {scheduled && <Button className="flex-[2]" size="sm" variant="accent" title="Hoàn thành học thử" disabled={busy} onPress={() => onComplete(lead)} />}
          {lead.status === 'COMPLETED_TRIAL' && <Button className="flex-[2]" size="sm" title="Đã nhập học" loading={busy} onPress={() => onEnroll(lead)} />}
          {lead.status !== 'COMPLETED_TRIAL' && <Button className="flex-1" size="sm" variant="ghost" title="Hủy" disabled={busy} onPress={() => onCancel(lead)} />}
        </View>
      )}
    </View>
  );
}

export default memo(TrialLeadCard);
