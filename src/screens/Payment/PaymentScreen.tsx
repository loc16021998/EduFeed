import { CheckCircle2, Copy, CreditCard, Landmark, Phone, Printer, QrCode, ShieldCheck, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Confetti, ScreenHeader, Skeleton } from '@/components';
import { ENV, hasHotline, hasSupabase } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { ApiError } from '@/services/apiClient';
import {
  demoMarkPaid,
  fetchInvoice,
  startVnpayCheckout,
  watchInvoice,
  type PaymentInvoiceDTO,
  type PaymentInvoiceResponse,
  type PaymentMethod,
} from '@/services/paymentService';
import { COLORS } from '@/utils/constants';
import { formatPhone } from '@/utils/helpers';
import { useAppWidth } from '@/utils/platform';

import { formatVnd, vnDateTime } from '../../../supabase/functions/_shared/payments';

type OnlineMethod = 'VIETQR' | 'VNPAY';
const isWeb = Platform.OS === 'web';
const METHOD_LABEL: Record<PaymentMethod, string> = { VIETQR: 'Chuyển khoản VietQR', VNPAY: 'Cổng VNPay', MANUAL: 'Nộp tại trung tâm' };
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Đã có lỗi xảy ra, vui lòng thử lại.');

/** VNPay sends the parent back to /thanh-toan/:id?vnp_ResponseCode=…; the code is only a hint — the server decides. */
function vnpayReturnCode(): string | null {
  if (!isWeb || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('vnp_ResponseCode');
}

/** Parents: pay a tuition invoice (VietQR / VNPay) and get the digital receipt. Link: /thanh-toan/<invoice id>. */
export default function PaymentScreen({ route, navigation }: RootStackScreenProps<'Payment'>) {
  const id = route.params.id;
  const insets = useSafeAreaInsets();
  const width = useAppWidth();
  const [data, setData] = useState<PaymentInvoiceResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<OnlineMethod | null>(null);
  const [step, setStep] = useState<'choose' | OnlineMethod>('choose');
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [returnCode] = useState(vnpayReturnCode);
  const wasPending = useRef(false);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const res = await fetchInvoice(id);
      if (!res) return setState('notfound');
      setData(res);
      setMethod((m) => m ?? (res.options.vietqr ? 'VIETQR' : res.options.vnpay ? 'VNPAY' : null));
      setState('ready');
    } catch (e) {
      setError(msg(e));
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const invoice = data?.invoice;
  const pending = invoice?.status === 'PENDING_PAYMENT';
  if (pending) wasPending.current = true;

  // Poll while the parent is paying (or has just come back from VNPay).
  const watching = pending && (step !== 'choose' || !!returnCode);
  useEffect(() => {
    if (!watching) return;
    setTimedOut(false);
    return watchInvoice(
      id,
      (inv) => {
        setData((d) => (d ? { ...d, invoice: inv } : d));
        if (inv.status === 'PAID') setShot((s) => s + 1);
      },
      { onTimeout: () => setTimedOut(true) },
    );
  }, [watching, id]);

  const goHome = () => navigation.navigate('MainTabs', { screen: 'Home' });

  const confirm = async () => {
    if (!method || !invoice) return;
    setError(null);
    if (method === 'VIETQR') return setStep('VIETQR');
    setBusy(true);
    try {
      if (!hasSupabase) {
        setStep('VNPAY'); // demo: no gateway — the "simulate" button stands in for it
        return;
      }
      const url = await startVnpayCheckout(invoice.id);
      setStep('VNPAY');
      if (isWeb) window.location.assign(url);
      else await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'SERVICE_UNAVAILABLE' ? 'Thanh toán VNPay đang tạm ngưng. Ba mẹ vui lòng chọn chuyển khoản VietQR.' : msg(e));
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (m: OnlineMethod) => {
    await demoMarkPaid(id, m);
    // In demo mode the poller picks this up like a real webhook would.
  };

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader title={invoice?.status === 'PAID' ? 'Biên lai học phí' : 'Thanh toán học phí'} onBack={() => (navigation.canGoBack() ? navigation.goBack() : goHome())} />
      <ScrollView contentContainerClassName="gap-3 px-4 pt-1" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} testID="payment-screen">
        {!hasSupabase && (
          <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
            Dữ liệu mẫu: chưa kết nối máy chủ và ngân hàng thật — không chuyển tiền vào tài khoản mẫu.
          </Text>
        )}

        {state === 'loading' && (
          <View className="gap-3">
            <Skeleton height={190} radius={24} />
            <Skeleton height={140} radius={24} />
          </View>
        )}
        {state === 'notfound' && (
          <Notice icon={<XCircle size={28} color="#DC2626" />} title="Không tìm thấy hóa đơn" body="Liên kết có thể đã sai hoặc hóa đơn đã bị xóa. Ba mẹ vui lòng liên hệ trung tâm để nhận liên kết mới." />
        )}
        {state === 'error' && (
          <View className="gap-3">
            <Text className="rounded-xl bg-red-50 p-3 text-[13px] leading-5 text-red-700">{error}</Text>
            <Button title="Thử lại" variant="outline" onPress={load} />
          </View>
        )}

        {state === 'ready' && invoice && (
          <>
            {invoice.status === 'PAID' && <Receipt invoice={invoice} justPaid={wasPending.current} onHome={goHome} />}

            {invoice.status === 'CANCELLED' && (
              <Notice icon={<XCircle size={28} color="#B45309" />} title="Hóa đơn đã hủy" body="Hóa đơn này không còn hiệu lực. Nếu ba mẹ đã chuyển khoản, trung tâm sẽ liên hệ để xử lý — hoặc gọi trung tâm để được hỗ trợ." />
            )}

            {pending && (
              <>
                <InvoiceSummary invoice={invoice} />

                {step === 'choose' && (
                  <View className="gap-2.5 rounded-3xl bg-white p-4">
                    <Text className="text-[15px] font-bold text-ink" accessibilityRole="header">
                      Chọn hình thức thanh toán
                    </Text>
                    {!!returnCode && returnCode !== '00' && (
                      <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
                        Giao dịch VNPay chưa hoàn tất{returnCode === '24' ? ' (ba mẹ đã hủy)' : ''}. Ba mẹ có thể thử lại hoặc chọn chuyển khoản.
                      </Text>
                    )}
                    {!!returnCode && returnCode === '00' && (
                      <Waiting text="VNPay báo giao dịch thành công — đang chờ xác nhận từ máy chủ…" />
                    )}
                    <MethodOption
                      selected={method === 'VIETQR'}
                      disabled={!data!.options.vietqr}
                      onPress={() => setMethod('VIETQR')}
                      icon={<QrCode size={22} color={COLORS.brand} />}
                      title="Chuyển khoản nhanh qua QR (VietQR tự động)"
                      subtitle={
                        data!.options.vietqr
                          ? data!.options.vietqr.autoConfirm
                            ? 'Quét mã bằng ứng dụng ngân hàng bất kỳ · xác nhận tự động trong vài giây'
                            : 'Quét mã bằng ứng dụng ngân hàng bất kỳ · trung tâm xác nhận khi nhận được tiền'
                          : 'Trung tâm chưa cấu hình tài khoản nhận tiền'
                      }
                      testID="method-vietqr"
                    />
                    <MethodOption
                      selected={method === 'VNPAY'}
                      disabled={!data!.options.vnpay}
                      onPress={() => setMethod('VNPAY')}
                      icon={<CreditCard size={22} color={COLORS.brand} />}
                      title="Cổng thanh toán VNPay / Thẻ ngân hàng nội địa"
                      subtitle={data!.options.vnpay ? 'Thẻ ATM nội địa, ví VNPay, Internet Banking' : 'Trung tâm chưa kích hoạt cổng VNPay'}
                      testID="method-vnpay"
                    />
                    {!!error && <Text className="rounded-xl bg-red-50 p-2.5 text-xs leading-[18px] text-red-700">{error}</Text>}
                    <Button
                      title="Xác nhận thanh toán học phí"
                      variant="accent"
                      size="lg"
                      loading={busy}
                      disabled={!method}
                      onPress={confirm}
                      icon={<ShieldCheck size={18} color="#fff" />}
                    />
                    {!data!.options.vietqr && !data!.options.vnpay && (
                      <Text className="text-center text-xs leading-[18px] text-ink-muted">Ba mẹ vui lòng nộp học phí trực tiếp tại trung tâm hoặc liên hệ để được hướng dẫn.</Text>
                    )}
                  </View>
                )}

                {step === 'VIETQR' && data!.options.vietqr && (
                  <VietQrPanel
                    option={data!.options.vietqr}
                    timedOut={timedOut}
                    onBack={() => setStep('choose')}
                    onSimulate={!hasSupabase ? () => simulate('VIETQR') : undefined}
                  />
                )}

                {step === 'VNPAY' && (
                  <View className="gap-3 rounded-3xl bg-white p-4" testID="vnpay-pending">
                    <Waiting text={hasSupabase ? 'Đang chờ kết quả từ VNPay… Sau khi thanh toán xong, ba mẹ quay lại trang này.' : 'Dữ liệu mẫu: không mở cổng VNPay thật.'} />
                    {timedOut && <Text className="text-xs leading-[18px] text-ink-muted">Chưa nhận được kết quả. Nếu tài khoản đã bị trừ tiền, trung tâm sẽ xác nhận và gửi biên lai qua Zalo.</Text>}
                    {!hasSupabase && <Button title="Mô phỏng VNPay thành công (dữ liệu mẫu)" variant="outline" onPress={() => simulate('VNPAY')} />}
                    <Button title="Chọn hình thức khác" variant="ghost" onPress={() => setStep('choose')} />
                  </View>
                )}

                <View className="flex-row items-start gap-2 px-1">
                  <ShieldCheck size={14} color={COLORS.subtle} />
                  <Text className="flex-1 text-[11px] leading-4 text-ink-subtle">
                    Học phí chỉ được ghi nhận khi ngân hàng / VNPay xác nhận với máy chủ TH EDU. Trung tâm không bao giờ yêu cầu ba mẹ cung cấp mã OTP hay mật khẩu.
                  </Text>
                </View>
              </>
            )}

            {hasHotline && invoice.status !== 'PAID' && (
              <Pressable onPress={() => Linking.openURL(`tel:${ENV.hotline}`).catch(() => {})} accessibilityRole="link" className="min-h-11 flex-row items-center justify-center gap-1.5 py-2">
                <Phone size={14} color={COLORS.brand} />
                <Text className="text-[13px] font-semibold text-brand-700">Cần hỗ trợ? Gọi {formatPhone(ENV.hotline)}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
      <Confetti shot={shot} width={width} height={640} />
    </View>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function Row({ label, value, strong, valueClass = '' }: { label: string; value: string; strong?: boolean; valueClass?: string }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text className="text-[13px] text-ink-muted">{label}</Text>
      <Text className={`flex-1 text-right text-[13px] ${strong ? 'font-bold text-ink' : 'text-ink'} ${valueClass}`}>{value}</Text>
    </View>
  );
}

function InvoiceSummary({ invoice }: { invoice: PaymentInvoiceDTO }) {
  return (
    <View className="gap-2.5 rounded-3xl bg-white p-4" testID="invoice-summary">
      <Text className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Hóa đơn học phí · {invoice.ref}</Text>
      <Row label="Học viên" value={invoice.studentName} strong />
      <Row label="Khóa học" value={invoice.courseName} />
      <Row label="Cơ sở" value={invoice.branchName} />
      {!!invoice.note && <Row label="Ghi chú" value={invoice.note} />}
      <View className="my-1 h-px bg-slate-100" />
      <Row label="Học phí" value={formatVnd(invoice.baseAmountVnd)} />
      {invoice.discountVnd > 0 && <Row label={invoice.discountLabel ?? 'Ưu đãi'} value={`−${formatVnd(invoice.discountVnd)}`} valueClass="text-emerald-700 font-semibold" />}
      <View className="flex-row items-end justify-between pt-1">
        <Text className="text-[14px] font-semibold text-ink">Tổng thanh toán</Text>
        <Text className="text-[24px] font-black text-accent-600" testID="invoice-total">
          {formatVnd(invoice.amountVnd)}
        </Text>
      </View>
    </View>
  );
}

function MethodOption({ selected, disabled, onPress, icon, title, subtitle, testID }: { selected: boolean; disabled: boolean; onPress: () => void; icon: ReactNode; title: string; subtitle: string; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      // Web: react-native-web drops accessibilityState.checked for radios; set the ARIA attributes directly.
      aria-checked={selected}
      aria-disabled={disabled}
      testID={testID}
      className={`flex-row items-center gap-3 rounded-2xl border p-3.5 ${selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'} ${disabled ? 'opacity-50' : 'active:bg-slate-50'}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-white">{icon}</View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[14px] font-bold leading-5 text-ink">{title}</Text>
        <Text className="text-xs leading-[17px] text-ink-muted">{subtitle}</Text>
      </View>
      <View className={`h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-brand-500' : 'border-slate-300'}`}>
        {selected && <View className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
      </View>
    </Pressable>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-2.5 rounded-2xl bg-brand-50 p-3" accessibilityLiveRegion="polite">
      <ActivityIndicator color={COLORS.brand} />
      <Text className="flex-1 text-[13px] leading-5 text-brand-700">{text}</Text>
    </View>
  );
}

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  const canCopy = isWeb && typeof navigator !== 'undefined' && !!navigator.clipboard;
  return (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <Text className="text-[13px] text-ink-muted">{label}</Text>
      <View className="flex-1 flex-row items-center justify-end gap-2">
        <Text selectable className="text-right text-[14px] font-bold text-ink">
          {display ?? value}
        </Text>
        {canCopy && (
          <Pressable
            onPress={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {})}
            accessibilityRole="button"
            accessibilityLabel={`Sao chép ${label.toLowerCase()}`}
            hitSlop={6}
            className="h-8 flex-row items-center gap-1 rounded-full bg-slate-100 px-2.5 active:bg-slate-200"
          >
            <Copy size={13} color={COLORS.ink} />
            <Text className="text-[11px] font-bold text-ink">{copied ? 'Đã chép' : 'Chép'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function VietQrPanel({ option, timedOut, onBack, onSimulate }: { option: NonNullable<PaymentInvoiceResponse['options']['vietqr']>; timedOut: boolean; onBack: () => void; onSimulate?: () => void }) {
  return (
    <View className="gap-3 rounded-3xl bg-white p-4" testID="vietqr-panel">
      <Text className="text-[15px] font-bold text-ink" accessibilityRole="header">
        Quét mã để chuyển khoản
      </Text>
      <View className="items-center gap-2">
        <View className="rounded-2xl border border-slate-200 bg-white p-3" accessibilityLabel="Mã VietQR chuyển khoản học phí" testID="vietqr-code">
          <QRCode value={option.qrPayload} size={208} color="#0F172A" backgroundColor="#FFFFFF" ecl="M" />
        </View>
        <Text className="text-center text-xs leading-[17px] text-ink-muted">Mở ứng dụng ngân hàng → Quét QR. Số tiền và nội dung đã được điền sẵn.</Text>
      </View>
      <View className="rounded-2xl bg-slate-50 px-3 py-2">
        <View className="flex-row items-center gap-1.5 py-1">
          <Landmark size={14} color={COLORS.subtle} />
          <Text className="text-[13px] font-semibold text-ink">{option.bankName}</Text>
        </View>
        <CopyRow label="Số tài khoản" value={option.accountNo} />
        <CopyRow label="Chủ tài khoản" value={option.accountName} />
        <CopyRow label="Số tiền" value={String(option.amountVnd)} display={formatVnd(option.amountVnd)} />
        <CopyRow label="Nội dung" value={option.content} />
      </View>
      <Text className="rounded-xl bg-amber-50 p-2.5 text-xs leading-[18px] text-amber-800">
        Nếu chuyển khoản thủ công, ba mẹ giữ <Text className="font-bold">đúng nội dung {option.content}</Text> và đúng số tiền để hệ thống nhận ra học phí của bé.
      </Text>
      <Waiting text={option.autoConfirm ? 'Đang chờ ngân hàng xác nhận… Trang sẽ tự chuyển sang biên lai khi nhận được tiền.' : 'Trung tâm sẽ xác nhận khi nhận được tiền (trong giờ làm việc) — biên lai hiện tại đây và gửi qua Zalo.'} />
      {timedOut && <Text className="text-xs leading-[18px] text-ink-muted">Chưa thấy tiền về. Nếu ba mẹ đã chuyển, trung tâm sẽ kiểm tra và gửi biên lai qua Zalo — không cần chuyển lại.</Text>}
      {onSimulate && <Button title="Mô phỏng ngân hàng báo có (dữ liệu mẫu)" variant="outline" onPress={onSimulate} />}
      <Button title="Chọn hình thức khác" variant="ghost" onPress={onBack} />
    </View>
  );
}

function Receipt({ invoice, justPaid, onHome }: { invoice: PaymentInvoiceDTO; justPaid: boolean; onHome: () => void }) {
  return (
    <View className="gap-3" testID="payment-receipt">
      <View className="items-center gap-1.5 rounded-3xl bg-emerald-50 p-5">
        <CheckCircle2 size={44} color="#059669" />
        <Text className="text-lg font-extrabold text-emerald-800" accessibilityRole="header">
          {justPaid ? 'Thanh toán thành công!' : 'Đã thanh toán'}
        </Text>
        <Text className="text-center text-[13px] leading-5 text-emerald-800">TH EDU đã nhận học phí của bé {invoice.studentName}. Cảm ơn ba mẹ!</Text>
      </View>
      <View className="gap-2.5 rounded-3xl bg-white p-4">
        <Text className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Biên lai điện tử</Text>
        <Row label="Số biên lai" value={invoice.receiptNo ?? '—'} strong />
        <Row label="Học viên" value={invoice.studentName} />
        <Row label="Khóa học" value={invoice.courseName} />
        <Row label="Cơ sở" value={invoice.branchName} />
        {invoice.discountVnd > 0 && <Row label={invoice.discountLabel ?? 'Ưu đãi'} value={`−${formatVnd(invoice.discountVnd)}`} />}
        <Row label="Số tiền đã nhận" value={formatVnd(invoice.paidAmountVnd ?? invoice.amountVnd)} strong />
        <Row label="Hình thức" value={invoice.method ? METHOD_LABEL[invoice.method] : '—'} />
        <Row label="Thời gian" value={invoice.paidAt ? vnDateTime(invoice.paidAt) : '—'} />
        <Row label="Mã thanh toán" value={invoice.ref} />
      </View>
      <View className="flex-row gap-2.5">
        {isWeb && <Button className="flex-1" title="In / Lưu PDF" variant="outline" icon={<Printer size={16} color={COLORS.brand} />} onPress={() => window.print()} />}
        <Button className="flex-1" title="Về EduFeed" onPress={onHome} />
      </View>
    </View>
  );
}

function Notice({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <View className="items-center gap-2 rounded-3xl bg-white p-6">
      {icon}
      <Text className="text-center text-[16px] font-bold text-ink">{title}</Text>
      <Text className="text-center text-[13px] leading-5 text-ink-muted">{body}</Text>
    </View>
  );
}
