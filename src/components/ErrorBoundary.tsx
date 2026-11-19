/**
 * Last line of defence for render errors: instead of a white screen, parents and teachers get a calm
 * Vietnamese message, a reload button and a way to reach the centre. The error is reported (scrubbed)
 * and a short reference code is shown so the centre can find it.
 *
 * "Thử tải lại" first remounts the app tree (keeps sign-in and saved data). If it crashes again within
 * a few seconds, the web version reloads the page as a harder reset.
 */
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ENV, hasHotline } from '@/config/env';
import { reportError } from '@/services/observability';

interface Props {
  children: ReactNode;
  /** Called after "Thử tải lại" (e.g. reset navigation). */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  ref: string | null;
  lastResetAt: number;
}

const RECRASH_MS = 5000;

/**
 * Development only: lets the release checklist verify the fallback screen and the error report.
 * Web console: `dispatchEvent(new Event('thedu:crash'))`. Renders nothing; compiled out of release builds.
 */
export function DevCrashProbe() {
  const [crash, setCrash] = useState(false);
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const on = () => setCrash(true);
    window.addEventListener('thedu:crash', on);
    return () => window.removeEventListener('thedu:crash', on);
  }, []);
  if (crash) throw new Error('Thử nghiệm ErrorBoundary (chỉ bản development) — phone 0912345678');
  return null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, ref: null, lastResetAt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // componentStack names components only (no props / data) — safe to attach as a short tag.
    const top = (info.componentStack ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' < ');
    const ref = reportError(error, { area: 'render', level: 'fatal', tags: { component: top } });
    this.setState({ ref });
  }

  private reload = () => {
    const recrash = Date.now() - this.state.lastResetAt < RECRASH_MS;
    if (recrash && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.setState({ error: null, ref: null, lastResetAt: Date.now() });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const zalo = ENV.zaloOAId ? `https://zalo.me/${ENV.zaloOAId}` : null;
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F3F8F5' }} testID="error-boundary">
        <View style={{ alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24 }}>
          <Text style={{ fontSize: 48 }} accessibilityElementsHidden importantForAccessibility="no">
            🛠️
          </Text>
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center' }}>
            Đã có sự cố xảy ra
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: '#64748B', textAlign: 'center' }}>
            Ứng dụng gặp lỗi ngoài ý muốn. Thông tin đăng nhập và dữ liệu của ba mẹ vẫn an toàn. Ba mẹ / thầy cô bấm tải lại để tiếp tục nhé.
          </Text>
          <Pressable
            onPress={this.reload}
            accessibilityRole="button"
            testID="error-reload"
            style={({ pressed }) => ({ alignSelf: 'stretch', minHeight: 52, borderRadius: 16, backgroundColor: pressed ? '#0F66A3' : '#1278BE', alignItems: 'center', justifyContent: 'center', marginTop: 4 })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Thử tải lại ứng dụng</Text>
          </Pressable>
          {(hasHotline || zalo) && (
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 10 }}>
              {hasHotline && (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${ENV.hotline}`).catch(() => {})}
                  accessibilityRole="button"
                  testID="error-call"
                  style={{ flex: 1, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: '#1278BE', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#0F66A3', fontSize: 15, fontWeight: '700' }}>Gọi trung tâm</Text>
                </Pressable>
              )}
              {zalo && (
                <Pressable
                  onPress={() => Linking.openURL(zalo).catch(() => {})}
                  accessibilityRole="link"
                  testID="error-zalo"
                  style={{ flex: 1, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: '#1278BE', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#0F66A3', fontSize: 15, fontWeight: '700' }}>Nhắn Zalo TH EDU</Text>
                </Pressable>
              )}
            </View>
          )}
          {!!this.state.ref && (
            <Text selectable style={{ fontSize: 12, color: '#94A3B8' }} testID="error-ref">
              Mã lỗi: {this.state.ref} · phiên bản {ENV.appVersion}
            </Text>
          )}
          {__DEV__ && (
            <Text selectable style={{ fontSize: 12, color: '#B91C1C', alignSelf: 'stretch' }}>
              {this.state.error.message}
            </Text>
          )}
        </View>
      </ScrollView>
    );
  }
}
