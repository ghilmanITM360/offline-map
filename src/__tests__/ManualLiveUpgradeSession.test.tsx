import { LocationAccessService } from '../services/LocationAccessService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import type { NavigationSession } from '../../packages/offline-navigation/src/domain/session';
import { act, renderHook, waitFor } from './test-utils';

// B4a-5: manual-to-live upgrade requests are owned by one SDK NavigationSession per mounted upgrade hook. The outside
// provider's signal is the observable proof: cancel, a destination change or unmount must abort it through the session.

jest.setTimeout(15_000);

const mockCreatedSessions: NavigationSession[] = [];
jest.mock('../../packages/offline-navigation/src/domain/session', () => {
  const actual = jest.requireActual('../../packages/offline-navigation/src/domain/session');
  return {
    ...actual,
    createNavigationSession: (id: string) => {
      const session = actual.createNavigationSession(id);
      mockCreatedSessions.push(session);
      return session;
    },
  };
});

const initial = { ...useAppStore.getState() };
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('B27')!;
const outside = { latitude: 24.9762, longitude: 67.011 };
const sessionsNamed = (id: string) => mockCreatedSessions.filter((session) => session.id === id);

function liveFix(coordinate: { latitude: number; longitude: number }, observedAtMs = Date.now()) {
  return { ok: true, coordinate: { ...coordinate, accuracy: 5, observedAtMs }, source: 'live' as const,
    permissionState: { granted: true, canAskAgain: true, status: 'granted' as never, precision: 'fine' as const, servicesEnabled: true, servicesState: 'enabled' as const }, message: null };
}

async function manualGuide() {
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(() => hook.result.current.setManualStartPlace(start));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  await act(() => hook.result.current.startRouteGuide());
  return hook;
}

// Confirms an upgrade from an outside fix and leaves the replacement calculation pending.
async function pendingOutsideUpgrade(hook: Awaited<ReturnType<typeof manualGuide>>) {
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(liveFix(outside));
  const calls: Array<{ signal?: AbortSignal; release: () => void }> = [];
  const route = useAppStore.getState().activeRoute;
  jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(({ signal }) => new Promise((resolve) => {
    calls.push({ signal, release: () => resolve({ status: 'ready', route: route as never, instructions: [], message: null }) });
  }));
  await act(() => hook.result.current.requestLiveUpgrade());
  let pending!: Promise<void>;
  await act(() => { pending = hook.result.current.confirmLiveUpgrade(); });
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(hook.result.current.upgrade.phase).toBe('routing');
  return { calls, pending };
}

beforeEach(() => {
  useAppStore.setState(initial, true);
  mockCreatedSessions.length = 0;
});
afterEach(() => jest.restoreAllMocks());

describe('B4a-5 manual-to-live upgrade commits only for the request that is still current', () => {
  test('a valid upgrade activates once through one persistent session, independent of the preview session', async () => {
    const hook = await manualGuide();
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(liveFix(V2PlaceAdapter.getPlaceById('B9')!.coordinate));
    await act(() => hook.result.current.requestLiveUpgrade());
    await act(async () => hook.result.current.confirmLiveUpgrade());
    expect(hook.result.current.upgrade.phase).toBe('preview');
    expect(useAppStore.getState().routeGuide).not.toBeNull();
    await act(() => {
      expect(hook.result.current.startUpgradedNavigation()).toBe(true);
      expect(hook.result.current.startUpgradedNavigation()).toBe(false);
    });
    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(sessionsNamed('manual-live-upgrade')).toHaveLength(1);
    expect(sessionsNamed('manual-live-upgrade')[0].state).toBe('active');
    expect(sessionsNamed('directions-preview')).toHaveLength(1);
    expect(sessionsNamed('directions-preview')[0].state).toBe('active');
  });

  test('an expired GPS fix cannot reach routing and keeps the manual guide', async () => {
    const hook = await manualGuide();
    const guide = useAppStore.getState().routeGuide;
    const calculate = jest.spyOn(V2DirectionsService, 'calculatePreview');
    jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(liveFix(outside, Date.now() - 10 * 60_000));
    await act(() => hook.result.current.requestLiveUpgrade());
    await act(async () => hook.result.current.confirmLiveUpgrade());
    expect(hook.result.current.upgrade.phase).toBe('failed');
    expect(calculate).not.toHaveBeenCalled();
    expect(useAppStore.getState().routeGuide).toBe(guide);
    expect(useAppStore.getState().isNavigating).toBe(false);
  });

  test.each(['cancel', 'gate', 'unmount'] as const)('%s during route calculation aborts the provider via the session', async (action) => {
    const hook = await manualGuide();
    const guide = useAppStore.getState().routeGuide;
    const { calls, pending } = await pendingOutsideUpgrade(hook);
    if (action === 'cancel') await act(() => hook.result.current.cancelLiveUpgrade());
    if (action === 'gate') await act(() => hook.result.current.selectManualGate('GATE_12'));
    if (action === 'unmount') await hook.unmount();
    expect(calls[0].signal?.aborted).toBe(true);
    if (action === 'unmount') expect(sessionsNamed('manual-live-upgrade')[0].state).toBe('disposed');
    await act(async () => { calls[0].release(); await pending; });
    if (action !== 'unmount') expect(hook.result.current.upgrade.phase).not.toBe('preview');
    expect(useAppStore.getState().isNavigating).toBe(false);
    if (action === 'cancel') expect(useAppStore.getState().routeGuide).toBe(guide);
  });

  test('a destination changed outside Directions aborts the lookup and rejects the late replacement', async () => {
    const hook = await manualGuide();
    const guide = useAppStore.getState().routeGuide;
    const { calls, pending } = await pendingOutsideUpgrade(hook);
    await act(() => useAppStore.getState().setRoutePlannerDest(V2PlaceAdapter.getPlaceById('B2')!));
    expect(calls[0].signal?.aborted).toBe(true);
    await act(async () => { calls[0].release(); await pending; });
    expect(hook.result.current.upgrade.phase).toBe('idle');
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().routeGuide).toBe(guide);
    expect(sessionsNamed('directions-preview')[0].state).toBe('active');
    expect(sessionsNamed('manual-live-upgrade')[0].state).toBe('active');
  });

  test('cancelling an upgrade never aborts the Directions preview session', async () => {
    const hook = await manualGuide();
    const { calls, pending } = await pendingOutsideUpgrade(hook);
    await act(() => hook.result.current.cancelLiveUpgrade());
    await act(async () => { calls[0].release(); await pending; });
    expect(sessionsNamed('directions-preview')[0].state).toBe('active');
    expect(sessionsNamed('manual-live-upgrade')[0].state).toBe('active');
  });
});
