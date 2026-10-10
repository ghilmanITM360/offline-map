import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { startPreviewNavigationV2 } from '../viewmodels/NavigationViewModelV2';
import type { V2ActiveRoute } from '../models/types';
import type { RoutePreviewV2 } from '../services/RoutingServiceV2';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { IJTEMA_GATES } from '../data/ijtema/gates';
import { useAppStore } from '../store/useAppStore';

const initial = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('GATE_13')!;
const preview: RoutePreviewV2 = {
  id: 'manual-preview', sourceVersion: 'v2', nodes: [], segments: [],
  coordinates: [start.coordinate, destination.coordinate],
  totalDistance: 200, estimatedTimeMin: 3, startLabel: 'Gate 13', destinationLabel: 'Block 1',
  instructions: [],
};
const startPreview = startPreviewNavigationV2;

afterEach(() => useAppStore.setState(initial, true));

describe('V2 preview start ownership', () => {
  test('manual start cannot create a live session even with an unrelated GPS fix', () => {
    const before = useAppStore.getState();
    expect(startPreview({ route: preview, destination, startPlace: start, currentLocation: { latitude: 0, longitude: 0 } }).canStart).toBe(false);
    expect(useAppStore.getState()).toBe(before);
  });

  test('current authorized preview starts only with a fresh precise live fix', () => {
    const currentLocation = { ...preview.coordinates[0], accuracy: 8, observedAtMs: Date.now() };
    useAppStore.setState({ currentLocation, currentLocationSource: 'live', hasLocationPermission: true, locationPermissionPrecision: 'fine', activeRoute: preview, routePlannerDest: destination, routePlannerOrigin: null });
    expect(startPreview({ route: preview, destination, currentLocation }).canStart).toBe(true);
    expect((useAppStore.getState().activeRoute as V2ActiveRoute).origin.coordinate).toEqual(currentLocation);
  });

  test.each([
    { hasLocationPermission: false },
    { locationPermissionPrecision: 'none' as const },
    { currentLocationSource: 'remembered' as const },
    { currentLocation: { ...preview.coordinates[0], accuracy: 8, observedAtMs: Date.now() - 60000 } },
    { routePlannerDest: start },
    { activeRoute: { ...preview } },
    { routePlannerOrigin: start },
  ])('unsafe or replaced preview cannot mutate session: %p', override => {
    const currentLocation = { ...preview.coordinates[0], accuracy: 8, observedAtMs: Date.now() };
    useAppStore.setState({ currentLocation, currentLocationSource: 'live', hasLocationPermission: true, locationPermissionPrecision: 'fine', activeRoute: preview, routePlannerDest: destination, routePlannerOrigin: null, ...override });
    const before = useAppStore.getState();
    expect(startPreview({ route: preview, destination, currentLocation }).canStart).toBe(false);
    expect(useAppStore.getState()).toBe(before);
  });

  test('invalid preview preserves the existing session and reports its existing failure message', () => {
    const before = useAppStore.getState();
    const check = startPreview({ route: null, destination });
    expect(check.canStart).toBe(false);
    expect(check.message).toBe("We couldn't find a walking route.");
    expect(useAppStore.getState()).toBe(before);
  });

  test('outside preview retains its gate, composed geometry, distance and ETA', () => {
    const gate = IJTEMA_GATES.find(item => item.id === 'GATE_13')!;
    const outsidePreview: RoutePreviewV2 = { ...preview, coordinates: [{ latitude: 24.9762, longitude: 67.011 }, ...preview.coordinates], outsideLegCoordinateCount: 2,
      startResolution: { mode: 'outside', startType: 'selected_official_gate',
        coordinate: preview.coordinates[0], candidateNodes: [], gate } };
    const currentLocation = { ...outsidePreview.coordinates[0], accuracy: 8, observedAtMs: Date.now() };
    useAppStore.setState({ currentLocation, currentLocationSource: 'live', hasLocationPermission: true, locationPermissionPrecision: 'fine', activeRoute: outsidePreview, routePlannerDest: destination, routePlannerOrigin: null });
    expect(startPreview({ route: outsidePreview, destination, currentLocation }).canStart).toBe(true);
    const active = useAppStore.getState().activeRoute as V2ActiveRoute;
    expect(active.metadata).toMatchObject({ startedOutside: true, entryGateId: gate.id });
    expect(active.coordinates).toEqual(outsidePreview.coordinates);
    expect(active.totalDistanceM).toBe(outsidePreview.totalDistance);
    expect(active.etaMinutes).toBe(outsidePreview.estimatedTimeMin);
  });

  test('unverified Gate 18 remains blocked without mutating navigation state', () => {
    const before = useAppStore.getState();
    const check = startPreview({ route: preview, destination: V2PlaceAdapter.getPlaceById('GATE_18') });
    expect(check.canStart).toBe(false);
    expect(check.message).toBe("Directions to this gate aren't ready. Choose another gate.");
    expect(useAppStore.getState()).toBe(before);
  });

  test('Views cannot import navigation composition or routing services', () => {
    const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
      .flatMap(entry => entry.isDirectory() ? visit(join(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []);
    for (const file of visit(join(__dirname, '../views'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/(?:from\s*|require\s*\(\s*)['"][^'"]*services\/(?:V2NavigationAdapter|RoutingServiceV2|RoutingService)['"]/);
    }
  });
});
