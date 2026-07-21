/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnboardingStatusService } from '../services/OnboardingStatusService';

export function useWelcomeViewModel() {
  const continueFromWelcome = async (navigation: any) => {
    await OnboardingStatusService.setHasSeenWelcome(true);
    navigation.replace('Permission');
  };

  return { continueFromWelcome };
}
