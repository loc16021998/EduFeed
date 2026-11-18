import { Search, X } from 'lucide-react-native';
import { forwardRef, useState, type ComponentProps } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { COLORS } from '@/utils/constants';

interface SearchFieldProps extends Omit<ComponentProps<typeof TextInput>, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (t: string) => void;
  /** Extra classes for the outer box (margins). */
  boxClassName?: string;
}

/**
 * Search box like a normal website: one rounded box, magnifier, clear button; the box (not the inner
 * text field) turns brand blue with a soft ring while typing — no browser focus outline.
 */
const SearchField = forwardRef<TextInput, SearchFieldProps>(({ value, onChangeText, boxClassName = '', onFocus, onBlur, ...input }, ref) => {
  const [focused, setFocused] = useState(false);
  return (
    <View
      className={`h-11 flex-row items-center gap-2 rounded-2xl border bg-white px-3 ${focused ? 'border-brand-500' : 'border-slate-200'} ${boxClassName}`}
      style={focused ? { shadowColor: COLORS.brand, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : undefined}
    >
      <Search size={18} color={focused ? COLORS.brand : COLORS.subtle} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={COLORS.subtle}
        returnKeyType="search"
        className="h-full flex-1 text-[15px] text-ink"
        style={{ outlineStyle: 'none' } as object}
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
      {!!value && (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" hitSlop={8} className="-mr-1 h-8 w-8 items-center justify-center rounded-full active:bg-slate-100">
          <X size={16} color={COLORS.subtle} />
        </Pressable>
      )}
    </View>
  );
});

SearchField.displayName = 'SearchField';
export default SearchField;
