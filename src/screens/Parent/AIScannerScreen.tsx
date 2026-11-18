import { Calculator, Camera, CheckCircle2, ImageIcon, PenLine, RotateCcw, ShieldCheck, Sparkles, XCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader } from '@/components';
import { ApiError } from '@/services/apiClient';
import { checkNotebook, type NotebookCheckResult, type NotebookCriterion, type NotebookKind } from '@/services/engagement';
import { pickNotebookPhoto, type NotebookPhoto } from '@/services/media/mediaPicker';
import type { RootStackScreenProps } from '@/navigation/types';
import { useParentStore } from '@/store';
import { COLORS } from '@/utils/constants';
import { haptics } from '@/utils/haptics';
import { nativeOnly } from '@/utils/platform';

const KINDS: { kind: NotebookKind; title: string; hint: string; Icon: typeof PenLine }[] = [
  { kind: 'HANDWRITING', title: 'Vở luyện chữ', hint: 'Nét chữ, độ cao, khoảng cách, thẳng dòng', Icon: PenLine },
  { kind: 'MATH', title: 'Vở toán', hint: 'Kiểm tra từng phép tính, cách trình bày', Icon: Calculator },
];

const STEPS = ['Đang đọc trang vở…', 'Đang phân tích nét chữ và tư duy…', 'Đang soạn nhận xét cho bé…'];

/**
 * "Chấm vở AI" — parent photographs one page; Claude gives gentle, specific feedback.
 * Route /con-toi/cham-vo. Results are estimates (labelled); the photo is not stored.
 */
