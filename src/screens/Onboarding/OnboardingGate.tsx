/**
 * Decides who is signed in and, on their first sign-in on this device, presents their role's walkthrough.
 * Mount once at the app root.
 *
 *  - Parent: after the OTP sign-in, as soon as the portal knows the parent id.
 *  - Staff: after the e-mail sign-in, once the server says which role this account has
 *    (staff_kind: TEACHER → giáo viên, ADVISOR → tư vấn). Owners / managers get no automatic guide
 *    (they can preview every role from Settings).
 * Never blocks: if the role lookup fails, nothing is shown. A blocking store update wins over the guide.
 */
import { useEffect } from 'react';

import type { OnboardingRole } from '@/config/onboardingSlides';
import { fetchMyKind } from '@/services/staffOps';
import { useParentStore, useStaffStore } from '@/store';
import { useRoleOnboardingStore } from '@/store/onboardingStore';
import { useUpdateStore } from '@/store/useUpdateStore';

import RoleOnboardingModal from './RoleOnboardingModal';

export default function OnboardingGate() {
  const staffSignedIn = useStaffStore((s) => s.status === 'signedIn' && s.isStaff);
  const staffUserId = useStaffStore((s) => s.userId);
  const parentSignedIn = useParentStore((s) => s.status === 'signedIn');
  const parentId = useParentStore((s) => s.portal?.parent.id ?? null);
  const forceUpdate = useUpdateStore((s) => s.gate.kind === 'force');

  useEffect(() => {
    const store = useRoleOnboardingStore.getState();
    let cancelled = false;

    if (staffSignedIn && staffUserId) {
      fetchMyKind()
        .then((kind) => {
          if (cancelled) return;
          const role: OnboardingRole | null = kind === 'TEACHER' ? 'TEACHER' : kind === 'ADVISOR' ? 'ADVISOR' : null;
          store.setCurrentRole(role);
          if (role) store.checkShouldShowOnboarding(staffUserId, role);
        })
        .catch(() => {});
    } else if (parentSignedIn) {
      store.setCurrentRole('PARENT');
      if (parentId) store.checkShouldShowOnboarding(parentId, 'PARENT');
    } else {
      store.setCurrentRole(null);
      // Signed out while the first-login guide was open → close it (a replay from Settings stays).
      if (store.active && !store.active.preview) store.dismiss();
    }
    return () => {
      cancelled = true;
    };
  }, [staffSignedIn, staffUserId, parentSignedIn, parentId]);

  return forceUpdate ? null : <RoleOnboardingModal />;
}
