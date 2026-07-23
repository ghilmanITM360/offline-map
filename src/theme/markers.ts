/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { staticColors } from './colors';

/**
 * Centralized marker geometry (Phase 8A.5 task 2) — values copied verbatim from the
 * call sites they replace (GateLayer/RastaLayer dots, HomeScreen search/destination
 * pins, navOverlayStyles user marker) so adopting a token is pixel-identical.
 *
 * `destination` (32) is used by both the selected-place pin and the route-preview
 * destination pin — reconciled in Phase 8B task 4 (previously the preview pin had
 * its own one-off literal of 30).
 */
export const markerSizes = {
  userLocation: 28,
  destination: 32,
  gate: 10,
  block: 12,
  rasta: 9,
  facility: 18,
} as const;

export type MarkerSizeToken = keyof typeof markerSizes;

export const markerColors = {
  selected: staticColors.selectedBlock,
  normal: staticColors.normalBlock,
  route: staticColors.routeInside,
  warning: staticColors.gateMarkerWarning,
} as const;

export type MarkerColorToken = keyof typeof markerColors;
