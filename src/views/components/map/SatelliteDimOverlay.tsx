/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Polygon } from 'react-native-maps';

import { Coordinate } from '../../../models/types';

/**
 * Phase 11 (task #38): satellite imagery is visually busy and varies wildly in color, so the
 * existing translucent overlay styling (tuned for the flat gray/white standard basemap) loses
 * legibility on top of it — this is the "no overlay-contrast system exists today" gap called
 * out in docs/ARCHITECTURE.md §6/§7. Rather than re-tuning every layer's per-state
 * color/opacity for a second basemap (high risk, unverifiable without a device), this renders
 * one uniform semi-transparent dark scrim over the satellite tiles wherever the venue's
 * overlays can appear — every existing block/gate/rasta/route/label keeps its current colors
 * and gets more legible "for free" against the now-darker imagery underneath.
 */
export function SatelliteDimOverlay({ bounds }: { bounds: Coordinate[] }) {
  return (
    <Polygon
      coordinates={bounds}
      fillColor="rgba(0,0,0,0.32)"
      strokeColor="transparent"
      strokeWidth={0}
      tappable={false}
      zIndex={-1}
    />
  );
}
