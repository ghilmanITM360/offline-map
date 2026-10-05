/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from 'react-native';

/**
 * #130 TTFD readiness. The returning-user harness is "fully usable" when the startup destination
 * is LocationsDirectory and that screen has finished transitioning in. Splash only routes there
 * after it has awaited persisted-store hydration and resolved setup (StartupManager), so reaching
 * the Directory already proves both. First-install setup screens (Welcome/Permission)
 * block startup and are a different measurement: if one of them is the first destination, the
 * signal never fires, even if the Directory is reached later in that same journey.
 */
export function createStartupReadiness(report: () => void) {
  let startupDestination: string | null = null;
  let reported = false;
  return {
    focus(routeName: string): void {
      if (routeName === 'Splash' || startupDestination !== null) return;
      startupDestination = routeName;
    },
    transitionEnd(routeName: string, closing = false): void {
      if (reported || closing) return;
      if (routeName !== 'LocationsDirectory' || startupDestination !== 'LocationsDirectory') return;
      reported = true;
      report();
    },
  };
}

/** Asks Android to call Activity.reportFullyDrawn(). A no-op where the native module is absent (tests, iOS). */
export function markFullyUsable(): void {
  NativeModules.StartupReadiness?.markFullyUsable?.();
}

export const startupReadiness = createStartupReadiness(markFullyUsable);
