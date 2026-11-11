import { Pressable, View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  onPress?: () => void;
  className?: string;
}

export default function Card({ onPress, className = '', children, ...rest }: CardProps) {
  const base = `bg-white rounded-3xl overflow-hidden shadow-sm shadow-black/10 ${className}`;

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${base} active:opacity-90`} {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <View className={base} {...rest}>
      {children}
    </View>
  );
}
