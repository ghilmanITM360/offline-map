import type { Place } from '../models/types';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { VoiceService } from '../services/VoiceService';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import type { NavigationSession } from '@muslim-ummah/offline-navigation/session';
import { seedRunningNavigation } from './navigationFixture';
import { act, renderHook, waitFor } from './test-utils';

// B4a-4: route-preview requests are owned by one SDK NavigationSession per mounted Directions. Every outside preview
// is a deferred promise the test settles; the outside provider's signal is the observable proof of ownership.

jest.setTimeout(15_000);

const mockCreatedSessions: NavigationSession[] = [];
jest.mock('@muslim-ummah/offline-navigation/session', () => {
  const actual = jest.requireActual('@muslim-ummah/offline-navigation/session');
  return {
    ...actual,
    createNavigationSession: (id: string) => {
      const session = actual.createNavigationSession(id);
      mockCreatedSessions.push(session);
      return session;
    },
  };
});

const initialStoreState = useAppStore.getState();
const outside = { latitude: 24.9762, longitude: 67.011 };
const fresh = (c: { latitude: number; longitude: number }) => ({ ...c, accuracy: 10, observedAtMs: Date.now() });
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const other = V2PlaceAdapter.getPlaceById('B28')!;
const outsideStart: Place = {
  id: 'outside-manual', name: 'Outside start', category: 'CustomPoint', description: 'Selected outside coordinate',
  coordinate: { latitude: 24.978, longitude: 67.013 }, sourceVersion: 'v1',
};

const previewRoute = (label: string, to: Place) => ({
  id: label, routeId: label, sourceVersion: 'v2', coordinates: [outside, to.coordinate], nodes: [], segments: [], edges: [],
  totalDistance: 500, totalDistanceM: 500, estimatedTimeMin: 6, etaMinutes: 6, instructions: [],
  origin: { coordinate: outside, label: 'start', type: 'outside_gps' },
  destination: { coordinate: to.coordinate, label: to.name, type: 'block', blockId: to.id },
  metadata: { startedOutside: true, usesOfficialGateEntry: true, graphVersion: 'synthetic' },
});

function stubPreviewDeferred() {
  const calls: Array<{ signal?: AbortSignal; finish: () => void }> = [];
  jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(({ request, signal }) => new Promise((resolve) => {
    const label = `P${calls.length + 1}`;
    calls.push({ signal, finish: () => resolve({ status: 'ready', route: previewRoute(label, request.destination) as never, instructions: [], message: null }) });
  }));
  return calls;
}

const previewSessions = () => mockCreatedSessions.filter((session) => session.id === 'directions-preview');

beforeEach(() => {
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({
    hasLocationPermission: true, locationPermissionPrecision: 'fine', locationServicesState: 'enabled',
    currentLocation: fresh(outside), currentLocationSource: 'live', lastKnownLocation: outside,
  });
  mockCreatedSessions.length = 0;
  jest.spyOn(VoiceService, 'speakInstruction').mockImplementation(() => undefined as never);
  jest.spyOn(VoiceService, 'stopSpeaking').mockImplementation(() => undefined as never);
});
afterEach(() => jest.restoreAllMocks());

describe('B4a-4 route previews commit only for the Directions request that is still current', () => {
  test('public session entrypoint shares the existing module and factory identity', () => {
    const publicSession = jest.requireActual('@muslim-ummah/offline-navigation/session');
    const sourceSession = jest.requireActual('../../packages/offline-navigation/src/domain/session');
    expect(publicSession).toBe(sourceSession);
    expect(publicSession.createNavigationSession).toBe(sourceSession.createNavigationSession);
  });

  test('a valid preview commits through one session that persists across renders', async () => {
    const calls = stubPreviewDeferred();
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(async () => { calls[0].finish(); });
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    expect((hook.result.current.route as { routeId?: string } | null)?.routeId).toBe('P1');
    expect((useAppStore.getState().activeRoute as { routeId?: string } | null)?.routeId).toBe('P1');
    await hook.rerender(undefined);
    expect(previewSessions()).toHaveLength(1);
    expect(previewSessions()[0].state).toBe('active');
  });

  test('rapid destination changes abort and reject every superseded preview', async () => {
    const calls = stubPreviewDeferred();
    const hook = await renderHook(({ to }) => useDirectionsViewModel(to), { initialProps: { to: destination } });
    await hook.rerender({ to: other });
    await hook.rerender({ to: destination });
    expect(calls).toHaveLength(3);
    expect(calls[0].signal?.aborted).toBe(true);
    expect(calls[1].signal?.aborted).toBe(true);
    await act(async () => { calls[0].finish(); calls[1].finish(); });
    expect(hook.result.current.route).toBeNull();
    expect(hook.result.current.loadState).toBe('loading');
    await act(async () => { calls[2].finish(); });
    await waitFor(() => expect((hook.result.current.route as { routeId?: string } | null)?.routeId).toBe('P3'));
  });

  test('an origin change aborts the pending preview and its late result never commits', async () => {
    const calls = stubPreviewDeferred();
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(() => hook.result.current.setManualStartPlace(outsideStart));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0].signal?.aborted).toBe(true);
    await act(async () => { calls[0].finish(); });
    expect(hook.result.current.route).toBeNull();
    await act(async () => { calls[calls.length - 1].finish(); });
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    expect(hook.result.current.manualStart?.id).toBe(outsideStart.id);
  });

  test('closing Directions disposes preview ownership; a late result is rejected and reopening works', async () => {
    const calls = stubPreviewDeferred();
    const first = await renderHook(() => useDirectionsViewModel(destination));
    await first.unmount();
    expect(calls[0].signal?.aborted).toBe(true);
    expect(previewSessions()[0].state).toBe('disposed');
    await act(async () => { calls[0].finish(); });
    expect(useAppStore.getState().activeRoute).toBeNull();

    const reopened = await renderHook(() => useDirectionsViewModel(destination));
    expect(previewSessions()).toHaveLength(2);
    await act(async () => { calls[1].finish(); });
    await waitFor(() => expect(reopened.result.current.loadState).toBe('ready'));
    expect((useAppStore.getState().activeRoute as { routeId?: string } | null)?.routeId).toBe('P2');
  });

  test('preview-to-live: a preview finishing after Start never replaces the journey, and closing Directions leaves the live session active', async () => {
    jest.spyOn(V2NavigationAdapter, 'fromPreview').mockImplementation(({ previewRoute: route }) => route as never);
    const calls = stubPreviewDeferred();
    const directions = await renderHook(() => useDirectionsViewModel(destination));
    const journeyRoute = previewRoute('LIVE', destination);
    await act(async () => { seedRunningNavigation(destination, journeyRoute as never); });
    const navigation = await renderHook(() => useNavigationViewModelV2());
    const journey = mockCreatedSessions.find((session) => session.id.startsWith('journey-'));
    expect(journey?.state).toBe('active');

    await act(async () => { calls[0].finish(); });
    expect(useAppStore.getState().activeRoute).toBe(journeyRoute);
    await directions.unmount();
    expect(journey?.state).toBe('active');
    expect(useAppStore.getState().isNavigating).toBe(true);
    await navigation.unmount();
  });

  test('preview-to-manual: an inside manual start previews synchronously under the same session', async () => {
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await act(() => hook.result.current.setManualStartPlace(other));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    expect(hook.result.current.route).not.toBeNull();
    expect(previewSessions()).toHaveLength(1);
  });
});
