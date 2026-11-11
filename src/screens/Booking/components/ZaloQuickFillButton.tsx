import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { isZaloQuickAuthAvailable, requestZaloProfile, type ZaloProfile } from '@/services/zalo/quickAuth';

const ZALO_BLUE = '#0068FF';

/** "Điền nhanh bằng Zalo" — hidden entirely when Quick Auth isn't available. */
export default function ZaloQuickFillButton({ onProfile }: { onProfile: (p: ZaloProfile) => void }) {
  const [loading, setLoading] = useState(false);
  if (!isZaloQuickAuthAvailable) return null;

  const onPress = async () => {
    setLoading(true);
    try {
      const profile = await requestZaloProfile();
      if (profile) onProfile(profile);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Điền nhanh thông tin bằng Zalo"
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-80"
      style={{ backgroundColor: ZALO_BLUE }}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text className="text-[11px] font-black text-white">Zalo</Text>
      )}
      <Text className="text-xs font-semibold text-white">Điền nhanh</Text>
    </Pressable>
  );
}
