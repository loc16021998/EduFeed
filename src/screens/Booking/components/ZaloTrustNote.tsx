import { PhoneCall, ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { ENV } from '@/config/env';

const ZALO_BLUE = '#0068FF';

/**
 * Reassurance under the phone field — where privacy worries peak. States only what is true:
 * the Zalo confirmation is mentioned only when the centre's Zalo OA is configured.
 */
export default function ZaloTrustNote() {
  const zalo = !!ENV.zaloOAId;
  return (
    <View className="flex-row gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 p-3" accessible>
      <ShieldCheck size={18} color={ZALO_BLUE} />
      <View className="flex-1 gap-1">
        <Text className="text-[12px] leading-[18px] text-ink">
          Số điện thoại chỉ dùng để xác nhận lịch học thử và tư vấn, không chia sẻ cho bên thứ ba.
        </Text>
        <View className="flex-row items-center gap-1">
          <PhoneCall size={12} color={ZALO_BLUE} />
          <Text className="text-[11px] font-semibold" style={{ color: ZALO_BLUE }}>
            {zalo ? 'Xác nhận lịch qua Zalo OA của TH EDU' : 'Trung tâm gọi điện xác nhận lịch trong giờ làm việc'}
          </Text>
        </View>
      </View>
    </View>
  );
}