export default function AIScannerScreen({ navigation }: RootStackScreenProps<'NotebookCheck'>) {
  const insets = useSafeAreaInsets();
  const status = useParentStore((s) => s.status);
  const [kind, setKind] = useState<NotebookKind>('HANDWRITING');
  const [photo, setPhoto] = useState<NotebookPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NotebookCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'signedOut') navigation.replace('ParentAuth');
  }, [status, navigation]);

  const take = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const p = await pickNotebookPhoto(source);
      if (p) {
        setPhoto(p);
        setResult(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lấy được ảnh');
    }
  };

  const analyse = async () => {
    if (!photo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await checkNotebook(kind, photo);
      setResult(r);
      haptics.success();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'FUNCTION_UNAVAILABLE'
          ? 'Máy chủ chưa bật tính năng chấm vở AI.'
          : e instanceof Error
            ? e.message
            : 'Chưa chấm được, ba mẹ thử lại nhé.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPhoto(null);
    setResult(null);
    setError(null);
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title="Chấm vở cùng AI" onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ParentPortal'))} />
      <ScrollView contentContainerClassName="gap-3 px-4 pt-1" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" testID="ai-scanner">
        {!result && (
          <>
            <Text className="px-1 text-[13px] leading-5 text-ink-muted">Chụp một trang vở của bé, Trợ lý AI sẽ gợi ý điểm mạnh và cách luyện thêm ở nhà.</Text>

            <View className="flex-row gap-2.5">
              {KINDS.map(({ kind: k, title, hint, Icon }) => {
                const on = k === kind;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      haptics.light();
                      setKind(k);
                    }}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    className={`flex-1 gap-1.5 rounded-3xl border-2 p-3.5 ${on ? 'border-brand-500 bg-brand-50' : 'border-transparent bg-white'}`}
                    testID={`kind-${k}`}
                  >
                    <Icon size={22} color={on ? COLORS.brand : COLORS.muted} />
                    <Text className={`text-[15px] font-bold ${on ? 'text-brand-700' : 'text-ink'}`}>{title}</Text>
                    <Text className="text-xs leading-[17px] text-ink-muted">{hint}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="overflow-hidden rounded-3xl bg-white">
              {photo ? (
                <View>
                  <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 3 / 4 }} resizeMode="contain" className="bg-slate-100" accessibilityLabel="Ảnh trang vở" />
                  {busy && <ScanOverlay />}
                </View>
              ) : (
                <View className="items-center gap-2 px-6 py-8" style={{ aspectRatio: 4 / 3 }}>
                  <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                    <Camera size={30} color={COLORS.brand} />
                  </View>
                  <Text className="text-center text-[15px] font-bold text-ink">Chụp rõ cả trang vở</Text>
                  <Text className="text-center text-[13px] leading-5 text-ink-muted">Đặt vở trên mặt bàn phẳng, đủ sáng, chụp thẳng từ trên xuống.</Text>
                </View>
              )}
            </View>

            {busy ? (
              <Thinking />
            ) : photo ? (
              <View className="gap-2.5">
                <Button title="Chấm vở ngay" icon={<Sparkles size={18} color="#fff" />} variant="accent" size="lg" onPress={analyse} testID="ai-analyse" />
                <Button title="Chụp lại" variant="ghost" icon={<RotateCcw size={16} color={COLORS.brand} />} onPress={reset} />
              </View>
            ) : (
              <View className="flex-row gap-2.5">
                <Button className="flex-1" title="Chụp ảnh" icon={<Camera size={18} color="#fff" />} onPress={() => take('camera')} testID="ai-camera" />
                <Button className="flex-1" title="Chọn ảnh" variant="outline" icon={<ImageIcon size={18} color={COLORS.brand} />} onPress={() => take('library')} testID="ai-library" />
              </View>
            )}
          </>
        )}

        {!!error && (
          <View className="rounded-2xl bg-red-50 p-3" accessibilityLiveRegion="polite">
            <Text className="text-[13px] leading-5 text-red-700">{error}</Text>
          </View>
        )}

        {result && <ResultView r={result} onAgain={reset} />}

        <View className="flex-row items-start gap-2 px-1 pt-1">
          <ShieldCheck size={14} color={COLORS.subtle} style={{ marginTop: 2 }} />
          <Text className="flex-1 text-[11px] leading-4 text-ink-subtle">
            Ảnh chỉ dùng để chấm rồi bỏ đi, không lưu lại. Nhận xét do AI ước lượng, chỉ để tham khảo — không thay thế nhận xét của thầy cô. Tối đa 10 lượt mỗi ngày.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Processing animation ───────────────────────────────────────────────────

function ScanOverlay() {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(y);
  }, [y]);
  const line = useAnimatedStyle(() => ({ top: `${4 + y.value * 92}%` }));
  return (
    <View className="absolute inset-0 bg-brand-500/10" pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: COLORS.accent, shadowColor: COLORS.accent, shadowOpacity: 0.8, shadowRadius: 8 }, line]} />
    </View>
  );
}

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STEPS.length - 1)), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <View className="flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4" accessibilityLiveRegion="polite" testID="ai-thinking">
      <Sparkles size={18} color={COLORS.accent} />
      <Animated.Text key={i} entering={nativeOnly(FadeIn.duration(300))} className="text-[14px] font-semibold text-ink">
        {STEPS[i]}
      </Animated.Text>
    </View>
  );
}

// ─── Result ─────────────────────────────────────────────────────────────────

const LEVEL = ['', 'Cần luyện thêm', 'Đang tiến bộ', 'Ổn', 'Tốt', 'Rất tốt'];

