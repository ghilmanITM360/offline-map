/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommonActions } from '@react-navigation/native';

/**
 * Done after arrival: the Directory becomes the only route (#307), exactly like a launch. Pushing it over Home
 * left [Main, Directory], so Back from the Directory reopened the finished journey's Map. A route name the
 * drawer does not own makes React Navigation hand the reset to the root stack, so this works from inside Home.
 */
export const resetToDirectoryAction = () =>
  CommonActions.reset({ index: 0, routes: [{ name: 'LocationsDirectory' }] });
