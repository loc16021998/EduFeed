// Native (Android / iOS): no camera module in this build yet — type the code printed under the QR,
// or tick attendance in the class list. Web uses QrScanner.web.tsx (camera + jsQR).
import { ScanLine } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { COLORS } from '@/utils/constants';

import type { QrScannerProps } from './QrScanner.types';

export default function QrScanner({ onCode, paused = false }: QrScannerProps) {
  const [code, setCode] = useState('');
  const submit = () => {
    if (!code.trim() || paused) return;
    onCode(code.trim());
    setCode('');
  };
  return (
    <View className="gap-2 rounded-3xl bg-slate-900 p-4" testID="qr-scanner">
      <View className="flex-row items-center gap-2">
        <ScanLine size={18} color="#fff" />
        <Text className="flex-1 text-[13px] leading-5 text-white">Nhập mã in dưới QR trên thẻ / điện thoại của phụ huynh.</Text>
      </View>
      <View className="flex-row gap-2">
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="VD: 3F9A…"
          placeholderTextColor={COLORS.subtle}
          autoCapitalize="characters"
          onSubmitEditing={submit}
          accessibilityLabel="Mã điểm danh"
          className="h-11 flex-1 rounded-xl bg-white px-3 text-[15px] text-ink"
        />
        <Pressable onPress={submit} accessibilityRole="button" className="h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 active:bg-emerald-600">
          <Text className="text-[14px] font-bold text-white">Điểm danh</Text>
        </Pressable>
      </View>
    </View>
  );
}
