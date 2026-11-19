import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * true while the app is in the foreground (web: the tab is visible — react-native-web maps
 * AppState to the Page Visibility API). Players use it to pause when the phone is locked or the
 * parent switches apps, so no audio keeps playing and no video keeps downloading in the background.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const onChange = (s: AppStateStatus) => setActive(s === 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);
  return active;
}
