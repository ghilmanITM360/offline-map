/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Host facade for the live-navigation start gate and start action. Decisions come from the shared domain layer
// (future @muslim-ummah/offline-navigation); this module supplies the wall clock when `nowMs` is omitted and
// turns each decision into localized copy.

import { t } from '../i18n/translate';
import type { Coordinate } from '../models/types';
import {
  evaluateNavigationStart,
  resolveStartActionKind,
  type NavigationStartBlock,
  type NavigationStartSource,
  type StartActionKind,
} from '@muslim-ummah/offline-navigation';

export type { NavigationStartSource, StartActionKind };

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

const BLOCK_MESSAGE: Record<NavigationStartBlock, () => string> = {
  manual_start: () => t('capability.manualLive'),
  saved_start: () => t('capability.savedLive'),
  approximate_precision: () => t('capability.exactLive'),
  precision_unknown: () => t('directions.precisionUnknown'),
  no_fix: () => t('capability.acquiring'),
  stale_fix: () => t('capability.acquiring'),
  weak_fix: () => t('capability.openArea'),
};

export function evaluateNavigationLocationCapability(
  input: NavigationLocationCapabilityInput,
): NavigationLocationCapability {
  const decision = evaluateNavigationStart({ ...input, nowMs: input.nowMs ?? Date.now() });
  return { canStart: decision.canStart, message: decision.block ? BLOCK_MESSAGE[decision.block]() : '' };
}

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
  /** The route is only a straight-line direct guide (OUTSIDE_VENUE_GUIDE): there is no walking route to follow live. */
  directGuide?: boolean;
  nowMs?: number;
}

/**
 * Turns the (unchanged) live-navigation safety gate into one actionable primary button.
 * A planned/manual start is a route preview; live guidance still needs a fresh precise fix.
 */
export function resolveStartAction(input: StartActionInput): StartAction {
  const { kind, precisionUnknown } = resolveStartActionKind({ ...input, nowMs: input.nowMs ?? Date.now() });
  switch (kind) {
    case 'route_guide':
      // A start the user chose or saved offers live guidance one tap away; a direct guide (A1-10) or a live start does not.
      return input.startSource !== 'live_gps'
        ? { kind, primaryLabel: t('capability.startRoute'), secondaryLabel: t('capability.guideLocation') }
        : { kind, primaryLabel: t('capability.startRoute') };
    case 'turn_on_location':
      return { kind, primaryLabel: t('capability.turnOnStart'), secondaryLabel: t('capability.viewRoute') };
    case 'precise_location':
      return { kind, primaryLabel: t('capability.precise'), secondaryLabel: t('capability.viewRoute') };
    case 'use_location':
      return { kind, primaryLabel: precisionUnknown ? t('directions.checkLocation') : t('capability.useStart'), secondaryLabel: t('capability.viewRoute') };
    case 'start':
      return { kind, primaryLabel: t('capability.startNavigation'), title: t('capability.ready') };
  }
}
