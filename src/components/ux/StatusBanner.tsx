import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

export type BannerTone = 'success' | 'error' | 'info' | 'warning';

const TONE: Record<BannerTone, { box: string; text: string; icon: string; Icon: typeof Info }> = {
  success: { box: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-900', icon: '#047857', Icon: CheckCircle2 },
  error: { box: 'border-red-200 bg-red-50', text: 'text-red-800', icon: '#B91C1C', Icon: CircleAlert },
  info: { box: 'border-brand-100 bg-brand-50', text: 'text-brand-700', icon: '#0C5285', Icon: Info },
  warning: { box: 'border-amber-200 bg-amber-50', text: 'text-amber-900', icon: '#B45309', Icon: TriangleAlert },
};

export interface StatusBannerProps {
  tone: BannerTone;
  text: string;
  /** e.g. "Thử lại" on an error. */
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
  testID?: string;
}

/** One consistent success / error / info banner: icon + plain words + optional action. Announced to screen readers. */
export default function StatusBanner({ tone, text, action, onDismiss, testID }: StatusBannerProps) {
  const t = TONE[tone];
  return (
    <View
      className={`flex-row items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 ${t.box}`}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      testID={testID ?? `banner-${tone}`}
    >
      <t.Icon size={20} color={t.icon} />
      <Text className={`flex-1 text-[14px] leading-5 ${t.text}`}>{text}</Text>
      {!!action && (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8} className="min-h-11 justify-center rounded-xl px-2.5 active:opacity-70">
          <Text className={`text-[14px] font-extrabold underline ${t.text}`}>{action.label}</Text>
        </Pressable>
      )}
      {!!onDismiss && (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Đóng thông báo" hitSlop={8} className="h-11 w-9 items-center justify-center active:opacity-60">
          <X size={18} color={t.icon} />
        </Pressable>
      )}
    </View>
  );
}
