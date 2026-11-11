import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/utils/constants';

const MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/** "toán tư duy" / "#toan tu duy" → "#ToanTuDuy" (same style as existing feed hashtags). */
export function toHashtag(raw: string): string | null {
  const words = raw
    .replace(/^#+/, '')
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return null;
  const tag = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return `#${tag.slice(0, 30)}`;
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  max?: number;
}

export default function TagInput({ value, onChange, suggestions = [], max = 6 }: TagInputProps) {
  const [text, setText] = useState('');
  const full = value.length >= max;

  const add = (raw: string) => {
    const tag = toHashtag(raw);
    setText('');
    if (!tag || full || value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const remaining = suggestions.filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()));

  return (
    <View className="gap-2">
      <Text className="text-[13px] font-semibold text-ink-muted">
        Hashtag ({value.length}/{max})
      </Text>
      {value.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {value.map((t) => (
            <Pressable
              key={t}
              onPress={() => onChange(value.filter((x) => x !== t))}
              accessibilityRole="button"
              accessibilityLabel={`Xóa ${t}`}
              className="flex-row items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-2"
            >
              <Text className="text-xs font-semibold text-brand-700">{t}</Text>
              <X size={12} color={COLORS.brand} />
            </Pressable>
          ))}
        </View>
      )}
      {!full && (
        <TextInput
          value={text}
          onChangeText={(v) => (/[,\n]$/.test(v) ? add(v.slice(0, -1)) : setText(v))}
          onSubmitEditing={() => add(text)}
          onBlur={() => text.trim() && add(text)}
          placeholder="Gõ hashtag rồi nhấn Enter, VD: tính nhẩm"
          placeholderTextColor={COLORS.subtle}
          returnKeyType="done"
          blurOnSubmit={false}
          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] text-ink"
        />
      )}
      {!full && remaining.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {remaining.map((s) => (
            <Pressable
              key={s}
              onPress={() => add(s)}
              accessibilityRole="button"
              accessibilityLabel={`Thêm ${s}`}
              className="flex-row items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1"
            >
              <Plus size={11} color={COLORS.muted} />
              <Text className="text-xs text-ink-muted">{s}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
