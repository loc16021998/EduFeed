import { Gift, MapPinned, MessageCircleMore, Phone } from 'lucide-react-native';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, SuccessBurst } from '@/components';
import { ENV } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { buildZaloOAUrl } from '@/services/zalo';
import { useBookingStore } from '@/store';
import { hasHotline } from '@/config/env';
import { COLORS, CONTACT } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { nativeOnly } from '@/utils/platform';

const ZALO_BLUE = '#0068FF';
/** Shown only in dev when PUBLIC_ZALO_OA_ID isn't configured, so the layout can be reviewed. */
const DEMO_OA_ID = 'demo-oa-id';

export default function BookingSuccessScreen({ route, navigation }: RootStackScreenProps<'BookingSuccess'>) {
  const insets = useSafeAreaInsets();
  const record = useBookingStore((s) => s.history.find((h) => h.id === route.params.bookingId));

  const oaId = ENV.zaloOAId || (__DEV__ ? DEMO_OA_ID : '');
  const zaloUrl = oaId ? buildZaloOAUrl(oaId) : '';
  const mapsUrl = record?.display.mapsUrl ?? '';

  const open = (url: string) => url && Linking.openURL(url).catch(() => {});
  // Zalo OA sends the confirmed schedule + Maps link; fall back to Maps if no OA is configured.
  const openZalo = () => open(zaloUrl || mapsUrl);
  const close = () => navigation.navigate('MainTabs', { screen: 'Home' });

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="items-center gap-4 px-5"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }}
    >
      <SuccessBurst size={84} />

      <Animated.View entering={nativeOnly(FadeInDown.delay(250))} className="items-center gap-1">
        <Text className="text-center text-2xl font-extrabold text-ink" accessibilityRole="header">
          Đăng ký thành công! 🎉
        </Text>
        {record && (
          <Text className="text-[13px] text-ink-muted">
            Mã đăng ký: <Text className="font-extrabold text-brand-600">{record.code}</Text>
          </Text>
        )}
      </Animated.View>

      {/* How the parent will be confirmed — only claim a Zalo message when the server is sending one. */}
      {record && (
        <Animated.View
          entering={nativeOnly(FadeInDown.delay(320))}
          className={`w-full flex-row gap-2.5 rounded-2xl p-3.5 ${record.confirmation === 'ZNS' ? 'bg-blue-50' : 'bg-surface'}`}
          accessibilityLiveRegion="polite"
        >
          {record.confirmation === 'ZNS' ? <MessageCircleMore size={20} color={ZALO_BLUE} /> : <Phone size={20} color={COLORS.brand} />}
          <Text className="flex-1 text-[13px] leading-5 text-ink">
            {record.confirmation === 'ZNS' ? (
              <>
                Tin nhắn <Text className="font-bold">xác nhận lịch hẹn qua Zalo</Text> đang được gửi tới số{' '}
                <Text className="font-bold">{formatPhone(record.phone)}</Text>. Nếu sau 15 phút chưa nhận được, trung tâm sẽ gọi điện xác nhận.
              </>
            ) : (
              <>
                Trung tâm sẽ <Text className="font-bold">gọi điện xác nhận lịch hẹn</Text> tới số{' '}
                <Text className="font-bold">{formatPhone(record.phone)}</Text> trong giờ làm việc.
              </>
            )}
          </Text>
        </Animated.View>
      )}

      {record && (
        <Animated.View entering={nativeOnly(FadeInDown.delay(380))} className="w-full gap-1 rounded-3xl bg-surface p-4">
          <Row k="Học viên" v={`${record.studentName} (${record.childAge} tuổi)`} />
          <Row k="Khóa học" v={record.display.course} />
          <Row k="Cơ sở" v={record.display.campus} />
          <Row k="Lịch học thử" v={`${record.display.slot}\n${record.display.date}`} />
          <Row k="SĐT liên hệ" v={formatPhone(record.phone)} />
          <View className="mt-2 flex-row items-center gap-2 rounded-2xl bg-accent-100 p-3">
            <Gift size={18} color={COLORS.accent} />
            <Text className="flex-1 text-[13px] font-semibold text-accent-600">
              Quà tặng: {record.display.gift} (trị giá 200k) – nhận tại buổi trải nghiệm
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Zalo OA QR */}
      {!!zaloUrl && (
        <Animated.View entering={nativeOnly(FadeInDown.delay(500))} className="w-full flex-row items-center gap-4 rounded-3xl border border-slate-200 p-4">
          <View className="rounded-2xl bg-white p-2 shadow-sm shadow-black/10">
            <QRCode value={zaloUrl} size={112} color="#0F172A" backgroundColor="#FFFFFF" />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-[15px] font-bold text-ink">Quan tâm Zalo OA TH EDU</Text>
            <Text className="text-[12px] leading-[18px] text-ink-muted">
              Quét mã hoặc bấm nút bên dưới để nhận xác nhận lịch, nhắc lịch học và chỉ đường đến trung tâm.
            </Text>
            {ENV.zaloOAId === '' && __DEV__ && (
              <Text className="text-[10px] font-semibold text-amber-600">DEV: chưa đặt PUBLIC_ZALO_OA_ID</Text>
            )}
          </View>
        </Animated.View>
      )}

      <Animated.View entering={nativeOnly(FadeInDown.delay(620))} className="w-full gap-2.5">
        <Pressable
          onPress={openZalo}
          accessibilityRole="link"
          className="min-h-[56px] flex-row items-center justify-center gap-2.5 rounded-2xl px-4 py-3 active:opacity-90"
          style={{ backgroundColor: ZALO_BLUE }}
        >
          <View className="rounded-lg bg-white px-1.5 py-0.5">
            <Text className="text-[11px] font-black" style={{ color: ZALO_BLUE }}>
              Zalo
            </Text>
          </View>
          <Text className="flex-shrink text-center text-[14px] font-bold leading-5 text-white">
            Mở Zalo nhận lịch hẹn & chỉ đường Google Maps đến trung tâm
          </Text>
        </Pressable>

        <View className="flex-row gap-2.5">
          <Button
            className="flex-1"
            title="Google Maps"
            variant="outline"
            icon={<MapPinned size={18} color="#1E54E0" />}
            onPress={() => open(mapsUrl)}
            disabled={!mapsUrl}
          />
          {hasHotline && (
            <Button
              className="flex-1"
              title="Gọi hotline"
              variant="outline"
              icon={<Phone size={18} color="#1E54E0" />}
              onPress={() => open(`tel:${CONTACT.hotline}`)}
            />
          )}
        </View>
        <Button title="Xem / đổi lịch hẹn của tôi" variant="outline" onPress={() => navigation.navigate('ManageBookings')} />
        <Button title="Về trang chủ" variant="ghost" onPress={close} />
      </Animated.View>
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <Text className="text-[13px] text-ink-muted">{k}</Text>
      <Text className="flex-1 text-right text-[13px] font-semibold text-ink">{v}</Text>
    </View>
  );
}
