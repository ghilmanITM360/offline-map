/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import { t } from '../i18n/translate';
import type { Coordinate } from '../models/types';
import { classifyLiveFix, evaluateLocationCapability } from './LocationCapability';

export type NavigationStartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place' | 'hypothetical_place';

interface NavigationLocationCapabilityInput {
  startSource: NavigationStartSource;
  coordinate: Coordinate | null;
  /** Fine authorization must be explicit; omitted precision fails closed. */
  precision?: 'fine' | 'coarse' | 'none';
  nowMs?: number;
}

interface NavigationLocationCapability {
  canStart: boolean;
  message: string;
}

export function evaluateNavigationLocationCapability(
  input: NavigationLocationCapabilityInput,
): NavigationLocationCapability {
  if (input.startSource === 'manual_place' || input.startSource === 'hypothetical_place') {
    return {
      canStart: false,
      message: t('capability.manualLive'),
    };
  }

  if (input.startSource === 'remembered_location' || input.startSource === 'device_last_known') {
    return {
      canStart: false,
      message: t('capability.savedLive'),
    };
  }

  if (input.precision === 'coarse') {
    return {
      canStart: false,
      message: t('capability.exactLive'),
    };
  }

  if (input.precision !== 'fine') return { canStart: false, message: t('directions.precisionUnknown') };

  const fix = classifyLiveFix(input.coordinate, input.nowMs ?? Date.now());
  if (fix === 'none') {
    return {
      canStart: false,
      message: t('capability.acquiring'),
    };
  }

  if (fix === 'unusable') {
    return {
      canStart: false,
      message: t('capability.openArea'),
    };
  }

  if (fix === 'stale') {
    return {
      canStart: false,
      message: t('capability.acquiring'),
    };
  }

  return { canStart: true, message: '' };
}

export type StartActionKind = 'start' | 'use_location' | 'turn_on_location' | 'precise_location' | 'route_guide';

export interface StartAction {
  kind: StartActionKind;
  /** Always enabled: the user is never left on a dead primary button. */
  primaryLabel: string;
  /** Short plain-language headline shown above the primary action, when the state needs one. */
  title?: string;
  secondaryLabel?: string;
}

interface StartActionInput {
  startSource: NavigationStartSource;
  /** Only a genuinely live fix; remembered / last-known / manual positions must not be passed here. */
  liveFix: Coordinate | null;
  permission: { granted: boolean; precision: 'fine' | 'coarse' | 'none' };
  nowMs?: number;
}

/**
 * Turns the (unchanged) live-navigation safety gate into one actionable primary button.
 * A planned/manual start is a route preview; live guidance still needs a fresh precise fix.
 */
export function resolveStartAction(input: StartActionInput): StartAction {
  // A start the user chose or saved is a route guide: location never gates route planning (#307). Live guidance
  // stays one tap away and begins from a fresh fix, never from the planned place.
  if (input.startSource !== 'live_gps') {
    return { kind: 'route_guide', primaryLabel: t('capability.startRoute'), secondaryLabel: t('capability.guideLocation') };
  }
  const capability = evaluateLocationCapability({
    permission: { granted: input.permission.granted, canAskAgain: true, precision: input.permission.precision },
    liveFix: input.liveFix,
    nowMs: input.nowMs,
  });
  if (capability.permission === 'denied') {
    return { kind: 'turn_on_location', primaryLabel: t('capability.turnOnStart'), secondaryLabel: t('capability.viewRoute') };
  }
  if (capability.liveBlocker === 'approximate_only') {
    return { kind: 'precise_location', primaryLabel: t('capability.precise'), secondaryLabel: t('capability.viewRoute') };
  }
  if (capability.liveBlocker === 'precision_unknown') {
    return { kind: 'use_location', primaryLabel: t('directions.checkLocation'), secondaryLabel: t('capability.viewRoute') };
  }
  if (capability.fix !== 'usable') {
    return { kind: 'use_location', primaryLabel: t('capability.useStart'), secondaryLabel: t('capability.viewRoute') };
  }
  return { kind: 'start', primaryLabel: t('capability.startNavigation'), title: t('capability.ready') };
}
