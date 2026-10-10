import { useAppStore } from '../store/useAppStore';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import type { RoutePreviewV2 } from '../services/RoutingServiceV2';

const initial = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('GATE_13')!;
const preview: RoutePreviewV2 = { id: 'preview-authority', sourceVersion: 'v2', nodes: [], segments: [], coordinates: [start.coordinate, destination.coordinate], totalDistance: 200, estimatedTimeMin: 3, startLabel: 'Live location', destinationLabel: destination.name, instructions: [] };
const prepare = () => {
  const fix = { ...start.coordinate, accuracy: 8, observedAtMs: Date.now() };
  useAppStore.setState({ locationServicesState: 'enabled', hasLocationPermission: true, locationPermissionPrecision: 'fine', currentLocation: fix, currentLocationSource: 'live', routePlannerDest: destination, routePlannerOrigin: null, activeRoute: preview });
  return V2NavigationAdapter.fromPreview({ previewRoute: preview, destination, currentLocation: fix });
};
beforeEach(() => useAppStore.setState(initial, true));

it.each([
  { hasLocationPermission: false },
  { locationPermissionPrecision: 'none' as const },
  { currentLocationSource: 'remembered' as const },
  { currentLocation: { ...start.coordinate, accuracy: 8 } },
  { currentLocation: { ...start.coordinate, accuracy: NaN, observedAtMs: Date.now() } },
  { routePlannerOrigin: start },
  { routePlannerDest: start },
  { activeRoute: null },
])('store activation cannot bypass current authority: %p', override => {
  const active = prepare();
  useAppStore.setState(override);
  const before = useAppStore.getState();
  useAppStore.getState().startNavigation(destination, active, active.instructions, preview);
  expect(useAppStore.getState()).toBe(before);
});

it('a composed route without the published preview identity cannot activate', () => {
  const active = prepare();
  const before = useAppStore.getState();
  useAppStore.getState().startNavigation(destination, active, active.instructions);
  expect(useAppStore.getState()).toBe(before);
});

it('exact published preview authorizes composition with fresh live permission', () => {
  const active = prepare();
  useAppStore.getState().startNavigation(destination, active, active.instructions, preview);
  expect(useAppStore.getState().isNavigating).toBe(true);
  expect(useAppStore.getState().activeRoute).toBe(active);
});

it('disabled services preserve the guide and pending journey', () => {
  const active = prepare();
  useAppStore.setState({ locationServicesState: 'disabled' });
  const before = useAppStore.getState();
  useAppStore.getState().startNavigation(destination, active, active.instructions, preview);
  expect(useAppStore.getState()).toBe(before);
});

it('unknown services cannot authorize activation', () => {
  const active = prepare();
  useAppStore.setState({ locationServicesState: 'unknown' });
  expect(useAppStore.getState().startNavigation(destination, active, active.instructions, preview)).toBe(false);
  expect(useAppStore.getState().isNavigating).toBe(false);
});
