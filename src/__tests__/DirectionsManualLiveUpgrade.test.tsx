import { act, renderHook, waitFor } from './test-utils';
import { useManualLivePreview } from '../viewmodels/manualLivePreview';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { LocationAccessService } from '../services/LocationAccessService';

const initial = { ...useAppStore.getState() };
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('B27')!;
beforeEach(() => useAppStore.setState(initial, true));
afterEach(() => jest.restoreAllMocks());

async function manualGuide() {
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(() => hook.result.current.setManualStartPlace(start));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  await act(() => hook.result.current.startRouteGuide());
  await act(() => useAppStore.getState().setRouteGuideStep(1));
  return hook;
}

it('manual guide requires switch confirmation before requesting location', async () => {
  const hook = await manualGuide();
  const acquire = jest.spyOn(LocationAccessService, 'resolveCurrentLocation');
  const route = useAppStore.getState().activeRoute;
  const guide = useAppStore.getState().routeGuide;
  await act(async () => hook.result.current.runStartAction(jest.fn()));
  expect(acquire).not.toHaveBeenCalled();
  expect(useAppStore.getState().activeRoute).toBe(route);
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(hook.result.current.manualStart).toBe(start);
  expect(useAppStore.getState().isNavigating).toBe(false);
});

it('an unsuccessful location acquisition retains the exact manual guide and origin', async () => {
  const hook = await manualGuide();
  const route = useAppStore.getState().activeRoute;
  const guide = useAppStore.getState().routeGuide;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue({ ok: false, coordinate: null, source: null,
    permissionState: { granted: false, canAskAgain: false, status: 'denied' as never, precision: 'none', servicesEnabled: false, servicesState: 'disabled' }, message: 'Location unavailable' });
  await act(async () => hook.result.current.runStartAction(jest.fn()));
  await act(async () => hook.result.current.confirmLiveUpgrade());
  expect(hook.result.current.upgrade.phase).toBe('failed');
  expect(useAppStore.getState().activeRoute).toBe(route);
  expect(useAppStore.getState().routePlannerOrigin).toBe(start);
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(useAppStore.getState().routeGuide?.stepIndex).toBe(1);
});


function locationResult() {
  return { ok: true, coordinate: { ...V2PlaceAdapter.getPlaceById('B9')!.coordinate, accuracy: 5, observedAtMs: Date.now() }, source: 'live' as const,
    permissionState: { granted: true, canAskAgain: true, status: 'granted' as never, precision: 'fine' as const, servicesEnabled: true, servicesState: 'enabled' as const }, message: null };
}

it.each(['cancel', 'revoked', 'moved', 'start'] as const)('private replacement preserves guide until %s', async action => {
  const hook = await manualGuide();
  const route = useAppStore.getState().activeRoute;
  const guide = useAppStore.getState().routeGuide;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  await act(async () => hook.result.current.runStartAction(jest.fn()));
  await act(async () => hook.result.current.confirmLiveUpgrade());
  expect(hook.result.current.upgrade.phase).toBe('preview');
  expect(useAppStore.getState().activeRoute).toBe(route);
  expect(useAppStore.getState().routePlannerOrigin).toBe(start);
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(hook.result.current.manualStart).toBe(start);
  expect(useAppStore.getState().isNavigating).toBe(false);
  if (action === 'cancel') await act(() => hook.result.current.cancelLiveUpgrade());
  else {
    if (action === 'revoked') await act(() => useAppStore.setState({ hasLocationPermission: false }));
    if (action === 'moved') await act(() => useAppStore.setState({ currentLocation: { ...start.coordinate, accuracy: 5, observedAtMs: Date.now() } }));
    await act(() => expect(hook.result.current.startUpgradedNavigation()).toBe(action === 'start'));
  }
  if (action === 'start') {
    expect(useAppStore.getState().isNavigating).toBe(true);
    expect(useAppStore.getState().routeGuide).toBeNull();
  } else {
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().activeRoute).toBe(route);
    expect(useAppStore.getState().routePlannerOrigin).toBe(start);
    expect(useAppStore.getState().routeGuide).toBe(guide);
  }
});

