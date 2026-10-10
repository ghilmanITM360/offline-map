import { V2DirectionsService } from '../services/V2DirectionsService';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { LocationAccessService, type LocationResolveResult } from '../services/LocationAccessService';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { useAppStore } from '../store/useAppStore';
import { act, renderHook, waitFor } from './test-utils';

const initial = useAppStore.getState();
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('B27')!;
const other = V2PlaceAdapter.getPlaceById('B28')!;
const locationResult = (): LocationResolveResult => ({ ok: true, source: 'live', coordinate: { ...start.coordinate, accuracy: 8, observedAtMs: Date.now() }, permissionState: { granted: true, canAskAgain: true, status: 'granted' as never, precision: 'fine', servicesEnabled: true, servicesState: 'enabled' }, message: null });
beforeEach(() => useAppStore.setState(initial, true));
afterEach(() => jest.restoreAllMocks());

it.each(['destination', 'manual', 'unmount'] as const)('late location response cannot change %s journey', async change => {
  let finish!: (value: LocationResolveResult) => void;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = await renderHook(({ to }) => useDirectionsViewModel(to), { initialProps: { to: destination } });
  let pending!: Promise<boolean>;
  await act(() => { pending = hook.result.current.chooseCurrentLocation(); });
  if (change === 'destination') await hook.rerender({ to: other });
  if (change === 'manual') await act(() => hook.result.current.setManualStartPlace(start));
  if (change === 'unmount') await hook.unmount();
  await act(async () => { finish(locationResult()); await pending; });
  expect(useAppStore.getState().currentLocation).toBeNull();
  expect(useAppStore.getState().isNavigating).toBe(false);
  if (change === 'manual') expect(hook.result.current.manualStart?.id).toBe(start.id);
});

it('new destination cannot silently inherit manual origin', async () => {
  const hook = await renderHook(({ to }) => useDirectionsViewModel(to), { initialProps: { to: destination } });
  await act(() => hook.result.current.setManualStartPlace(start));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  await hook.rerender({ to: other });
  await waitFor(() => expect(hook.result.current.loadState).toBe('needs_origin'));
  expect(hook.result.current.manualStart).toBeNull();
});

it('permission revoked after preview prevents direct Start callback', async () => {
  const fix = locationResult().coordinate;
  useAppStore.setState({ currentLocation: fix, currentLocationSource: 'live', hasLocationPermission: true, locationPermissionPrecision: 'fine' });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  const startNow = jest.fn();
  await act(() => useAppStore.setState({ hasLocationPermission: false }));
  await act(async () => hook.result.current.runStartAction(startNow));
  expect(startNow).not.toHaveBeenCalled();
});

it('newer location request wins without accepting older result', async () => {
  const complete: Array<(result: LocationResolveResult) => void> = [];
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => complete.push(resolve)));
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  let first!: Promise<boolean>; let second!: Promise<boolean>;
  await act(() => { first = hook.result.current.chooseCurrentLocation(); second = hook.result.current.chooseCurrentLocation(); });
  const newer = locationResult();
  await act(async () => { complete[1](newer); await second; });
  await act(async () => { complete[0]({ ...locationResult(), coordinate: { ...other.coordinate, accuracy: 8, observedAtMs: Date.now() } }); await first; });
  expect(useAppStore.getState().currentLocation).toEqual(newer.coordinate);
});

it('acquisition previews new live route without invoking deferred Start', async () => {
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(() => hook.result.current.setManualStartPlace(start));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue(locationResult());
  const startNow = jest.fn();
  await act(async () => hook.result.current.runStartAction(startNow));
  await waitFor(() => expect(hook.result.current.startSource).toBe('live_gps'));
  expect(startNow).not.toHaveBeenCalled();
  expect(useAppStore.getState().isNavigating).toBe(false);
});

