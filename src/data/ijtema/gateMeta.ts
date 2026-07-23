/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gates prioritized as always-visible orientation landmarks and never suppressed
 * by label-collision/declutter logic — see V2MapRenderingService's MAJOR_GATE_IDS
 * usage (declutterGateMarkers priority, getNavigationCorridorLayers always-visible
 * set). Reused by V2PlaceAdapter to surface a data-driven "recommended entry point"
 * signal on the gate's LocationSheet, instead of inventing a separate designation.
 */
export const MAJOR_GATE_IDS: ReadonlySet<string> = new Set(['GATE_05', 'GATE_08', 'GATE_13', 'GATE_21', 'GATE_22']);
