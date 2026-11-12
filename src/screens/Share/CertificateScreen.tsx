import { Award, Share2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';

import logo from '@/assets/branding/logo-th-edu-transparent.png';
import { Button, HeaderIconButton, ScreenHeader } from '@/components';
import { ENV } from '@/config/env';
import type { RootStackScreenProps } from '@/navigation/types';
import { fetchCertificate, type Certificate } from '@/services/enrollments';
import { courseTitle } from '@/services/recommendationService';
import { COLORS } from '@/utils/constants';
import { shareText } from '@/utils/platform';

const LOGO: ImageSourcePropType = typeof logo === 'string' ? { uri: logo } : logo;
const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** Public digital certificate (/chung-nhan/:code) — what the T+0 message links to. */
export default function CertificateScreen({ navigation, route }: RootStackScreenProps<'Certificate'>) {
  const code = route.params.code;
  const [cert, setCert] = useState<Certificate | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchCertificate(code).then(
      (c) => {
        if (!alive) return;
        setCert(c);
        setState(c ? 'ready' : 'missing');
      },
      () => alive && setState('error'),
    );
    return () => {
      alive = false;
    };
  }, [code]);

  const title = cert ? courseTitle(cert.course as never, cert.level) : '';
  const url = ENV.webUrl ? `${ENV.webUrl}/chung-nhan/${code}` : '';
  const onShare = () =>
    cert && shareText(`🎓 ${cert.studentName} đã hoàn thành khóa ${title} tại TH EDU!${url ? `\nChứng nhận: ${url}` : `\nMã chứng nhận: ${cert.code}`}`);

  return (
    <View className="flex-1 bg-surface">
      <ScreenHeader
        title="Chứng nhận hoàn thành"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs', { screen: 'Home' }))}
        right={
          cert ? (
            <HeaderIconButton label="Chia sẻ" onPress={onShare}>
              <Share2 size={22} color={COLORS.ink} />
            </HeaderIconButton>
          ) : undefined
        }
      />
      <ScrollView contentContainerClassName="p-5 pb-10">
        {state === 'loading' && <ActivityIndicator className="mt-16" color={COLORS.brand} />}
        {(state === 'missing' || state === 'error') && (
          <Text className="mt-16 px-6 text-center text-ink-muted">
            {state === 'missing' ? `Không tìm thấy chứng nhận ${code}. Ba mẹ kiểm tra lại đường link nhé.` : 'Không tải được chứng nhận. Kiểm tra mạng rồi thử lại.'}
          </Text>
        )}
        {state === 'ready' && cert && (
          <View className="gap-5">
            <View className="items-center gap-3 rounded-[28px] border-4 border-[#8BC34A] bg-white px-5 py-7" testID="certificate">
              <Image source={LOGO} style={{ width: 120, height: 91 }} resizeMode="contain" accessibilityLabel="Logo TH EDU" />
              <View className="flex-row items-center gap-1.5">
                <Award size={18} color="#1478BE" />
                <Text className="text-xs font-black uppercase tracking-[2px] text-[#1478BE]">Chứng nhận hoàn thành</Text>
              </View>
              <Text className="text-center text-[13px] text-ink-muted">Trung tâm TH EDU chứng nhận học viên</Text>
              <Text className="text-center text-[26px] font-black leading-8 text-ink">{cert.studentName}</Text>
              <Text className="text-center text-[13px] text-ink-muted">đã hoàn thành khóa học</Text>
              <Text className="text-center text-xl font-extrabold text-[#5E8F22]">{title}</Text>
              <View className="mt-1 h-px w-2/3 bg-slate-200" />
              <Text className="text-center text-xs text-ink-muted">
                {dmy(cert.startDate)} – {dmy(cert.endDate)} · {cert.branchName}
              </Text>
              <Text className="text-[11px] font-semibold tracking-wider text-ink-subtle">Mã chứng nhận: {cert.code}</Text>
            </View>
            <Button title="Chia sẻ chứng nhận" icon={<Share2 size={18} color="#fff" />} onPress={onShare} />
            <Button title="Khám phá khóa học tiếp theo" variant="outline" onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
