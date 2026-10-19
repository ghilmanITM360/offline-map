/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Host facade for the location-capability policy (#307). The pure policy lives in the shared domain layer
// (future @muslim-ummah/offline-navigation); this module keeps the old import path, supplies the wall clock
// when a caller omits `nowMs`, and owns the localized blocker copy. Route guide is always available.

import { t } from '../i18n/translate';
import {
  evaluateLocationCapability as evaluateDomainCapability,
  type LiveBlocker,
  type LocationCapability,
  type LocationPermissionInput,
} from '../../packages/offline-navigation/src/domain/journey/LocationCapability';
import type { Coordinate } from '../models/types';

export {
  MAX_LIVE_NAVIGATION_ACCURACY_M,
  MAX_LIVE_FIX_AGE_MS,
  classifyLiveFix,
  accuracyFacet,
} from '../../packages/offline-navigation/src/domain/journey/LocationCapability';
export type {
  PermissionFacet,
  AccuracyFacet,
  ServicesFacet,
  FixFacet,
  NavigationMode,
  LiveBlocker,
  LocationPermissionInput,
  LocationCapability,
} from '../../packages/offline-navigation/src/domain/journey/LocationCapability';

export function evaluateLocationCapability(input: {
  permission: LocationPermissionInput;
  liveFix: Coordinate | null;
  acquiring?: boolean;
  nowMs?: number;
}): LocationCapability {
  return evaluateDomainCapability({ ...input, nowMs: input.nowMs ?? Date.now() });
}

/** One plain sentence per blocker. The route guide stays available in every case, so none of these end the journey. */
export function liveBlockerMessage(blocker: LiveBlocker): string {
  switch (blocker) {
    case 'permission_needed':
      return t('capability.permissionNeeded');
    case 'permission_blocked':
      return t('capability.permissionBlocked');
    case 'precision_unknown':
      return t('directions.precisionUnknown');
    case 'approximate_only':
      return t('capability.approximateOnly');
    case 'services_off':
      return t('capability.servicesOff');
    case 'acquiring':
      return t('capability.acquiring');
    case 'no_fix':
      return t('capability.noFix');
    case 'stale_fix':
      return t('capability.staleFix');
    case 'weak_fix':
      return t('capability.weakFix');
  }
}
