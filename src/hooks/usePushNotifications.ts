import { useEffect, useRef } from 'react';

import type { PushRole } from '@/config/notificationTemplates';
import { navigationRef } from '@/navigation/AppNavigator';
import { parsePushData, push, registerDevice, routeForPush, unregisterDevice } from '@/services/pushNotificationService';
import { useParentStore, useStaffStore } from '@/store';
import { useRoleOnboardingStore } from '@/store/onboardingStore';

/** Coarse role of whoever is signed in, for routing taps (onboarding role + parent / staff state). */
function currentPushRole(): PushRole | null {
  const staff = useStaffStore.getState();
  if (staff.status === 'signedIn' && staff.isStaff) {
    if (staff.isAdmin) return 'MANAGER';
    const r = useRoleOnboardingStore.getState().currentRole;
    return r === 'ADVISOR' ? 'ADVISOR' : 'TEACHER';
  }
  return useParentStore.getState().status === 'signedIn' ? 'PARENT' : null;
}

/**
 * Keeps this device registered for whoever is signed in, and opens the right screen when a notification
 * is tapped. Mount once (PushNotificationsHost). Everything is a no-op while push is unavailable.
 */
export function usePushNotifications() {
  const staffIn = useStaffStore((s) => s.status === 'signedIn' && s.isStaff);
  const parentIn = useParentStore((s) => s.status === 'signedIn');
  const signedIn = staffIn || parentIn;
  const was = useRef(signedIn);

  // Register on sign-in; drop the token on sign-out (shared phones at the centre).
  useEffect(() => {
    if (!push.available) return;
    if (signedIn) registerDevice();
    else if (was.current) unregisterDevice();
    was.current = signedIn;
  }, [signedIn, staffIn, parentIn]);

  // Tap → screen. Waits for the navigator when the app was cold-started by the tap.
  useEffect(() => {
    if (!push.available) return undefined;
    return push.onOpen((raw) => {
      const target = routeForPush(parsePushData(raw), currentPushRole());
      const go = () => {
        if (!navigationRef.isReady()) return setTimeout(go, 150);
        if (target.name === 'Home') navigationRef.navigate('MainTabs', { screen: 'Home' });
        else navigationRef.navigate(target.name);
      };
      go();
    });
  }, []);
}

export default function PushNotificationsHost() {
  usePushNotifications();
  return null;
}
