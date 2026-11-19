import './global.css';
import '@/lib/nativewindInterop';

import { useEffect } from 'react';
import { StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from '@/navigation/AppNavigator';
import { useUiStore } from '@/store';
import { startNetworkMonitor } from '@/store/networkStore';
import { isWeb, MAX_APP_WIDTH, MAX_WIDE_WIDTH } from '@/utils/platform';

export default function App() {
  const wide = useUiStore((s) => s.wideLayout);
  // Wi-Fi vs mobile data → Data Saver policy (autoplay, preloading, upload size).
  useEffect(() => startNetworkMonitor(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {isWeb ? (
          // Web: centre the app in a phone-width column so layouts match the mobile design
          // (the admin dashboard opts into the full width — see useUiStore).
          <View style={{ flex: 1, backgroundColor: 'transparent', alignItems: 'center' }}>
            <View
              style={{
                flex: 1,
                width: '100%',
                maxWidth: wide ? MAX_WIDE_WIDTH : MAX_APP_WIDTH,
                backgroundColor: '#F3F8F5',
                overflow: 'hidden',
                shadowColor: '#0F172A',
                shadowOpacity: 0.12,
                shadowRadius: 24,
              }}
            >
              <AppNavigator />
            </View>
          </View>
        ) : (
          <AppNavigator />
        )}
        <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
