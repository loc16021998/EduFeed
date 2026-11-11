import { BadgeCheck, ShieldCheck } from 'lucide-react-native';
import { Text, View } from 'react-native';

const ZALO_BLUE = '#0068FF';

/** Reassurance shown right under the phone field — where privacy worries peak. */
export default function ZaloTrustNote() {
  return (
    <View className="flex-row gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 p-3" accessible>
      <ShieldCheck size={18} color={ZALO_BLUE} />
      <View className="flex-1 gap-1">
        <Text className="text-[12px] leading-[18px] text-ink">
          Cam kết bảo mật thông tin tuyệt đối. Xác nhận lịch hẹn tức thì qua Zalo OA chính thức của TH EDU.
        </Text>
        <View className="flex-row items-center gap-1">
          <BadgeCheck size={13} color={ZALO_BLUE} fill="#DBEAFE" />
          <Text className="text-[11px] font-bold" style={{ color: ZALO_BLUE }}>
            Zalo OA đã xác thực · TH EDU
          </Text>
        </View>
      </View>
    </View>
  );
}
