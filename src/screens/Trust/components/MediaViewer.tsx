import { X } from 'lucide-react-native';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VideoPlayer from '@/components/media/VideoPlayer';
import type { Testimonial } from '@/types';

/** Full-screen viewer for a testimonial video or a letter / notebook photo. */
export default function MediaViewer({ item, onClose }: { item: Testimonial | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!item} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black">
        {item?.kind === 'VIDEO' ? (
          <VideoPlayer uri={item.mediaUrl} poster={item.thumbnailUrl ?? undefined} resizeMode="contain" controls style={{ flex: 1 }} />
        ) : item ? (
          <Image source={{ uri: item.mediaUrl }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={item.quote} />
        ) : null}

        {item && (
          <View className="absolute bottom-0 left-0 right-0 gap-1 bg-black/60 px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
            <Text className="text-[15px] font-bold text-white">{item.parentLabel}</Text>
            {!!item.quote && <Text className="text-[13px] leading-5 text-white/85">“{item.quote}”</Text>}
          </View>
        )}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng"
          className="absolute right-4 h-10 w-10 items-center justify-center rounded-full bg-white/20"
          style={{ top: insets.top + 8 }}
        >
          <X size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}
