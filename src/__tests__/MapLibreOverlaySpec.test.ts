import { MAP_LINE_WIDTH } from '../views/components/mapgl/mapDesign';
import { sceneSignature } from '../views/components/mapgl/OverlayScene';
import {
  buildHomeVenueOverlay,
  buildMarkerOverlay,
  buildNavigationVenueOverlay,
  buildRouteOverlay,
  HIT_LAYER_IDS,
} from '../views/components/mapgl/overlaySpec';
import type { V2BlockLayer, V2GateLayer, V2PolylineLayer } from '../services/V2MapRenderingService';
import type { Place } from '../models/types';

const c = (latitude: number, longitude: number) => ({ latitude, longitude });
const name = { en: 'x', ur: 'x' } as never;
const block = (id: string, isSelected = false): V2BlockLayer => ({
  id, label: `Block ${id}`, name, center: c(25, 67), isSelected, pulse: false,
  polygon: [c(25, 67), c(25, 67.001), c(25.001, 67.001)], // open ring on purpose
});
const poly = (id: string, isSelected = false): V2PolylineLayer => ({
  id, label: id, name, polyline: [c(25, 67), c(25.001, 67.001)], labelCoordinate: c(25, 67), isSelected,
});
const gate = (id: string, warn = false, isSelected = false): V2GateLayer => ({
  id, label: id, name, coordinate: c(25, 67.002), isRoutable: true, isStartRoutable: true, needsConnectorVerification: warn, isSelected,
});
const facility = { id: 'LM_FOOD_1', name: 'Food', coordinate: c(25, 67.003) } as unknown as Place;

const home = (over = {}) =>
  buildHomeVenueOverlay({
    venueBoundary: [c(25, 67), c(25, 67.01), c(25.01, 67.01)],
    blocks: [block('B1'), block('B2', true)],
    rastas: [poly('R1')],
    specialRoutes: [poly('S1')],
    gates: [gate('G1'), gate('G2', true)],
    facilities: [facility],
    activeMapFilter: 'none',
    ...over,
  });
const byId = (specs: ReturnType<typeof home>, id: string) => specs.find((s) => s.id === id)!;

describe('buildHomeVenueOverlay', () => {
  it('emits GeoJSON in [lng, lat] order and closes open polygon rings', () => {
    const blocks = byId(home(), 'venue-blocks').data.features;
    const g = blocks[0].geometry as GeoJSON.Polygon;
    expect(g.coordinates[0][0]).toEqual([67, 25]);
    expect(g.coordinates[0][0]).toEqual(g.coordinates[0][g.coordinates[0].length - 1]);
  });

  it('draws bottom→top: boundary, blocks, rastas, special routes, gates, facilities', () => {
    expect(home().map((s) => s.id)).toEqual(['venue-boundary', 'venue-blocks', 'venue-rastas', 'venue-rasta-ends', 'venue-special', 'venue-gates', 'venue-facilities']);
  });

  it('marks selected and filter-focused features through a state property the styles key off', () => {
    const states = (spec: string) => byId(home({ activeMapFilter: 'blocks' }), spec).data.features.map((f) => f.properties!.state);
    expect(states('venue-blocks')).toEqual(['focused', 'selected']);
    expect(byId(home({ activeMapFilter: 'rastas' }), 'venue-rastas').data.features[0].properties!.state).toBe('focused');
  });

  it('carries id, kind and label so a tap can be resolved back to a place', () => {
    const f = byId(home(), 'venue-gates').data.features[1].properties!;
    expect(f).toMatchObject({ id: 'G2', kind: 'gate', label: 'G2', warning: 1 });
    expect(byId(home(), 'venue-rastas').data.features[0].properties).toMatchObject({ id: 'R1', kind: 'rasta' });
    expect(byId(home(), 'venue-special').data.features[0].properties).toMatchObject({ id: 'S1', kind: 'route' });
    expect(byId(home(), 'venue-facilities').data.features[0].properties).toMatchObject({ id: 'LM_FOOD_1', kind: 'facility' });
  });

  it('rasta tap identity prefers sourceId when one rasta is surveyed as several segments', () => {
    const r = { ...poly('R1_seg2'), sourceId: 'R1' };
    expect(byId(home({ rastas: [r] }), 'venue-rastas').data.features[0].properties!.id).toBe('R1');
  });

  it('every tappable hit layer exists exactly once and none are missing from the spec', () => {
    const ids = home().flatMap((s) => s.layers.map((l) => l.id));
    for (const hit of HIT_LAYER_IDS) expect(ids.filter((i) => i === hit)).toHaveLength(1);
  });

  it('adds two endpoint dots per rasta and nothing for degenerate polylines', () => {
    expect(byId(home(), 'venue-rasta-ends').data.features).toHaveLength(2);
    expect(byId(home({ rastas: [{ ...poly('R'), polyline: [] }] }), 'venue-rasta-ends').data.features).toHaveLength(0);
  });

  it('skips a boundary that cannot form a polygon', () => {
    expect(byId(home({ venueBoundary: [c(1, 1)] }), 'venue-boundary').data.features).toHaveLength(0);
  });
});

