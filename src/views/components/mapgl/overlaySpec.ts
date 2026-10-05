/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #140: pure builders turning the app's V2 map layers into MapLibre GeoJSON sources + layer styles.
// Everything here is renderer data (no native imports) so it is unit-testable and reusable by the
// Ijtema visual-system work. Layer order in the returned array == draw order (bottom → top).

import type { Coordinate, Place } from '../../../models/types';
import type { V2BlockLayer, V2GateLayer, V2PolylineLayer } from '../../../services/V2MapRenderingService';
import { markerSizes, staticColors } from '../../../theme';

export type LngLat = [number, number];
export const toLngLat = (c: Coordinate): LngLat => [c.longitude, c.latitude];

export interface LayerSpec {
  id: string;
  type: 'fill' | 'line' | 'circle';
  paint: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown[];
}
export interface OverlaySpec {
  id: string;
  data: GeoJSON.FeatureCollection;
  layers: LayerSpec[];
}

export type FeatureKind = 'block' | 'gate' | 'rasta' | 'route' | 'facility';
/** Layers whose features are tappable (queried on map press). Invisible hit layers widen thin targets. */
export const HIT_LAYER_IDS = ['hit-blocks', 'hit-rastas', 'hit-special', 'hit-gates', 'hit-facilities'] as const;

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const line = (coords: readonly Coordinate[], properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates: coords.map(toLngLat) },
});
const point = (c: Coordinate, properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature<GeoJSON.Point> => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: toLngLat(c) },
});
const ring = (coords: readonly Coordinate[]): LngLat[] => {
  const r = coords.map(toLngLat);
  const [first, last] = [r[0], r[r.length - 1]];
  return first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...r, first] : r;
};
const polygon = (coords: readonly Coordinate[], properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates: [ring(coords)] },
});

const state = (selected: boolean, focused: boolean) => (selected ? 'selected' : focused ? 'focused' : 'normal');
const byState = (selected: unknown, focused: unknown, normal: unknown) => ['match', ['get', 'state'], 'selected', selected, 'focused', focused, normal];

/** The faint venue outline, shared by browse and the legacy navigation scene. */
export function buildVenueBoundaryOverlay(boundary: readonly Coordinate[]): OverlaySpec {
  return {
    id: 'venue-boundary',
    data: fc(boundary.length > 2 ? [polygon(boundary)] : []),
    layers: [
      { id: 'venue-boundary-fill', type: 'fill', paint: { 'fill-color': 'rgba(232,245,233,0.06)' } },
      { id: 'venue-boundary-line', type: 'line', paint: { 'line-color': 'rgba(46,125,50,0.48)', 'line-width': 2 } },
    ],
  };
}

export interface HomeVenueInput {
  venueBoundary: Coordinate[];
  blocks: V2BlockLayer[];
  rastas: V2PolylineLayer[];
  specialRoutes: V2PolylineLayer[];
  gates: V2GateLayer[];
  facilities: Place[];
  selectedFacilityId?: string;
  activeMapFilter: string;
}

