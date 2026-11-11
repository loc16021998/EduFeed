import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { Linking } from 'react-native';

import type { CourseCategory } from '@/types';
import { COURSE_CATEGORIES } from '@/utils/constants';
import { parseDeepLink } from '@/utils/helpers';

/**
 * Routes a FeedItem.ctaLink. In-app `thedu://` links navigate directly (works in Expo Go,
 * where the custom scheme isn't registered); anything else opens externally.
 */
export function useCtaHandler() {
  const navigation = useNavigation();

  return useCallback(
    (link: string, videoId?: string) => {
      const { route, params } = parseDeepLink(link);
      switch (route) {
        case 'booking': {
          const course = COURSE_CATEGORIES.includes(params.course as CourseCategory)
            ? (params.course as CourseCategory)
            : undefined;
          navigation.navigate('MainTabs', { screen: 'Booking', params: { course, source: 'FEED', sourceRef: videoId } });
          return;
        }
        case 'quiz':
          navigation.navigate('QuizModal');
          return;
        case 'portfolio':
          navigation.navigate('MainTabs', { screen: 'Portfolio' });
          return;
        default:
          Linking.openURL(link).catch(() => {});
      }
    },
    [navigation],
  );
}