// Duplicate selections must not cancel the only calculation for this origin.
it.each(['clear', 'gate', 'manual', 'manual_picker'] as const)('duplicate %s selection preserves in-flight outside calculation', async choice => {
  useAppStore.setState({ currentLocation: { latitude: 24.9762, longitude: 67.011, accuracy: 8, observedAtMs: Date.now() }, currentLocationSource: 'live', hasLocationPermission: true, locationPermissionPrecision: 'fine' });
  const calculate = V2DirectionsService.calculateHybridPreview.bind(V2DirectionsService);
  type Result = Awaited<ReturnType<typeof calculate>>;
  let release!: (result: Result) => void;
  let requested!: Parameters<typeof calculate>[0];
  const spy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(input => { requested = input; return new Promise(resolve => { release = resolve; }); });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(spy).toHaveBeenCalled());
  const outsideStart = { ...start, id: 'outside-manual', coordinate: { latitude: 24.9762, longitude: 67.011 } };
  if (choice === 'gate') await act(() => hook.result.current.selectManualGate('GATE_12'));
  if (choice === 'manual' || choice === 'manual_picker') await act(() => hook.result.current.setManualStartPlace(outsideStart));
  if (choice === 'manual_picker') await act(() => hook.result.current.chooseManualStart());
  await act(() => {
    if (choice === 'clear') hook.result.current.clearManualGateSelection();
    if (choice === 'gate') hook.result.current.selectManualGate('GATE_12');
    if (choice === 'manual' || choice === 'manual_picker') hook.result.current.setManualStartPlace(outsideStart);
  });
  const result = await calculate(requested);
  await act(async () => { release(result); });
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  expect(hook.result.current.routeRefreshing).toBe(false);
  expect(hook.result.current.isEditingManualStart).toBe(false);
});

it('opening a chooser immediately rejects a pending location response', async () => {
  let finish!: (value: LocationResolveResult) => void;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  let pending!: Promise<boolean>;
  await act(() => { pending = hook.result.current.chooseCurrentLocation(); });
  await act(() => useAppStore.getState().setDirectoryPurpose('start'));
  await act(async () => { finish(locationResult()); expect(await pending).toBe(false); });
  expect(useAppStore.getState().currentLocation).toBeNull();
});

it.each([
  [false, 'none', true, 'unknown', 'use_location'],
  [false, 'none', false, 'enabled', 'app_settings'],
  [true, 'coarse', true, 'enabled', 'precise_location'],
  [true, 'fine', true, 'disabled', 'location_settings'],
  [true, 'none', true, 'enabled', 'use_location'],
] as const)('contextual recovery for permission=%s precision=%s services=%s', async (granted, precision, canAskAgain, servicesState, expected) => {
  useAppStore.setState({ hasLocationPermission: granted, locationPermissionPrecision: precision, locationPermissionCanAskAgain: canAskAgain, locationServicesState: servicesState });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  expect(hook.result.current.locationRecoveryAction.kind).toBe(expected);
  const app = jest.spyOn(LocationAccessService, 'openAppSettings').mockResolvedValue(true);
  const services = jest.spyOn(LocationAccessService, 'openLocationSettings').mockResolvedValue(true);
  expect(app).not.toHaveBeenCalled();
  expect(services).not.toHaveBeenCalled();
  if (expected === 'app_settings' || expected === 'precise_location' || expected === 'location_settings') {
    await act(async () => hook.result.current.runLocationRecovery());
    expect(expected === 'location_settings' ? services : app).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().routePlannerDest?.id).toBe(destination.id);
    expect(useAppStore.getState().isNavigating).toBe(false);
  }
});

it('late location after chooser opens and cancels in one turn cannot alter journey', async () => {
  let finish!: (value: LocationResolveResult) => void;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  let pending!: Promise<boolean>;
  await act(() => { pending = hook.result.current.chooseCurrentLocation(); });
  await act(() => { useAppStore.getState().setDirectoryPurpose('start'); useAppStore.getState().setDirectoryPurpose(null); });
  await act(async () => { finish(locationResult()); expect(await pending).toBe(false); });
  expect(useAppStore.getState().currentLocation).toBeNull();
});

it('chooser cancellation retires Start acquisition busy state', async () => {
  useAppStore.setState({ currentLocation: locationResult().coordinate, currentLocationSource: 'live', hasLocationPermission: true, locationPermissionPrecision: 'fine', locationServicesState: 'enabled' });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  await act(() => useAppStore.setState({ hasLocationPermission: false }));
  let finish!: (value: LocationResolveResult) => void;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(() => { pending = hook.result.current.runStartAction(jest.fn()); });
  expect(hook.result.current.startAttempt).toBe('working');
  await act(() => { useAppStore.getState().setDirectoryPurpose('start'); useAppStore.getState().setDirectoryPurpose(null); });
  await act(async () => { finish(locationResult()); await pending; });
  expect(hook.result.current.startAttempt).toBe('idle');
});