/** Browse-mode venue overlay (Home): boundary, blocks, rastas, special routes, gates, facilities. */
export function buildHomeVenueOverlay(input: HomeVenueInput): OverlaySpec[] {
  const { activeMapFilter: filter } = input;
  const focusedOn = (name: string) => filter === name;
  return [
    buildVenueBoundaryOverlay(input.venueBoundary),
    {
      id: 'venue-blocks',
      data: fc(input.blocks.map((b) => polygon(b.polygon, { id: b.id, kind: 'block', label: b.label, state: state(b.isSelected, focusedOn('blocks')) }))),
      layers: [
        {
          id: 'blocks-fill',
          type: 'fill',
          paint: { 'fill-color': byState('rgba(26,115,232,0.42)', 'rgba(46,125,50,0.30)', 'rgba(46,125,50,0.14)') },
        },
        {
          id: 'blocks-line',
          type: 'line',
          paint: {
            'line-color': byState(staticColors.selectedBlock, staticColors.focusedBlock, staticColors.normalBlock),
            'line-width': byState(3, 2, 1.2),
          },
        },
        { id: 'hit-blocks', type: 'fill', paint: { 'fill-color': 'rgba(0,0,0,0.01)' } },
      ],
    },
    {
      id: 'venue-rastas',
      data: fc(input.rastas.map((r) => line(r.polyline, { id: r.sourceId ?? r.id, kind: 'rasta', label: r.label, state: state(r.isSelected, focusedOn('rastas')) }))),
      layers: [
        {
          id: 'rastas-casing',
          type: 'line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': byState('rgba(26,115,232,0.55)', 'rgba(32,33,36,0.55)', 'rgba(60,64,67,0.44)'),
            'line-width': byState(11, 12, 7),
          },
        },
        {
          id: 'rastas-line',
          type: 'line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': byState('#1A73E8', '#202124', 'rgba(255,255,255,0.9)'), 'line-width': byState(6, 7, 4) },
        },
        { id: 'hit-rastas', type: 'line', paint: { 'line-color': 'rgba(0,0,0,0.01)', 'line-width': 16 } },
      ],
    },
    {
      id: 'venue-rasta-ends',
      data: fc(
        input.rastas.flatMap((r) => {
          const [a, b] = [r.polyline[0], r.polyline[r.polyline.length - 1]];
          const s = state(r.isSelected, focusedOn('rastas'));
          return a && b ? [point(a, { state: s }), point(b, { state: s })] : [];
        }),
      ),
      layers: [
        {
          id: 'rasta-ends',
          type: 'circle',
          paint: {
            'circle-radius': byState(6, 6, markerSizes.rasta / 2),
            'circle-color': '#FFFFFF',
            'circle-stroke-width': 2,
            'circle-stroke-color': byState('#1A73E8', '#202124', 'rgba(60,64,67,0.75)'),
          },
        },
      ],
    },
    {
      id: 'venue-special',
      data: fc(input.specialRoutes.map((r) => line(r.polyline, { id: r.id, kind: 'route', label: r.label, state: state(r.isSelected, focusedOn('special_routes')) }))),
      layers: [
        {
          id: 'special-line',
          type: 'line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': byState('#6A0DAD', 'rgba(106,13,173,0.65)', 'rgba(142,36,170,0.55)'),
            'line-width': byState(7, 8, 3),
          },
        },
        { id: 'hit-special', type: 'line', paint: { 'line-color': 'rgba(0,0,0,0.01)', 'line-width': 18 } },
      ],
    },
    {
      id: 'venue-gates',
      data: fc(
        input.gates.map((g) =>
          point(g.coordinate, { id: g.id, kind: 'gate', label: g.label, warning: g.needsConnectorVerification ? 1 : 0, state: state(!!g.isSelected, focusedOn('gates')) }),
        ),
      ),
      layers: [
        {
          id: 'gates-dot',
          type: 'circle',
          paint: {
            'circle-radius': byState(markerSizes.gate / 2 + 2, markerSizes.gate / 2 + 1, markerSizes.gate / 2),
            'circle-color': ['case', ['==', ['get', 'warning'], 1], staticColors.gateMarkerWarning, staticColors.gateMarkerDot],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#FFFFFF',
          },
        },
        { id: 'hit-gates', type: 'circle', paint: { 'circle-radius': 22, 'circle-color': 'rgba(0,0,0,0.01)' } },
      ],
    },
    {
      id: 'venue-facilities',
      data: fc(
        input.facilities.map((p) => point(p.coordinate, { id: p.id, kind: 'facility', label: p.name, state: state(p.id === input.selectedFacilityId, false) })),
      ),
      layers: [
        {
          id: 'facilities-dot',
          type: 'circle',
          paint: {
            'circle-radius': markerSizes.facility / 2,
            'circle-color': staticColors.facilityAccent,
            'circle-stroke-width': byState(2.5, 1.5, 1.5),
            'circle-stroke-color': byState('#FFD700', '#FFFFFF', '#FFFFFF'),
          },
        },
        { id: 'hit-facilities', type: 'circle', paint: { 'circle-radius': 22, 'circle-color': 'rgba(0,0,0,0.01)' } },
      ],
    },
  ];
}

