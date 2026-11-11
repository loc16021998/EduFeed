import { Alert, Platform, Share, useWindowDimensions } from 'react-native';

export const isWeb = Platform.OS === 'web';

/** On web the app is shown in a centred phone-width column (see App.tsx). */
export const MAX_APP_WIDTH = 480;

/** Width of the app's content area — the window on mobile, the phone column on web. */
export function useAppWidth(): number {
  const { width } = useWindowDimensions();
  return isWeb ? Math.min(width, MAX_APP_WIDTH) : width;
}

/** Yes/no confirmation. `Alert.alert` buttons are a no-op on react-native-web, so use the browser dialog there. */
export function confirmAsync(title: string, message: string, confirmText = 'Đồng ý', cancelText = 'Hủy'): Promise<boolean> {
  if (isWeb) return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Native share sheet; on desktop browsers without Web Share, copy to clipboard instead. */
export async function shareText(message: string): Promise<void> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as (Navigator & { share?: unknown }) | undefined;
  if (isWeb && nav && typeof nav.share !== 'function') {
    try {
      await nav.clipboard.writeText(message);
      window.alert('Đã sao chép nội dung để chia sẻ.');
    } catch {
      /* clipboard blocked — nothing else to do */
    }
    return;
  }
  await Share.share({ message }).catch(() => {});
}