it.each(['cancel', 'chooser', 'unmount'] as const)('late acquisition after %s cannot replace guide', async action => {
  const hook = await manualGuide();
  const route = useAppStore.getState().activeRoute;
  const guide = useAppStore.getState().routeGuide;
  let release!: (value: ReturnType<typeof locationResult>) => void;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await act(async () => hook.result.current.runStartAction(jest.fn()));
  let pending!: Promise<void>;
  await act(() => { pending = hook.result.current.confirmLiveUpgrade(); });
  if (action === 'cancel') await act(() => hook.result.current.cancelLiveUpgrade());
  if (action === 'chooser') await act(() => useAppStore.getState().setDirectoryPurpose('start'));
  if (action === 'unmount') await hook.unmount();
  await act(async () => { release(locationResult()); await pending; });
  expect(useAppStore.getState().activeRoute).toBe(route);
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(useAppStore.getState().currentLocation).toBeNull();
});

it('failed replacement routing does not discard the committed guide', async () => {
  const hook = await manualGuide();
  const route = useAppStore.getState().activeRoute;
  const guide = useAppStore.getState().routeGuide;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  jest.spyOn(V2DirectionsService, 'calculatePreview').mockReturnValue({ status: 'unavailable', route: null, instructions: [], message: 'No route' });
  await act(async () => hook.result.current.runStartAction(jest.fn()));
  await act(async () => hook.result.current.confirmLiveUpgrade());
  expect(hook.result.current.upgrade.phase).toBe('failed');
  expect(useAppStore.getState().activeRoute).toBe(route);
  expect(useAppStore.getState().routeGuide).toBe(guide);
});


it.each(['unmount', 'chooser'] as const)('retained candidate Start cannot activate after %s before effects', async action => {
  const hook = await manualGuide();
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  await act(async () => hook.result.current.runStartAction(jest.fn()));
  await act(async () => hook.result.current.confirmLiveUpgrade());
  expect(hook.result.current.upgrade.phase).toBe('preview');
  const retainedStart = hook.result.current.startUpgradedNavigation;
  if (action === 'unmount') await hook.unmount();
  await act(() => {
    if (action === 'chooser') useAppStore.getState().setDirectoryPurpose('start');
    expect(retainedStart()).toBe(false);
  });
  expect(useAppStore.getState().isNavigating).toBe(false);
  expect(useAppStore.getState().routePlannerOrigin).toBe(start);
});

it('repeated upgrade taps cannot reset a ready candidate or activate twice', async () => {
  const hook = await manualGuide();
  const acquire = jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  await act(() => { hook.result.current.requestLiveUpgrade(); hook.result.current.requestLiveUpgrade(); });
  await act(async () => hook.result.current.confirmLiveUpgrade());
  const candidate = hook.result.current.upgrade;
  await act(() => hook.result.current.requestLiveUpgrade());
  expect(hook.result.current.upgrade).toBe(candidate);
  expect(acquire).toHaveBeenCalledTimes(1);
  await act(() => {
    expect(hook.result.current.startUpgradedNavigation()).toBe(true);
    expect(hook.result.current.startUpgradedNavigation()).toBe(false);
  });
});

it('confirmation cancellation does not request permission or alter guide', async () => {
  const hook = await manualGuide();
  const guide = useAppStore.getState().routeGuide;
  const acquire = jest.spyOn(LocationAccessService, 'resolveCurrentLocation');
  await act(() => hook.result.current.requestLiveUpgrade());
  await act(() => hook.result.current.cancelLiveUpgrade());
  await act(async () => hook.result.current.confirmLiveUpgrade());
  expect(acquire).not.toHaveBeenCalled();
  expect(useAppStore.getState().routeGuide).toBe(guide);
});

it('manual step advancement during upgrade remains after preview cancellation', async () => {
  const hook = await manualGuide();
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  await act(() => hook.result.current.requestLiveUpgrade());
  await act(async () => hook.result.current.confirmLiveUpgrade());
  await act(() => useAppStore.getState().setRouteGuideStep(2));
  const guide = useAppStore.getState().routeGuide;
  await act(() => hook.result.current.cancelLiveUpgrade());
  expect(useAppStore.getState().routeGuide).toBe(guide);
  expect(useAppStore.getState().routeGuide?.stepIndex).toBe(2);
});

