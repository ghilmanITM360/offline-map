import { buildNavigationScene, buildNavigationSceneV1 } from '../views/components/mapgl/navigationScene';

const c = (latitude: number, longitude: number) => ({ latitude, longitude });
const ROUTE_COORDS = [c(25, 67), c(25.001, 67), c(25.002, 67), c(25.003, 67)];
const layers = { blocks: [], rastas: [], specialRoutes: [], gates: [] };

const overlay = (over: Record<string, unknown> = {}) =>
  ({
    route: {
      coordinates: ROUTE_COORDS,
      outsideLegCoordinateCount: 0,
      outsideRoute: undefined,
      origin: { coordinate: c(25, 67), label: 'Start' },
      destination: { coordinate: c(25.003, 67), label: 'Dest' },
    },
    snappedLocation: c(25.0015, 67),
    arrived: false,
    reroutePending: false,
    mapLayers: layers,
    currentLocationSource: 'live',
    ...over,
  }) as never;

const ids = (specs: ReturnType<typeof buildNavigationScene>) => specs.map((s) => s.id);

describe('buildNavigationScene', () => {
  it('is empty without a route', () => {
    expect(buildNavigationScene(overlay({ route: null }))).toEqual([]);
  });

  it('draws venue context under the route and markers on top', () => {
    const order = ids(buildNavigationScene(overlay()));
    expect(order).toEqual(['nav-blocks', 'nav-rastas', 'nav-special', 'route-inside', 'markers-pins', 'markers-user']);
  });

  it('splits the inside leg into walked and remaining from the snapped location', () => {
    const route = buildNavigationScene(overlay()).find((s) => s.id === 'route-inside')!;
    const parts = route.data.features.map((f) => f.properties!.part);
    expect(parts).toEqual(['full', 'walked', 'remaining']);
  });

  it('shows a single dashed route while a reroute is pending', () => {
    const route = buildNavigationScene(overlay({ reroutePending: true })).find((s) => s.id === 'route-inside')!;
    expect(route.layers.map((l) => l.id)).toEqual(['route-casing', 'route-line']);
  });

  it('navigation shows start + destination + user; arrival drops start and keeps destination', () => {
    const roles = (specs: ReturnType<typeof buildNavigationScene>) => specs.find((s) => s.id === 'markers-pins')!.data.features.map((f) => f.properties!.role);
    expect(roles(buildNavigationScene(overlay()))).toEqual(['destination', 'start']);
    expect(roles(buildNavigationScene(overlay({ arrived: true })))).toEqual(['destination']);
  });

  it('reveals a rerouted route and not the route navigation started with', () => {
    const plain = buildNavigationScene(overlay()).find((s) => s.id === 'route-inside')!;
    expect(plain.reveal).toBeUndefined();
    const rerouted = buildNavigationScene(overlay({ revealKey: 'reroute-1' })).find((s) => s.id === 'route-inside')!;
    expect(rerouted.reveal!.key).toBe('reroute-1');
  });

  it('passes the arrival pulse to the destination marker and nowhere else', () => {
    const ring = (specs: ReturnType<typeof buildNavigationScene>) =>
      specs.find((s) => s.id === 'markers-pins')!.layers.find((l) => l.id === 'destination-pulse')!.paint['circle-opacity'];
    expect(ring(buildNavigationScene(overlay({ arrived: true })))).toBe(0);
    expect(ring(buildNavigationScene(overlay({ arrived: true, pulse: 'static' })))).toBeGreaterThan(0);
  });

  it('keeps a user dot only when there is a snapped navigation location', () => {
    expect(ids(buildNavigationScene(overlay({ snappedLocation: null })))).not.toContain('markers-user');
  });

  it('flags a remembered (not live) location on the user dot', () => {
    const user = buildNavigationScene(overlay({ currentLocationSource: 'remembered' })).find((s) => s.id === 'markers-user')!;
    expect(user.data.features[0].properties!.remembered).toBe(1);
  });

  it('draws the outside leg as its own dashed-or-solid source when the route has one', () => {
    const withOutside = overlay();
    (withOutside as never as { route: Record<string, unknown> }).route = {
      ...(withOutside as never as { route: Record<string, unknown> }).route,
      outsideLegCoordinateCount: 2,
      outsideRoute: { roadFollowing: false },
    };
    const specs = buildNavigationScene(withOutside);
    expect(ids(specs)).toContain('route-outside');
  });
});

describe('buildNavigationSceneV1 (facility destinations)', () => {
  const v1 = (over: Record<string, unknown> = {}) =>
    ({
      route: { coordinates: ROUTE_COORDS },
      destination: { id: 'LM_X', coordinate: c(25.003, 67) },
      snappedLocation: c(25.0015, 67),
      arrived: true,
      reroutePending: false,
      mapLayers: { edges: [], blocks: [], venueBoundary: [] },
      currentLocationSource: 'live',
      ...over,
    }) as never;

  it('takes the same reroute reveal and arrival pulse as the v2 scene', () => {
    const specs = buildNavigationSceneV1(v1({ revealKey: 'reroute-1', pulse: 'static' }));
    expect(specs.find((s) => s.id === 'route-inside')!.reveal!.key).toBe('reroute-1');
    const ring = specs.find((s) => s.id === 'markers-pins')?.layers.find((l) => l.id === 'destination-pulse');
    expect(ring?.paint['circle-opacity']).toBeGreaterThan(0);
  });
});
