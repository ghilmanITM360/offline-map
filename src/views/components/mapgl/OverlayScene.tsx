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
 * mounted, so a source that stays mounted while another appears BELOW it in the spec order would end up above it (the
 * user dot beneath the route when navigation starts, the other way round if the key were omitted). Each source's React key
 * is the structure of everything up to and including it, so a structural change remounts that source and the ones drawn
 * after it — the small, dynamic top of the stack — while the large venue sources below stay put. Data-only changes (GPS
 * ticks, progress) keep every key and update in place.
 */
export const OverlayScene = React.memo(function OverlayScene({ specs }: { specs: OverlaySpec[] }) {
  let prefix = '';
  return (
    <>
      {specs.map((spec) => {
        prefix += `${spec.id}:${spec.layers.map((l) => l.id).join(',')}|`;
        return (
          <GeoJSONSource key={prefix} id={spec.id} data={spec.data}>
            {spec.layers.map((layer) => (
              <Layer key={layer.id} id={layer.id} type={layer.type} paint={layer.paint as never} layout={layer.layout as never} filter={layer.filter as never} minzoom={layer.minzoom} />
            ))}
          </GeoJSONSource>
        );
      })}
    </>
  );
});
