/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import type { Coordinate } from '../models/types';
import { classifyLiveFix, evaluateLocationCapability } from './LocationCapability';
import { t } from './serviceI18n';

export type NavigationStartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place';

interface NavigationLocationCapabilityInput {
  startSource: NavigationStartSource;
  coordinate: Coordinate | null;
  /**
   * Android permission precision ('fine'/'coarse'/'none'). Optional so existing callers that
   * don't yet track it keep working; omitted precision skips this gate (accuracy-based checks
   * below still apply). Coarse permission is gated on its own — Android deliberately fuzzes
   * coarse fixes, so a small reported accuracy number cannot be trusted to mean fine precision.
   */
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
  if (input.startSource === 'manual_place') {
    return {
      canStart: false,
      message: t('navigation.needLiveLocation'),
    };
  }

  if (input.startSource === 'remembered_location' || input.startSource === 'device_last_known') {
    return {
      canStart: false,
      message: t('navigation.savedLocationOld'),
    };
  }

  if (input.precision === 'coarse') {
    return {
      canStart: false,
      message: t('navigation.needExactLocation'),
    };
  }

  const fix = classifyLiveFix(input.coordinate, input.nowMs ?? Date.now());
  if (fix === 'none') {
    return {
      canStart: false,
      message: t('navigation.findingLocation'),
    };
  }

  if (fix === 'unusable') {
    return {
      canStart: false,
      message: t('navigation.locationNotExact'),
    };
  }

  if (fix === 'stale') {
    return {
      canStart: false,
      message: t('navigation.findingLocation'),
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
    return { kind: 'route_guide', primaryLabel: t('navigation.startRoute'), secondaryLabel: t('navigation.useMyLocationToGuide') };
  }
  const capability = evaluateLocationCapability({
    permission: { granted: input.permission.granted, canAskAgain: true, precision: input.permission.precision },
    liveFix: input.liveFix,
    nowMs: input.nowMs,
  });
  if (capability.permission === 'denied') {
    return { kind: 'turn_on_location', primaryLabel: t('navigation.turnOnLocationAndStart'), secondaryLabel: t('navigation.viewRoute') };
  }
  if (capability.liveBlocker === 'approximate_only') {
    return { kind: 'precise_location', primaryLabel: t('navigation.turnOnPreciseLocation'), secondaryLabel: t('navigation.viewRoute') };
  }
  if (capability.fix !== 'usable') {
    return { kind: 'use_location', primaryLabel: t('navigation.useMyLocationAndStart'), secondaryLabel: t('navigation.viewRoute') };
  }
  return { kind: 'start', primaryLabel: t('navigation.startNavigation'), title: t('navigation.readyToGo') };
}
