/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnboardingStatusService } from '../services/OnboardingStatusService';

export function useWelcomeViewModel() {
  const continueFromWelcome = async (navigation: any) => {
    await OnboardingStatusService.setHasSeenWelcome(true);
    // Location is optional and asked in context later (#307), so Welcome hands straight to the Directory.
    navigation.replace('LocationsDirectory');
  };

  return { continueFromWelcome };
}
