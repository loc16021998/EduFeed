// Native haptics — react-native-haptic-feedback. Web: haptics.web.ts (no-op).
import ReactNativeHapticFeedback, { HapticFeedbackTypes } from 'react-native-haptic-feedback';

const options = { enableVibrateFallback: false, ignoreAndroidSystemSettings: false };

const trigger = (type: HapticFeedbackTypes) => {
  try {
    ReactNativeHapticFeedback.trigger(type, options);
  } catch {
    /* haptics are a nicety — never crash for them */
  }
};

export const haptics = {
  light: () => trigger(HapticFeedbackTypes.impactLight),
  medium: () => trigger(HapticFeedbackTypes.impactMedium),
  success: () => trigger(HapticFeedbackTypes.notificationSuccess),
};