export interface NavVenueInput {
  blocks: V2BlockLayer[];
  rastas: V2PolylineLayer[];
  specialRoutes: V2PolylineLayer[];
}

/** Navigation/arrival venue overlay: read-only, quieter than browse so the route dominates. */
export function buildNavigationVenueOverlay(input: NavVenueInput): OverlaySpec[] {
  const sel = (b: { isSelected: boolean }) => (b.isSelected ? 'selected' : 'normal');
  return [
    {
      id: 'nav-blocks',
      data: fc(input.blocks.map((b) => polygon(b.polygon, { id: b.id, state: sel(b) }))),
      layers: [
        { id: 'nav-blocks-fill', type: 'fill', paint: { 'fill-color': byState('rgba(46,125,50,0.26)', 'rgba(46,125,50,0.26)', 'rgba(46,125,50,0.08)') } },
        {
          id: 'nav-blocks-line',
          type: 'line',
          paint: { 'line-color': byState(staticColors.normalBlock, staticColors.normalBlock, 'rgba(95,99,104,0.45)'), 'line-width': byState(2.5, 2.5, 1) },
        },
      ],
    },
    {
      id: 'nav-rastas',
      data: fc(input.rastas.map((r) => line(r.polyline, { id: r.id, state: sel(r) }))),
      layers: [
        { id: 'nav-rastas-casing', type: 'line', paint: { 'line-color': 'rgba(60,64,67,0.38)', 'line-width': 7 } },
        { id: 'nav-rastas-line', type: 'line', paint: { 'line-color': byState('#1A73E8', '#1A73E8', 'rgba(255,255,255,0.86)'), 'line-width': byState(5, 5, 4) } },
      ],
    },
    {
      id: 'nav-special',
      data: fc(input.specialRoutes.map((r) => line(r.polyline, { id: r.id, state: sel(r) }))),
      layers: [
        { id: 'nav-special-line', type: 'line', paint: { 'line-color': byState('#8E24AA', '#8E24AA', 'rgba(142,36,170,0.48)'), 'line-width': byState(5, 5, 3) } },
      ],
    },
  ];
}

export interface RouteInput {
  outside: readonly Coordinate[];
  roadFollowing: boolean;
  inside: readonly Coordinate[];
  /** Active navigation only: portions of `inside` already walked / still ahead. Preview passes neither. */
  walked?: readonly Coordinate[];
  remaining?: readonly Coordinate[];
  reroutePending?: boolean;
}

/** Route lines. Casing under fills; walked is muted, remaining carries the emphasis; reroute dashes the line. */
export function buildRouteOverlay(input: RouteInput): OverlaySpec[] {
  // Reroute pending: dash the route line (butt caps — round caps extend each dash by half the width and close the gaps)
  // over a solid casing, so the cue is visible and the two never drift out of phase.
  const dash = input.reroutePending ? { 'line-dasharray': [2, 1.6] } : {};
  const round = { 'line-cap': 'round', 'line-join': 'round' };
  const lineLayout = input.reroutePending ? { 'line-cap': 'butt', 'line-join': 'round' } : round;
  const specs: OverlaySpec[] = [];
  if (input.outside.length > 1) {
    specs.push({
      id: 'route-outside',
      data: fc([line(input.outside)]),
      layers: [
        { id: 'route-outside-casing', type: 'line', layout: round, paint: { 'line-color': staticColors.routeCasing, 'line-width': 9 } },
        {
          id: 'route-outside-line',
          type: 'line',
          layout: input.roadFollowing ? round : { 'line-join': 'round' },
          paint: { 'line-color': staticColors.routeOutside, 'line-width': 5, ...(input.roadFollowing ? {} : { 'line-dasharray': [1.6, 1.2] }) },
        },
      ],
    });
  }
  if (input.inside.length > 1) {
    const part = (name: string) => ['==', ['get', 'part'], name];
    const showProgress = (input.walked !== undefined || input.remaining !== undefined) && !input.reroutePending;
    const features: GeoJSON.Feature[] = [line(input.inside, { part: 'full' })];
    const layers: LayerSpec[] = [
      { id: 'route-casing', type: 'line', layout: round, paint: { 'line-color': staticColors.routeCasing, 'line-width': 11 }, filter: part('full') },
    ];
    if (!showProgress) {
      layers.push({ id: 'route-line', type: 'line', layout: lineLayout, paint: { 'line-color': staticColors.routeInside, 'line-width': 7, ...dash }, filter: part('full') });
    } else {
      if (input.walked && input.walked.length > 1) features.push(line(input.walked, { part: 'walked' }));
      if (input.remaining && input.remaining.length > 1) features.push(line(input.remaining, { part: 'remaining' }));
      layers.push(
        { id: 'route-walked', type: 'line', layout: round, paint: { 'line-color': staticColors.routeWalked, 'line-width': 7 }, filter: part('walked') },
        { id: 'route-remaining', type: 'line', layout: round, paint: { 'line-color': staticColors.routeInside, 'line-width': 7 }, filter: part('remaining') },
      );
    }
    specs.push({ id: 'route-inside', data: fc(features), layers });
  }
  return specs;
}

