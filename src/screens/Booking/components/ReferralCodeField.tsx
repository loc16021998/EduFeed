import { CheckCircle2, CircleAlert, Users } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { checkReferralCode, isReferralCodeShape, normalizeReferralCode } from '@/services/referrals';
import { COLORS } from '@/utils/constants';

/** 150000 → "150k", 1500000 → "1,5 triệu". */
export const shortVnd = (n: number) => (n >= 1_000_000 ? `${String(Math.round(n / 100_000) / 10).replace('.', ',')} triệu` : `${Math.round(n / 1000)}k`);

type State = { kind: 'idle' } | { kind: 'checking' } | { kind: 'valid'; discountVnd: number } | { kind: 'invalid'; message: string } | { kind: 'error' };

/**
 * "Mã giới thiệu (Nếu có)": checked live against the server (debounced). Reports the code upward only
 * when it is valid — an invalid code never blocks the booking.
 */
export default function ReferralCodeField({ initial, onValidCode }: { initial?: string; onValidCode: (code: string | undefined, discountVnd?: number) => void }) {
  const [text, setText] = useState(initial ? normalizeReferralCode(initial) : '');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const seq = useRef(0);

  useEffect(() => {
    if (initial) setText(normalizeReferralCode(initial));
  }, [initial]);

  useEffect(() => {
    const code = normalizeReferralCode(text);
    onValidCode(undefined);
    if (!code) return setState({ kind: 'idle' });
    if (!isReferralCodeShape(code)) {
      setState(code.length < 4 ? { kind: 'idle' } : { kind: 'invalid', message: 'Mã gồm 4–12 chữ cái hoặc số' });
      return;
    }
    const my = ++seq.current;
    setState({ kind: 'checking' });
    const t = setTimeout(async () => {
      try {
        const r = await checkReferralCode(code);
        if (my !== seq.current) return;
        if (r.valid) {
          setState({ kind: 'valid', discountVnd: r.discountVnd });
          onValidCode(r.code, r.discountVnd);
        } else {
          setState({ kind: 'invalid', message: r.reason === 'INACTIVE' ? 'Chương trình giới thiệu đang tạm dừng' : 'Không tìm thấy mã này — ba mẹ kiểm tra lại giúp nhé' });
        }
      } catch {
        if (my === seq.current) setState({ kind: 'error' });
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const border = state.kind === 'valid' ? 'border-emerald-400' : state.kind === 'invalid' ? 'border-amber-400' : 'border-slate-200';
  return (
    <View className="gap-1.5" testID="referral-field">
      <Text className="text-[13px] font-semibold text-ink-muted">Mã giới thiệu (Nếu có)</Text>
      <View className={`h-[52px] flex-row items-center gap-2 rounded-2xl border bg-white px-4 ${border}`}>
        <Users size={17} color={COLORS.subtle} />
        <TextInput
          value={text}
          onChangeText={(t) => setText(normalizeReferralCode(t))}
          placeholder="VD: TH4F9A2C"
          placeholderTextColor={COLORS.subtle}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          accessibilityLabel="Mã giới thiệu"
          className="flex-1 text-[15px] font-semibold tracking-wider text-ink"
        />
        {state.kind === 'checking' && <ActivityIndicator size="small" color={COLORS.brand} />}
        {state.kind === 'valid' && <CheckCircle2 size={20} color="#059669" />}
      </View>
      {state.kind === 'valid' && (
        <View className="flex-row items-center gap-1.5 self-start rounded-full bg-emerald-50 px-3 py-1.5" testID="referral-applied" accessibilityLiveRegion="polite">
          <CheckCircle2 size={14} color="#059669" />
          <Text className="text-xs font-bold text-emerald-700">
            {state.discountVnd > 0 ? `Đã áp dụng mã giảm ${shortVnd(state.discountVnd)} cho học viên mới!` : 'Đã áp dụng mã giới thiệu!'}
          </Text>
        </View>
      )}
      {state.kind === 'invalid' && (
        <View className="flex-row items-center gap-1.5" accessibilityLiveRegion="polite">
          <CircleAlert size={13} color="#B45309" />
          <Text className="text-xs text-amber-700">{state.message}</Text>
        </View>
      )}
      {state.kind === 'error' && <Text className="text-xs text-ink-subtle">Chưa kiểm tra được mã (mạng chậm). Ba mẹ vẫn đăng ký bình thường được.</Text>}
    </View>
  );
}
