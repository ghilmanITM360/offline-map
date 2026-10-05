/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { OverlaySpec } from './overlaySpec';

/** Renders overlay specs in array order (bottom → top). Source ids are stable so updates diff in place. */
export const OverlayScene = React.memo(function OverlayScene({ specs }: { specs: OverlaySpec[] }) {
  return (
    <>
      {specs.map((spec) => (
        <GeoJSONSource key={spec.id} id={spec.id} data={spec.data}>
          {spec.layers.map((layer) => (
            <Layer key={layer.id} id={layer.id} type={layer.type} paint={layer.paint as never} layout={layer.layout as never} filter={layer.filter as never} />
          ))}
        </GeoJSONSource>
      ))}
    </>
  );
});
