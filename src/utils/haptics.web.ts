// Web: the Vibration API (Android Chrome / Samsung Internet). iOS Safari has none — calls are silently ignored.
// Same interface as haptics.ts. Never throws: haptics are a nicety.
const vibrate = (pattern: number | number[]) => () => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* blocked (no user gesture yet, iframe policy…) */
  }
};

export const haptics = { light: vibrate(8), medium: vibrate(15), success: vibrate([10, 40, 18]) };
