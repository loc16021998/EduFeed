import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
}

const VARIANT: Record<Variant, { box: string; text: string; spinner: string }> = {
  primary: { box: 'bg-brand-500 active:bg-brand-600', text: 'text-white', spinner: '#fff' },
  accent: { box: 'bg-accent-500 active:bg-accent-600', text: 'text-white', spinner: '#fff' },
  outline: { box: 'border border-brand-500 bg-white active:bg-brand-50', text: 'text-brand-600', spinner: '#2F6BFF' },
  ghost: { box: 'bg-transparent active:bg-brand-50', text: 'text-brand-600', spinner: '#2F6BFF' },
};

const SIZE: Record<Size, { box: string; text: string }> = {
  sm: { box: 'h-9 px-3 rounded-xl', text: 'text-sm' },
  md: { box: 'h-12 px-5 rounded-2xl', text: 'text-base' },
  lg: { box: 'h-14 px-6 rounded-2xl', text: 'text-lg' },
};

export default function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  className = '',
  ...rest
}: ButtonProps) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      className={`flex-row items-center justify-center gap-2 ${s.box} ${v.box} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      {...rest}
    >
      {loading ? <ActivityIndicator color={v.spinner} /> : icon}
      <Text className={`font-semibold ${s.text} ${v.text}`}>{title}</Text>
    </Pressable>
  );
}