describe('buildNavigationVenueOverlay', () => {
  it('is read-only: no hit layers', () => {
    const specs = buildNavigationVenueOverlay({ blocks: [block('B1')], rastas: [poly('R')], specialRoutes: [poly('S')] });
    const ids = specs.flatMap((s) => s.layers.map((l) => l.id));
    expect(ids.some((i) => i.startsWith('hit-'))).toBe(false);
    expect(ids).toEqual(expect.arrayContaining(['nav-blocks-fill', 'nav-rastas-line', 'nav-special-line']));
  });
});

describe('buildRouteOverlay', () => {
  const pts = [c(25, 67), c(25.001, 67), c(25.002, 67)];

  it('preview: one casing + one line, no walked/remaining split', () => {
    const [inside] = buildRouteOverlay({ outside: [], roadFollowing: false, inside: pts });
    expect(inside.layers.map((l) => l.id)).toEqual(['route-casing', 'route-line']);
  });

  it('navigation: muted walked part under an emphasised remaining part', () => {
    const [inside] = buildRouteOverlay({ outside: [], roadFollowing: false, inside: pts, walked: pts.slice(0, 2), remaining: pts.slice(1) });
    expect(inside.layers.map((l) => l.id)).toEqual(['route-casing', 'route-walked', 'route-remaining']);
    expect(inside.data.features.map((f) => f.properties!.part)).toEqual(['full', 'walked', 'remaining']);
  });

  it('reroute pending: a single dashed route, never two equally active lines', () => {
    const [inside] = buildRouteOverlay({ outside: [], roadFollowing: false, inside: pts, walked: pts.slice(0, 2), remaining: pts.slice(1), reroutePending: true });
    expect(inside.layers.map((l) => l.id)).toEqual(['route-casing', 'route-line']);
    expect(inside.layers[1].paint['line-dasharray']).toBeDefined();
    // Round caps would extend every dash by half the line width and close the gaps, so dashes use butt caps and a solid casing.
    expect(inside.layers[1].layout).not.toMatchObject({ 'line-cap': 'round' });
    expect(inside.layers[0].paint['line-dasharray']).toBeUndefined();
  });

  it('outside leg is dashed unless it follows roads, and absent when too short', () => {
    const dashed = buildRouteOverlay({ outside: pts, roadFollowing: false, inside: [] })[0];
    const solid = buildRouteOverlay({ outside: pts, roadFollowing: true, inside: [] })[0];
    expect(dashed.layers[1].paint['line-dasharray']).toBeDefined();
    expect(solid.layers[1].paint['line-dasharray']).toBeUndefined();
    expect(buildRouteOverlay({ outside: [pts[0]], roadFollowing: true, inside: [pts[0]] })).toHaveLength(0);
  });
});

describe('live progress emphasis', () => {
  it('draws the walked part thinner and fainter than the remaining part, which keeps the full active-route weight', () => {
    const inside = [c(25, 67), c(25.001, 67), c(25.002, 67)];
    const [spec] = buildRouteOverlay({ outside: [], roadFollowing: false, inside, walked: inside.slice(0, 2), remaining: inside.slice(1) });
    const walked = spec.layers.find((l) => l.id === 'route-walked')!.paint;
    const remaining = spec.layers.find((l) => l.id === 'route-remaining')!.paint;
    expect(walked['line-width']).toBeLessThan(remaining['line-width']);
    expect(remaining['line-width']).toBe(MAP_LINE_WIDTH.activeRoute);
    expect(walked['line-color']).not.toBe(remaining['line-color']);
  });
});

describe('route reveal timeline', () => {
  const out = [c(25, 67), c(25.003, 67)];
  const inn = [c(25.003, 67), c(25.004, 67)];

  it('marks nothing for reveal unless a key is given (live progress alone never animates)', () => {
    expect(buildRouteOverlay({ outside: out, roadFollowing: true, inside: inn }).every((s) => s.reveal === undefined)).toBe(true);
    const nav = buildRouteOverlay({ outside: out, roadFollowing: true, inside: inn, walked: [inn[0]], remaining: inn });
    expect(nav.every((s) => s.reveal === undefined)).toBe(true);
  });

  it('reveals a rerouted route during navigation: progress parts grow with the same key', () => {
    const [outside, inside] = buildRouteOverlay({ outside: out, roadFollowing: true, inside: inn, walked: [], remaining: inn, revealKey: 'reroute-1' });
    expect(outside.reveal!.key).toBe('reroute-1');
    expect(inside.reveal!.key).toBe('reroute-1');
  });

  it('draws the outside leg first, then the inside leg, in proportion to their lengths, under one key', () => {
    const [outside, inside] = buildRouteOverlay({ outside: out, roadFollowing: true, inside: inn, revealKey: 'k' });
    expect(outside.reveal!.key).toBe('k');
    expect(inside.reveal!.key).toBe('k');
    expect(outside.reveal!.from).toBe(0);
    expect(outside.reveal!.to).toBeCloseTo(0.75, 1);
    expect(inside.reveal!.from).toBe(outside.reveal!.to);
    expect(inside.reveal!.to).toBe(1);
  });

  it('an inside-only route reveals over the whole timeline', () => {
    const [inside] = buildRouteOverlay({ outside: [], roadFollowing: false, inside: inn, revealKey: 'k' });
    expect(inside.reveal).toEqual({ key: 'k', from: 0, to: 1 });
  });

  it('keeps the scene structure identical with and without reveal (no remount)', () => {
    const a = buildRouteOverlay({ outside: out, roadFollowing: true, inside: inn });
    const b = buildRouteOverlay({ outside: out, roadFollowing: true, inside: inn, revealKey: 'k' });
    expect(sceneSignature(a)).toBe(sceneSignature(b));
  });
});

