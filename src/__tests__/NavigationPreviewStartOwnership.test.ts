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
  test('manual Gate 13 start enters navigation without GPS and ignores an unrelated live fix', () => {
    const check = startPreview({ route: preview, destination, startPlace: start,
      currentLocation: { latitude: 0, longitude: 0 } });
    const state = useAppStore.getState();
    expect(check.canStart).toBe(true);
    expect(state.isNavigating).toBe(true);
    expect(state.destination?.id).toBe(destination.id);
    expect((state.activeRoute as V2ActiveRoute).origin).toMatchObject({ type: 'official_gate', gateId: start.id });
    expect(state.navigationSessionId).toBe(initial.navigationSessionId + 1);
  });

  test('current-location start retains the supplied origin', () => {
    const currentLocation = { latitude: 24.964, longitude: 67.007 };
    expect(startPreview({ route: preview, destination, currentLocation }).canStart).toBe(true);
    expect((useAppStore.getState().activeRoute as V2ActiveRoute).origin.coordinate).toEqual(currentLocation);
  });

  test('invalid preview preserves the existing session and reports its existing failure message', () => {
    const before = useAppStore.getState();
    const check = startPreview({ route: null, destination });
    expect(check.canStart).toBe(false);
    expect(check.message).toContain('valid v2 route');
    expect(useAppStore.getState()).toBe(before);
  });

  test('outside preview retains its gate, composed geometry, distance and ETA', () => {
    const gate = IJTEMA_GATES.find(item => item.id === 'GATE_13')!;
    const outsidePreview: RoutePreviewV2 = { ...preview, outsideLegCoordinateCount: 1,
      startResolution: { mode: 'outside', startType: 'selected_official_gate',
        coordinate: preview.coordinates[0], candidateNodes: [], gate } };
    expect(startPreview({ route: outsidePreview, destination }).canStart).toBe(true);
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
    expect(check.message).toContain('connector verification');
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
