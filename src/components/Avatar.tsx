import { Image, Text, View } from 'react-native';

interface AvatarProps {
  uri?: string;
  name: string;
  size?: number;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export default function Avatar({ uri, name, size = 36 }: AvatarProps) {
  const dims = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={dims} className="bg-brand-100" accessibilityLabel={name} />;
  }
  return (
    <View style={dims} className="items-center justify-center bg-brand-100">
      <Text className="font-bold text-brand-700" style={{ fontSize: size * 0.4 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
