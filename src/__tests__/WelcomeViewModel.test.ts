/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from './test-utils';
import { useWelcomeViewModel } from '../viewmodels/WelcomeViewModel';
import { OnboardingStatusService } from '../services/OnboardingStatusService';

jest.mock('../services/OnboardingStatusService', () => ({
  OnboardingStatusService: { setHasSeenWelcome: jest.fn().mockResolvedValue(undefined) },
}));

describe('useWelcomeViewModel (#159 WEL-007)', () => {
  test('continueFromWelcome records hasSeenWelcome and replaces onto the Directory (no permission step, #307)', async () => {
    const navigation = { replace: jest.fn() };
    const { result } = await renderHook(() => useWelcomeViewModel());

    await result.current.continueFromWelcome(navigation);

    expect(OnboardingStatusService.setHasSeenWelcome).toHaveBeenCalledWith(true);
    expect(navigation.replace).toHaveBeenCalledWith('LocationsDirectory');
  });
});
