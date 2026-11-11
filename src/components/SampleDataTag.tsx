import { Text, View } from 'react-native';

import type { TrustDataOrigin } from '@/types';

/** Visible marker on any trust content that is placeholder data (dev builds only). */
export default function SampleDataTag({ origin }: { origin: TrustDataOrigin }) {
  if (origin !== 'SAMPLE') return null;
  return (
    <View className="self-start rounded-md bg-amber-100 px-1.5 py-0.5">
      <Text className="text-[9px] font-extrabold uppercase tracking-wider text-amber-700">Dữ liệu mẫu</Text>
    </View>
  );
}
