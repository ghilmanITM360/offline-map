/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Coordinate } from '../models/types';

export type NavigationStartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place';

interface NavigationLocationCapabilityInput {
  startSource: NavigationStartSource;
  coordinate: Coordinate | null;
  nowMs?: number;
}

interface NavigationLocationCapability {
  canStart: boolean;
  message: string;
}

const MAX_LIVE_NAVIGATION_ACCURACY_M = 50;
const MAX_LIVE_FIX_AGE_MS = 30_000;

export function evaluateNavigationLocationCapability(
  input: NavigationLocationCapabilityInput,
): NavigationLocationCapability {
  if (input.startSource === 'manual_place') {
    return {
      canStart: false,
      message: 'Choose a current precise location before starting live navigation. Route preview remains available.',
    };
  }

  if (input.startSource === 'remembered_location' || input.startSource === 'device_last_known') {
    return {
      canStart: false,
      message: 'Last known location cannot drive live navigation. Route preview remains available.',
    };
  }

  if (!input.coordinate) {
    return {
      canStart: false,
      message: 'Searching for a current location. Route preview remains available.',
    };
  }

  if ((input.coordinate.accuracy ?? Number.POSITIVE_INFINITY) > MAX_LIVE_NAVIGATION_ACCURACY_M) {
    return {
      canStart: false,
      message: 'Precise location is required for live navigation. Route preview remains available.',
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  if (input.coordinate.observedAtMs == null || nowMs - input.coordinate.observedAtMs > MAX_LIVE_FIX_AGE_MS) {
    return {
      canStart: false,
      message: 'Current location is stale. Wait for a fresh fix before starting live navigation.',
    };
  }

  return { canStart: true, message: '' };
}
