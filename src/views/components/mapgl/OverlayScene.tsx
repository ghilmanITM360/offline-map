/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { OverlaySpec } from './overlaySpec';
import { staticColors } from '../../../theme';
import { MAP_LINE_WIDTH, ROUTE_FADE_MS } from './mapDesign';
import { revealSpecData } from './routeReveal';
import { useRouteReveal } from './useRouteReveal';

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
/** A replaced route, drawn once more and faded out while its successor reveals. Mounted last, so it never reorders the scene. */
function GhostRoute({ spec }: { spec: OverlaySpec }) {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFading(true), 40); // let the first (visible) paint land so the opacity change animates
    return () => clearTimeout(t);
  }, []);
  return (
    <GeoJSONSource id={`${spec.id}-ghost`} data={spec.data}>
      <Layer
        id={`${spec.id}-ghost-line`}
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' } as never}
        paint={{
          'line-color': staticColors.routeInside,
          'line-width': MAP_LINE_WIDTH.activeRoute,
          'line-opacity': fading ? 0 : 0.45,
          'line-opacity-transition': { duration: fading ? ROUTE_FADE_MS : 0, delay: 0 },
        } as never}
      />
    </GeoJSONSource>
  );
}

export const OverlayScene = React.memo(function OverlayScene({ specs }: { specs: OverlaySpec[] }) {
  // A route with a new reveal key REPLACES the one drawn before (reroute, new start): keep the old one briefly as a ghost.
  const previous = useRef<OverlaySpec[]>([]);
  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ghosts, setGhosts] = useState<OverlaySpec[]>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = specs;
    const born = specs.flatMap((spec) => {
      const old = before.find((p) => p.id === spec.id);
      return spec.reveal && old && old.data !== spec.data && old.reveal?.key !== spec.reveal.key ? [old] : [];
    });
    if (born.length === 0) return;
    setGhosts(born);
    // Not cleared by this effect's cleanup: progress ticks re-run it constantly, and the ghost must still go.
    if (ghostTimer.current) clearTimeout(ghostTimer.current);
    ghostTimer.current = setTimeout(() => {
      ghostTimer.current = null;
      setGhosts([]);
    }, ROUTE_FADE_MS + 100);
  }, [specs]);
  useEffect(() => () => {
    if (ghostTimer.current) clearTimeout(ghostTimer.current);
  }, []);

  // Route reveal is local to the scene (one timer here), so Home does not re-render per animation frame.
  const progress = useRouteReveal(specs.find((s) => s.reveal)?.reveal?.key);
  let prefix = '';
  return (
    <>
      {specs.map((spec) => {
        prefix += `${spec.id}:${spec.layers.map((l) => l.id).join(',')}|`;
        return (
          <GeoJSONSource key={prefix} id={spec.id} data={revealSpecData(spec, progress)}>
            {spec.layers.map((layer) => (
              <Layer key={layer.id} id={layer.id} type={layer.type} paint={layer.paint as never} layout={layer.layout as never} filter={layer.filter as never} minzoom={layer.minzoom} />
            ))}
          </GeoJSONSource>
        );
      })}
      {ghosts.map((ghost) => (
        <GhostRoute key={`ghost-${ghost.id}`} spec={ghost} />
      ))}
    </>
  );
});
