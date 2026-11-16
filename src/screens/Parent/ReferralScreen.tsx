import { CheckCircle2, Copy, Facebook, Gift, MessageCircleMore, Sparkles, Ticket, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader, Skeleton } from '@/components';
import Gradient from '@/components/media/Gradient';
import { hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { shortVnd } from '@/screens/Booking/components/ReferralCodeField';
import { fetchMyReferrals, referralShareLink, type MyReferrals, type ReferralStatus } from '@/services/referrals';
import { useParentStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { shareText } from '@/utils/platform';

import { formatVnd, vnDateTime } from '../../../supabase/functions/_shared/payments';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra, vui lòng thử lại.');
const isWeb = Platform.OS === 'web';
const dmy = (iso: string) => vnDateTime(iso).slice(0, 10);

const FRIEND_STATUS: Record<ReferralStatus, { label: (reward: number | null) => string; cls: string }> = {
  PENDING_TRIAL: { label: () => 'Đã đăng ký học thử', cls: 'bg-sky-50 text-sky-700' },
  PENDING_PAYMENT: { label: () => 'Đã học thử · chờ nhập học', cls: 'bg-amber-50 text-amber-800' },
  REWARDED: { label: (r) => `Đã nhập học ➔ Đã cộng ${r ? shortVnd(r) : 'voucher'}`, cls: 'bg-emerald-50 text-emerald-700' },
  VOID: { label: () => 'Đã hủy lịch', cls: 'bg-slate-100 text-slate-500' },
};

/** Parents: referral code, share, rewards earned, vouchers, invited friends. Route /con-toi/gioi-thieu. */
export default function ReferralScreen({ navigation }: RootStackScreenProps<'Referral'>) {
  const insets = useSafeAreaInsets();
  const status = useParentStore((s) => s.status);
  const [data, setData] = useState<MyReferrals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (status === 'signedOut') navigation.replace('ParentAuth');
  }, [status, navigation]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMyReferrals());
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (status === 'signedIn') load();
  }, [status, load]);

  const p = data?.program;
  const link = data ? referralShareLink(data.code) : '';
  const message = data
    ? `Mình cho con học ở TH EDU thấy rất ổn. Ba mẹ đăng ký học thử miễn phí cho bé tại đây` +
      (p?.active && p.refereeDiscountVnd > 0 ? ` — nhập mã ${data.code} được giảm ${formatVnd(p.refereeDiscountVnd)} học phí khóa đầu` : ` (mã giới thiệu ${data.code})`) +
      `: ${link}`
    : '';

  const copy = async () => {
    if (!data) return;
    if (isWeb && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(data.code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } else {
      // Native: the share sheet has "Sao chép".
      await Share.share({ message: data.code }).catch(() => {});
    }
  };
  const shareZalo = () => shareText(message).catch(() => {});
  const shareFacebook = () => Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`).catch(() => {});

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Giới thiệu bạn bè" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ParentPortal'))} />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pt-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={COLORS.brand} />}
        testID="referral-screen"
      >
        {!hasSupabase && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Dữ liệu mẫu: số liệu và voucher bên dưới chỉ để minh họa.</Text>}
        {!!error && (
          <View className="gap-2">
            <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>
            <Button title="Thử lại" size="sm" variant="outline" onPress={load} />
          </View>
        )}
        {!data && loading && (
          <View className="gap-3">
            <Skeleton height={170} radius={24} />
            <Skeleton height={120} radius={24} />
          </View>
        )}

        {data && p && (
          <>
            <Gradient colors={['#F97316', '#EC4899', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24 }}>
              <View className="gap-2 p-5" testID="referral-banner">
                <View className="flex-row items-center gap-2">
                  <Sparkles size={18} color="#fff" />
                  <Text className="text-xs font-bold uppercase tracking-widest text-white/90">Chương trình giới thiệu</Text>
                </View>
                <Text className="text-[22px] font-black leading-7 text-white" accessibilityRole="header">
                  Giới thiệu bạn bè - Nhận ngay quà khủng cho con
                </Text>
                {p.active ? (
                  <Text className="text-[14px] leading-5 text-white/95">
                    {p.referrerRewardVnd > 0 ? `Mỗi bạn bè nhập học, ba mẹ nhận voucher ${formatVnd(p.referrerRewardVnd)} trừ vào học phí của bé` : 'Mỗi bạn bè nhập học là một lời cảm ơn từ TH EDU'}
                    {p.refereeDiscountVnd > 0 ? `; bạn bè được giảm ${formatVnd(p.refereeDiscountVnd)} khóa đầu.` : '.'}
                  </Text>
                ) : (
                  <Text className="text-[14px] leading-5 text-white/95">Chương trình đang tạm dừng — mã của ba mẹ vẫn được giữ cho lần sau.</Text>
                )}
              </View>
            </Gradient>

            <View className="gap-3 rounded-3xl bg-white p-4">
              <Text className="text-[13px] font-semibold text-ink-muted">Mã giới thiệu của ba mẹ</Text>
              <View className="flex-row items-center justify-between rounded-2xl border-2 border-dashed border-accent-300 bg-accent-50/40 px-4 py-3">
                <Text selectable className="text-[26px] font-black tracking-[4px] text-ink" testID="my-referral-code">
                  {data.code}
                </Text>
                <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel="Sao chép mã giới thiệu" className="h-10 flex-row items-center gap-1.5 rounded-full bg-ink px-4 active:opacity-80">
                  {copied ? <CheckCircle2 size={15} color="#fff" /> : <Copy size={15} color="#fff" />}
                  <Text className="text-[13px] font-bold text-white">{copied ? 'Đã chép' : 'Sao chép mã'}</Text>
                </Pressable>
              </View>
              <View className="flex-row gap-2.5">
                <Button className="flex-1" title="Gửi qua Zalo" icon={<MessageCircleMore size={16} color="#fff" />} onPress={shareZalo} />
                <Button className="flex-1" title="Facebook" variant="outline" icon={<Facebook size={16} color={COLORS.brand} />} onPress={shareFacebook} />
              </View>
              <Text className="text-[11px] leading-4 text-ink-subtle">Bạn bè mở link sẽ thấy mã điền sẵn trong form đăng ký học thử.</Text>
            </View>

            <View className="flex-row gap-2.5" testID="referral-stats">
              <Stat icon={<Users size={16} color={COLORS.brand} />} value={String(data.stats.invited)} label="Bạn bè đã giới thiệu" />
              <Stat icon={<CheckCircle2 size={16} color="#059669" />} value={String(data.stats.rewarded)} label="Nhập học thành công" />
              <Stat icon={<Gift size={16} color="#DB2777" />} value={data.stats.earnedVnd ? shortVnd(data.stats.earnedVnd) : '0'} label="Voucher đã nhận" />
            </View>

            <View className="gap-2.5 rounded-3xl bg-white p-4" testID="voucher-list">
              <Text className="text-[15px] font-bold text-ink">Voucher của ba mẹ</Text>
              {data.vouchers.length === 0 ? (
                <Text className="text-[13px] leading-5 text-ink-muted">Chưa có voucher. Voucher được cộng khi bạn bè đóng học phí khóa đầu tiên.</Text>
              ) : (
                data.vouchers.map((v) => {
                  const usable = v.status === 'AVAILABLE';
                  return (
                    <View key={v.code} className={`flex-row items-center gap-3 rounded-2xl border p-3 ${usable ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                      <Ticket size={22} color={usable ? '#059669' : COLORS.subtle} />
                      <View className="flex-1">
                        <Text className={`text-[15px] font-extrabold ${usable ? 'text-emerald-800' : 'text-ink-muted'}`}>{formatVnd(v.amountVnd)}</Text>
                        <Text selectable className="text-xs text-ink-muted">
                          Mã {v.code} · {v.status === 'USED' ? 'đã dùng' : v.status === 'EXPIRED' ? `hết hạn ${dmy(v.expiresAt)}` : `HSD ${dmy(v.expiresAt)}`}
                        </Text>
                      </View>
                      {usable && <Text className="text-[11px] font-bold text-emerald-700">Dùng được</Text>}
                    </View>
                  );
                })
              )}
              {data.vouchers.some((v) => v.status === 'AVAILABLE') && <Text className="text-[11px] leading-4 text-ink-subtle">Khi đóng học phí, ba mẹ báo mã voucher để trung tâm trừ vào hóa đơn của bé.</Text>}
            </View>

            <View className="gap-2.5 rounded-3xl bg-white p-4" testID="friend-list">
              <Text className="text-[15px] font-bold text-ink">Bạn bè ba mẹ đã giới thiệu</Text>
              {data.friends.length === 0 ? (
                <Text className="text-[13px] leading-5 text-ink-muted">Chưa có ai. Chia sẻ mã để bạn bè đăng ký học thử miễn phí cho bé nhé!</Text>
              ) : (
                data.friends.map((f, i) => {
                  const st = FRIEND_STATUS[f.status];
                  return (
                    <View key={`${f.name}-${f.createdAt}-${i}`} className="flex-row items-center justify-between gap-2 border-b border-slate-100 pb-2.5 last:border-b-0">
                      <View className="flex-1">
                        <Text className="text-[14px] font-semibold text-ink">{f.name}</Text>
                        <Text className="text-[11px] text-ink-subtle">Giới thiệu ngày {dmy(f.createdAt)}</Text>
                      </View>
                      <Text className={`overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-bold ${st.cls}`}>{st.label(f.rewardVnd)}</Text>
                    </View>
                  );
                })
              )}
            </View>

            <View className="gap-1.5 px-1">
              <Text className="text-xs font-bold text-ink-muted">Cách nhận quà</Text>
              <Text className="text-xs leading-[18px] text-ink-muted">1. Bạn bè đăng ký học thử bằng mã của ba mẹ (gia đình mới, chưa từng học tại TH EDU).</Text>
              <Text className="text-xs leading-[18px] text-ink-muted">2. Bé học thử, gia đình đóng học phí khóa đầu.</Text>
              <Text className="text-xs leading-[18px] text-ink-muted">3. Voucher tự động cộng vào tài khoản ba mẹ và báo qua Zalo.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View className="flex-1 gap-1 rounded-2xl bg-white p-3">
      {icon}
      <Text className="text-[20px] font-black text-ink">{value}</Text>
      <Text className="text-[11px] leading-[14px] text-ink-muted">{label}</Text>
    </View>
  );
}
