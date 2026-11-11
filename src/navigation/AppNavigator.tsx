import { DefaultTheme, NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';

import { ENV } from '@/config/env';
import BookingSuccessScreen from '@/screens/Booking/BookingSuccessScreen';
import QuizModal from '@/screens/Quiz/QuizModal';
import VideoShareScreen from '@/screens/Share/VideoShareScreen';
import StaffLoginScreen from '@/screens/Staff/StaffLoginScreen';
import StaffTrialsScreen from '@/screens/Staff/StaffTrialsScreen';
import StaffVideosScreen from '@/screens/Staff/StaffVideosScreen';
import VideoEditorScreen from '@/screens/Staff/VideoEditorScreen';
import ChecklistScreen from '@/screens/Trust/ChecklistScreen';
import TestimonialsScreen from '@/screens/Trust/TestimonialsScreen';
import { useStaffStore } from '@/store';
import { COLORS } from '@/utils/constants';

import TabNavigator from './TabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: COLORS.brand, background: COLORS.surface },
};

/**
 * Deep links (thedu://…) and web URLs share the same paths. If the web app's address is set,
 * https links to it (e.g. shared video links) also open the native app when it is installed
 * (requires App Links / Universal Links setup on the domain).
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['thedu://', ...(ENV.webUrl ? [ENV.webUrl] : [])],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Home: 'feed',
          Portfolio: 'portfolio/:itemId?',
          Quiz: 'quiz',
          Booking: 'booking',
        },
      },
      QuizModal: 'quiz/start',
      Testimonials: 'phu-huynh',
      Checklist: 'checklist/:id',
      VideoShare: 'v/:slug',
      StaffLogin: 'quan-ly/dang-nhap',
      StaffVideos: 'quan-ly',
      StaffTrials: 'quan-ly/hoc-thu',
      VideoEditor: 'quan-ly/video/:id?',
    },
  },
};

export default function AppNavigator() {
  // Restore a signed-in staff session (parents never sign in, so this is a no-op for them).
  useEffect(() => useStaffStore.getState().init(), []);

  return (
    <NavigationContainer theme={theme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: COLORS.ink,
          headerStyle: { backgroundColor: COLORS.surface },
        }}
      >
        <Stack.Screen name="MainTabs" component={TabNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="Testimonials" component={TestimonialsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Checklist" component={ChecklistScreen} options={{ headerShown: false }} />
        <Stack.Screen name="VideoShare" component={VideoShareScreen} options={{ headerShown: false }} />
        <Stack.Screen name="StaffLogin" component={StaffLoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="StaffVideos" component={StaffVideosScreen} options={{ headerShown: false }} />
        <Stack.Screen name="StaffTrials" component={StaffTrialsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="VideoEditor" component={VideoEditorScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="QuizModal"
          component={QuizModal}
          options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="BookingSuccess"
          component={BookingSuccessScreen}
          options={{ presentation: 'modal', headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