export interface MarkersInput {
  selectedPin?: Coordinate | null;
  destination?: Coordinate | null;
  start?: Coordinate | null;
  user?: { coordinate: Coordinate; accuracy?: number; remembered?: boolean; following?: boolean } | null;
}

// Metres → pixels at the current zoom/latitude, as an expression: px = m * 2^zoom / (156543.03392 * cos(lat))
// (MapLibre 512px tiles halve that constant's meaning, handled by the extra factor of 2).
const metersToPixels = (meters: number, lat: number) => [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  0, (meters * 2) / (156543.03392 * Math.cos((lat * Math.PI) / 180)) ,
  24, ((meters * 2) / (156543.03392 * Math.cos((lat * Math.PI) / 180))) * 2 ** 24,
];

/** Pins & dots drawn last (on top). The user dot is the highest-visibility element. */
export function buildMarkerOverlay(input: MarkersInput): OverlaySpec[] {
  const specs: OverlaySpec[] = [];
  const pins: GeoJSON.Feature[] = [];
  if (input.selectedPin) pins.push(point(input.selectedPin, { role: 'destination' }));
  if (input.destination) pins.push(point(input.destination, { role: 'destination' }));
  if (input.start) pins.push(point(input.start, { role: 'start' }));
  if (pins.length) {
    specs.push({
      id: 'markers-pins',
      data: fc(pins),
      layers: [
        {
          id: 'pin-dot',
          type: 'circle',
          paint: {
            'circle-radius': ['match', ['get', 'role'], 'destination', markerSizes.destination / 2.4, 8],
            'circle-color': ['match', ['get', 'role'], 'destination', staticColors.gateAccent, staticColors.startMarker],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#FFFFFF',
          },
        },
      ],
    });
  }
  if (input.user) {
    const u = input.user;
    const accuracy = typeof u.accuracy === 'number' && u.accuracy > 0 ? Math.min(u.accuracy, 150) : 0;
    const layers: LayerSpec[] = [];
    if (accuracy) {
      layers.push({
        id: 'user-accuracy',
        type: 'circle',
        paint: {
          // Rounded latitude: the paint expression must not change on every GPS tick (the venue spans ~0.01°).
          'circle-radius': metersToPixels(accuracy, Math.round(u.coordinate.latitude * 10) / 10),
          'circle-color': staticColors.userAccuracyFill,
          'circle-stroke-width': 1,
          'circle-stroke-color': staticColors.userAccuracyStroke,
        },
      });
    }
    layers.push({
      id: 'user-dot',
      type: 'circle',
      paint: {
        'circle-radius': markerSizes.userLocation / 3,
        'circle-color': staticColors.userLocation,
        'circle-stroke-width': u.following ? 3 : 2.5,
        'circle-stroke-color': u.following ? staticColors.info : '#FFFFFF',
        'circle-opacity': u.remembered ? 0.6 : 1,
      },
    });
    specs.push({ id: 'markers-user', data: fc([point(u.coordinate, { remembered: u.remembered ? 1 : 0 })]), layers });
  }
  return specs;
}
