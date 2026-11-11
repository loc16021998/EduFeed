import { Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import VideoPlayer from '@/components/media/VideoPlayer';

interface FeedVideoProps {
  uri: string;
  posterUri: string;
  /** Only the most-visible card mounts a <Video>; the rest show their poster. */
  active: boolean;
  muted: boolean;
}

/** Tap-to-pause autoplaying video that falls back to a poster image when inactive. */
export default function FeedVideo({ uri, posterUri, active, muted }: FeedVideoProps) {
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);

  // Each time a card becomes active again it should autoplay from a clean state.
  useEffect(() => {
    if (!active) {
      setPaused(false);
      setBuffering(true);
    }
  }, [active]);

  return (
    <Pressable
      onPress={() => active && setPaused((p) => !p)}
      style={StyleSheet.absoluteFill}
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Phát video' : 'Tạm dừng video'}
    >
      {active ? (
        <VideoPlayer
          uri={uri}
          poster={posterUri}
          paused={paused}
          muted={muted}
          loop
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onBuffering={setBuffering}
        />
      ) : (
        <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} />
      )}

      {(paused || !active) && (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-black/40">
            <Play size={30} color="#fff" fill="#fff" />
          </View>
        </View>
      )}
      {active && !paused && buffering && (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </Pressable>
  );
}
