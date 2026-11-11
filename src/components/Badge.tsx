import { Text, View } from 'react-native';

interface BadgeProps {
  label: string;
  /** Any hex colour — used for text, with a translucent tint as background. */
  color?: string;
  className?: string;
}

export default function Badge({ label, color = '#2F6BFF', className = '' }: BadgeProps) {
  return (
    <View
      className={`self-start rounded-full px-2.5 py-1 ${className}`}
      style={{ backgroundColor: `${color}1A` /* ~10% alpha */ }}
    >
      <Text className="text-xs font-semibold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
