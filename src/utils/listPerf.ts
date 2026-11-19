import { Platform } from 'react-native';

/**
 * Shared FlatList tuning for card lists (posts, bookings, students, videos).
 *
 * - initialNumToRender 8: fills a phone screen on the first frame without rendering the whole page.
 * - maxToRenderPerBatch 6 / updateCellsBatchingPeriod 50 ms: smaller batches keep the JS thread free
 *   for touches while scrolling fast (trade-off: a blank row can flash on a very fast fling).
 * - windowSize 9: ~4 screens above + below stay mounted → smooth back-scroll, bounded memory.
 * - removeClippedSubviews only on Android: a real memory win there; on iOS it can drop content inside
 *   modals / sticky headers, and on web it has no effect.
 */
export const LIST_PERF = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 6,
  updateCellsBatchingPeriod: 50,
  windowSize: 9,
  removeClippedSubviews: Platform.OS === 'android',
} as const;