describe('buildMarkerOverlay', () => {
  it('renders nothing without markers', () => {
    expect(buildMarkerOverlay({})).toEqual([]);
  });

  it('puts destination/start pins and the user dot in separate sources, user last (on top)', () => {
    const specs = buildMarkerOverlay({ destination: c(25, 67), start: c(25.1, 67), user: { coordinate: c(25, 67), accuracy: 20 } });
    expect(specs.map((s) => s.id)).toEqual(['markers-pins', 'markers-user']);
    expect(specs[0].data.features.map((f) => f.properties!.role)).toEqual(['destination', 'start']);
    expect(specs[1].layers.map((l) => l.id)).toEqual(['user-accuracy', 'user-dot']);
  });

  it('caps the accuracy circle at 150 m and skips it for missing/zero accuracy', () => {
    const withBig = buildMarkerOverlay({ user: { coordinate: c(25, 67), accuracy: 900 } })[0].layers[0];
    const small = buildMarkerOverlay({ user: { coordinate: c(25, 67), accuracy: 150 } })[0].layers[0];
    expect(JSON.stringify(withBig.paint['circle-radius'])).toEqual(JSON.stringify(small.paint['circle-radius']));
    expect(buildMarkerOverlay({ user: { coordinate: c(25, 67) } })[0].layers.map((l) => l.id)).toEqual(['user-dot']);
  });
});

describe('destination pulse ring', () => {
  const ring = (pulse?: 'idle' | 'start' | 'out' | 'static') =>
    buildMarkerOverlay({ selectedPin: c(25, 67), pulse })[0].layers.find((l) => l.id === 'destination-pulse')!;

  it('sits under the pin, only for the destination, and is invisible at rest', () => {
    const layers = buildMarkerOverlay({ destination: c(25, 67), start: c(25.1, 67) })[0].layers;
    expect(layers.map((l) => l.id)).toEqual(['destination-pulse', 'pin-icon']);
    expect(JSON.stringify(layers[0].filter)).toContain('destination');
    expect(ring().paint['circle-opacity']).toBe(0);
    expect(ring('idle').paint['circle-opacity']).toBe(0);
  });

  it('runs one short outward cycle: start small and visible, end large and gone, 600-1000 ms, natively animated', () => {
    const from = ring('start').paint;
    const to = ring('out').paint;
    expect(from['circle-opacity']).toBeGreaterThan(0);
    expect(to['circle-opacity']).toBe(0);
    expect(to['circle-radius']).toBeGreaterThan(from['circle-radius']);
    const { duration } = to['circle-radius-transition'];
    expect(duration).toBeGreaterThanOrEqual(600);
    expect(duration).toBeLessThanOrEqual(1000);
    expect(to['circle-opacity-transition'].duration).toBe(duration);
  });

  it('never animates when resting, restarting or under reduced motion (static emphasis only)', () => {
    for (const phase of ['idle', 'start', 'static'] as const) {
      expect(ring(phase).paint['circle-radius-transition'].duration).toBe(0);
      expect(ring(phase).paint['circle-opacity-transition'].duration).toBe(0);
    }
    expect(ring('static').paint['circle-opacity']).toBeGreaterThan(0);
  });

  it('keeps the scene structure identical across phases, so a phase change is a paint update, not a remount', () => {
    const sig = (pulse: 'idle' | 'start' | 'out' | 'static') => sceneSignature(buildMarkerOverlay({ selectedPin: c(25, 67), pulse }));
    expect(new Set([sig('idle'), sig('start'), sig('out'), sig('static')]).size).toBe(1);
  });
});

describe('sceneSignature', () => {
  it('is stable across data-only changes and changes when the source/layer structure changes', () => {
    const a = buildRouteOverlay({ outside: [], roadFollowing: false, inside: [c(25, 67), c(25.1, 67)] });
    const sameShapeNewData = buildRouteOverlay({ outside: [], roadFollowing: false, inside: [c(25, 67), c(25.2, 67.1)] });
    const withProgress = buildRouteOverlay({ outside: [], roadFollowing: false, inside: [c(25, 67), c(25.1, 67)], walked: [c(25, 67), c(25.05, 67)], remaining: [c(25.05, 67), c(25.1, 67)] });
    expect(sceneSignature(a)).toBe(sceneSignature(sameShapeNewData));
    expect(sceneSignature(a)).not.toBe(sceneSignature(withProgress));
  });
});
