import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CalendarCheck, Images, PlaySquare, Sparkles, type LucideIcon } from 'lucide-react-native';

import BookingScreen from '@/screens/Booking/BookingScreen';
import HomeScreen from '@/screens/Home/HomeScreen';
import PortfolioScreen from '@/screens/Portfolio/PortfolioScreen';
import QuizScreen from '@/screens/Quiz/QuizScreen';
import { useTrustStore } from '@/store/useTrustStore';
import { COLORS } from '@/utils/constants';

import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, LucideIcon> = {
  Home: PlaySquare,
  Portfolio: Images,
  Quiz: Sparkles,
  Booking: CalendarCheck,
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      // Exit-intent: leaving a half-filled Booking form via another tab shows the one-time
      // incentive instead. "Để sau" in the modal continues to the tab that was pressed.
      screenListeners={({ navigation, route }) => ({
        tabPress: (e) => {
          const state = navigation.getState();
          const current = state.routes[state.index]?.name;
          const trust = useTrustStore.getState();
          if (current === 'Booking' && route.name !== 'Booking' && trust.shouldOfferOnLeave()) {
            e.preventDefault();
            trust.showExitOffer(route.name as keyof TabParamList);
          }
        },
      })}
      screenOptions={({ route }) => {
        const Icon = ICONS[route.name];
        return {
          tabBarActiveTintColor: COLORS.brand,
          tabBarInactiveTintColor: COLORS.subtle,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIcon: ({ color, size }) => <Icon color={color} size={size} />,
          headerTitleStyle: { fontWeight: '700', color: COLORS.ink },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: COLORS.surface },
        };
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'EduFeed', headerShown: false /* custom HomeHeader */ }} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} options={{ title: 'Thành quả', headerShown: false /* custom ScreenHeader */ }} />
      <Tab.Screen name="Quiz" component={QuizScreen} options={{ title: 'Kiểm tra nhanh' }} />
      <Tab.Screen name="Booking" component={BookingScreen} options={{ title: 'Đăng ký' }} />
    </Tab.Navigator>
  );
}