it.each(['cancel', 'destination', 'gate', 'chooser', 'unmount'] as const)('late replacement calculation after %s cannot publish or activate', async action => {
  const hook = await manualGuide();
  const route = useAppStore.getState().activeRoute;
  const guide = useAppStore.getState().routeGuide;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue({ ...locationResult(), coordinate: { latitude: 24.9762, longitude: 67.011, accuracy: 5, observedAtMs: Date.now() } });
  let release!: (value: Awaited<ReturnType<typeof V2DirectionsService.calculateHybridPreview>>) => void;
  const calculate = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await act(() => hook.result.current.requestLiveUpgrade());
  let pending!: Promise<void>;
  await act(() => { pending = hook.result.current.confirmLiveUpgrade(); });
  await waitFor(() => expect(calculate).toHaveBeenCalled());
  expect(hook.result.current.upgrade.phase).toBe('routing');
  if (action === 'cancel') await act(() => hook.result.current.cancelLiveUpgrade());
  if (action === 'destination') await act(() => useAppStore.getState().setRoutePlannerDest(V2PlaceAdapter.getPlaceById('B2')!));
  if (action === 'gate') await act(() => hook.result.current.selectManualGate('GATE_12'));
  if (action === 'chooser') await act(() => useAppStore.getState().setDirectoryPurpose('start'));
  if (action === 'unmount') await hook.unmount();
  await act(async () => { release({ status: 'ready', route: route as never, instructions: [], message: null }); await pending; });
  if (action !== 'unmount') expect(hook.result.current.upgrade.phase).not.toBe('preview');
  expect(useAppStore.getState().isNavigating).toBe(false);
  if (action === 'cancel') {
    expect(useAppStore.getState().activeRoute).toBe(route);
    expect(useAppStore.getState().routeGuide).toBe(guide);
  }
});

it.each(['select', 'clear'] as const)('gate %s rejects retained candidate Start before effects', async action => {
  const hook = await manualGuide();
  if (action === 'clear') {
    await act(() => hook.result.current.selectManualGate('GATE_12'));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    await act(() => hook.result.current.startRouteGuide());
  }
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  await act(() => hook.result.current.requestLiveUpgrade());
  await act(async () => hook.result.current.confirmLiveUpgrade());
  expect(hook.result.current.upgrade.phase).toBe('preview');
  const retainedStart = hook.result.current.startUpgradedNavigation;
  await act(() => {
    if (action === 'select') hook.result.current.selectManualGate('GATE_12');
    else hook.result.current.clearManualGateSelection();
    expect(retainedStart()).toBe(false);
  });
  expect(useAppStore.getState().isNavigating).toBe(false);
});

it.each(['cancel', 'revoked', 'unmount', 'start'] as const)('map candidate is private and removed on %s', async action => {
  const hook = await manualGuide();
  const map = await renderHook(() => useManualLivePreview());
  const original = useAppStore.getState().activeRoute;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  await act(() => hook.result.current.requestLiveUpgrade());
  await act(async () => hook.result.current.confirmLiveUpgrade());
  expect(map.result.current?.committedRoute).toBe(original);
  expect(map.result.current?.route).not.toBe(original);
  expect(useAppStore.getState().activeRoute).toBe(original);
  if (action === 'cancel') await act(() => hook.result.current.cancelLiveUpgrade());
  if (action === 'unmount') await hook.unmount();
  if (action === 'revoked' || action === 'start') await act(() => {
    if (action === 'revoked') useAppStore.setState({ hasLocationPermission: false });
    expect(hook.result.current.startUpgradedNavigation()).toBe(action === 'start');
  });
  expect(map.result.current).toBeNull();
});

it('consecutive manual/live trips retire prior candidate commands', async () => {
  const first = await manualGuide();
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(async () => locationResult());
  await act(() => first.result.current.requestLiveUpgrade());
  await act(async () => first.result.current.confirmLiveUpgrade());
  const oldStart = first.result.current.startUpgradedNavigation;
  await act(() => expect(oldStart()).toBe(true));
  await first.unmount();
  await act(() => { useAppStore.getState().stopNavigation(); useAppStore.getState().clearRoutePlanner(); });
  const next = await manualGuide();
  const nextGuide = useAppStore.getState().routeGuide;
  await act(() => expect(oldStart()).toBe(false));
  expect(useAppStore.getState().routeGuide).toBe(nextGuide);
  await act(() => next.result.current.requestLiveUpgrade());
  await act(async () => next.result.current.confirmLiveUpgrade());
  await act(() => expect(next.result.current.startUpgradedNavigation()).toBe(true));
});

it('ready upgrade loses authority when chooser opens and cancels before effects', async () => {
  const hook = await manualGuide();
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  await act(() => hook.result.current.requestLiveUpgrade());
  await act(async () => hook.result.current.confirmLiveUpgrade());
  const startCandidate = hook.result.current.startUpgradedNavigation;
  const guide = useAppStore.getState().routeGuide;
  await act(() => {
    useAppStore.getState().setDirectoryPurpose('start');
    useAppStore.getState().setDirectoryPurpose(null);
    expect(startCandidate()).toBe(false);
  });
  expect(useAppStore.getState().routeGuide).toBe(guide);
});
