import './global.css';
import '@/lib/nativewindInterop';

import { StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from '@/navigation/AppNavigator';
import { isWeb, MAX_APP_WIDTH } from '@/utils/platform';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {isWeb ? (
          // Web: centre the app in a phone-width column so layouts match the mobile design.
          <View style={{ flex: 1, backgroundColor: '#E2E8F0', alignItems: 'center' }}>
            <View
              style={{
                flex: 1,
                width: '100%',
                maxWidth: MAX_APP_WIDTH,
                backgroundColor: '#F8FAFC',
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
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