function ResultView({ r, onAgain }: { r: NotebookCheckResult; onAgain: () => void }) {
  const res = r.result;
  if (!res.readable) {
    return (
      <Animated.View entering={nativeOnly(FadeInDown.duration(350))} className="gap-3 rounded-3xl bg-white p-4" testID="ai-result">
        <Text className="text-[16px] font-bold text-ink">Ảnh chưa đủ rõ để chấm</Text>
        <Text className="text-[14px] leading-6 text-ink-muted">{res.unreadableReason || 'Ba mẹ chụp lại rõ hơn giúp nhé.'}</Text>
        {res.tips.map((t, i) => (
          <Text key={i} className="text-[13px] leading-5 text-ink">• {t}</Text>
        ))}
        <Button title="Chụp lại" icon={<Camera size={18} color="#fff" />} onPress={onAgain} />
      </Animated.View>
    );
  }
  return (
    <View className="gap-3" testID="ai-result">
      {r.sample && <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">Kết quả mẫu (bản demo chưa kết nối AI) — không phải nhận xét về ảnh vừa chụp.</Text>}

      <Animated.View entering={nativeOnly(FadeInDown.duration(350))} className="gap-2 rounded-3xl bg-brand-500 p-4">
        <View className="flex-row items-center gap-2">
          <Sparkles size={16} color="#fff" />
          <Text className="text-xs font-bold uppercase tracking-wider text-white/85">Trợ lý AI TH EDU</Text>
        </View>
        {!!res.encouragement && <Text className="text-[17px] font-bold leading-6 text-white">{res.encouragement}</Text>}
        {!!res.summary && <Text className="text-[13px] leading-5 text-white/90">{res.summary}</Text>}
      </Animated.View>

      {res.criteria.length > 0 && (
        <Animated.View entering={nativeOnly(FadeInDown.delay(80).duration(350))} className="gap-3 rounded-3xl bg-white p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[15px] font-bold text-ink">Nhận xét chi tiết</Text>
            <Text className="text-[10px] font-bold uppercase text-ink-subtle">AI ước lượng</Text>
          </View>
          {res.criteria.map((c) => (
            <CriterionRow key={c.key} c={c} />
          ))}
        </Animated.View>
      )}

      {res.exercises.length > 0 && (
        <Animated.View entering={nativeOnly(FadeInDown.delay(140).duration(350))} className="gap-2 rounded-3xl bg-white p-4">
          <Text className="text-[15px] font-bold text-ink">
            Bài làm · đúng {res.exercises.filter((e) => e.isCorrect).length}/{res.exercises.length}
          </Text>
          {res.exercises.map((e, i) => (
            <View key={i} className="flex-row items-center gap-2.5 border-t border-slate-100 pt-2">
              {e.isCorrect ? <CheckCircle2 size={18} color="#059669" /> : <XCircle size={18} color="#DC2626" />}
              <Text className="flex-1 text-[14px] text-ink">
                {e.question} = <Text className={e.isCorrect ? 'font-bold text-emerald-700' : 'font-bold text-red-600 line-through'}>{e.childAnswer || '?'}</Text>
                {!e.isCorrect && <Text className="font-bold text-emerald-700"> → {e.correctAnswer}</Text>}
              </Text>
            </View>
          ))}
        </Animated.View>
      )}

      {(res.strengths.length > 0 || res.tips.length > 0) && (
        <Animated.View entering={nativeOnly(FadeInDown.delay(200).duration(350))} className="gap-2 rounded-3xl bg-white p-4">
          {res.strengths.length > 0 && (
            <>
              <Text className="text-[15px] font-bold text-ink">Điểm mạnh của bé</Text>
              {res.strengths.map((s, i) => (
                <Text key={i} className="text-[13px] leading-5 text-ink">🌟 {s}</Text>
              ))}
            </>
          )}
          {res.tips.length > 0 && (
            <>
              <Text className="mt-1 text-[15px] font-bold text-ink">Luyện ở nhà (5–10 phút)</Text>
              {res.tips.map((t, i) => (
                <Text key={i} className="text-[13px] leading-5 text-ink">✏️ {t}</Text>
              ))}
            </>
          )}
        </Animated.View>
      )}

      <Button title="Chấm trang khác" icon={<Camera size={18} color="#fff" />} onPress={onAgain} testID="ai-again" />
      {!r.sample && <Text className="text-center text-[11px] text-ink-subtle">Còn {r.remainingToday} lượt chấm hôm nay</Text>}
    </View>
  );
}

function CriterionRow({ c }: { c: NotebookCriterion }) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-[14px] font-semibold text-ink">{c.label}</Text>
        <Text className="text-xs font-bold text-brand-600">{LEVEL[c.score]}</Text>
      </View>
      <View className="flex-row gap-1" accessibilityLabel={`${c.label}: ${c.score} trên 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <View key={n} className={`h-1.5 flex-1 rounded-full ${n <= c.score ? 'bg-brand-500' : 'bg-slate-200'}`} />
        ))}
      </View>
      {!!c.comment && <Text className="text-[13px] leading-5 text-ink-muted">{c.comment}</Text>}
    </View>
  );
}
