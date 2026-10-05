/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { OverlaySpec } from './overlaySpec';

/** Identity of the scene's structure (sources + layer ids, in order) — deliberately ignores feature data. */
export const sceneSignature = (specs: OverlaySpec[]) => specs.map((s) => `${s.id}:${s.layers.map((l) => l.id).join(',')}`).join('|');

/**
 * Renders overlay specs in array order (bottom → top). MapLibre stacks a layer on top of the style at the moment it is
 * mounted, so a source that stays mounted while others appear after it would end up UNDER them (the user dot beneath the
 * route when navigation starts). Remounting the scene when its structure changes re-adds everything in spec order;
 * data-only changes (GPS ticks, progress) keep the signature and update in place.
 */
export const OverlayScene = React.memo(function OverlayScene({ specs }: { specs: OverlaySpec[] }) {
  return (
    <React.Fragment key={sceneSignature(specs)}>
      {specs.map((spec) => (
        <GeoJSONSource key={spec.id} id={spec.id} data={spec.data}>
          {spec.layers.map((layer) => (
            <Layer key={layer.id} id={layer.id} type={layer.type} paint={layer.paint as never} layout={layer.layout as never} filter={layer.filter as never} />
          ))}
        </GeoJSONSource>
      ))}
    </React.Fragment>
  );
});
