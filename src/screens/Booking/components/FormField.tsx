import { forwardRef, useState, type ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';

import { COLORS } from '@/utils/constants';

interface FormFieldProps extends ComponentProps<typeof TextInput> {
  label: string;
  error?: string;
}

const FormField = forwardRef<TextInput, FormFieldProps>(({ label, error, onFocus, onBlur, ...input }, ref) => {
  const [focused, setFocused] = useState(false);
  return (
  <View className="gap-1.5">
    <Text className="text-[13px] font-semibold text-ink-muted">{label}</Text>
    <TextInput
      ref={ref}
      accessibilityLabel={label}
      accessibilityHint={error}
      placeholderTextColor={COLORS.subtle}
      className={`h-[52px] rounded-2xl border bg-white px-4 text-[15px] text-ink ${
        error ? 'border-red-400 bg-red-50/40' : focused ? 'border-brand-500' : 'border-slate-200'
      }`}
      style={[{ outlineStyle: 'none' } as object, focused && !error ? { shadowColor: COLORS.brand, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...input}
    />
    {!!error && <Text className="text-xs text-red-500">{error}</Text>}
  </View>
  );
});

FormField.displayName = 'FormField';
export default FormField;
