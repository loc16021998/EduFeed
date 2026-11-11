import Gradient from '@/components/media/Gradient';
import { Text, View } from 'react-native';

import type { CourseCategory } from '@/types';
import { GIFT_BY_COURSE } from '@/utils/constants';

/** Lead-conversion incentive — highlights the gift matching the selected course. */
export default function GiftBanner({ course }: { course: CourseCategory }) {
  return (
    <Gradient
      colors={['#FB923C', '#F97316', '#EA580C']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 20, padding: 16, gap: 10 }}
    >
      <Text className="text-[15px] font-extrabold leading-[22px] text-white">
        🎁 Đăng ký ngay hôm nay: Miễn phí 1 buổi trải nghiệm + Tặng bộ Vở Luyện Chữ / Bộ Thẻ Tư Duy trị giá 200k
      </Text>
      <View className="flex-row items-center gap-2 self-start rounded-full bg-white/20 px-3 py-1.5">
        <Text className="text-xs font-semibold text-white">Quà của bé:</Text>
        <Text className="text-xs font-extrabold text-white">{GIFT_BY_COURSE[course]}</Text>
      </View>
    </Gradient>
  );
}
