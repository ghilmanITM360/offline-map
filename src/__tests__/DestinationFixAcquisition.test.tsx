import { AppState } from 'react-native';
import { act, renderHook, waitFor } from './test-utils';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { LocationAccessService } from '../services/LocationAccessService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import * as NavigationViewModelV2 from '../viewmodels/NavigationViewModelV2';

// A1-08: a destination tap used to authorize an automatic live start only when a fresh fix was already in the store at
// that instant. A cold launch (no watcher yet) or a stationary phone (the fix aged past 30 s) therefore never started,
// and a Start pressed after the fix aged out failed with "Try location again". The tap now also authorizes ONE bounded,
// cancellable acquisition owned by that intent (permission already granted, services on, never prompting); only a fix
// that passes the unchanged live-eligibility rules can promote the intent. Real view model and store throughout.

jest.setTimeout(15_000);

const initial = { ...useAppStore.getState() };
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const other = V2PlaceAdapter.getPlaceById('B28')!;
const start = V2PlaceAdapter.getPlaceById('B9')!;
const fresh = (accuracy = 5) => ({ ...start.coordinate, accuracy, observedAtMs: Date.now() });
const grantedFacts = { granted: true, canAskAgain: true, status: 'granted' as never, precision: 'fine' as const, servicesEnabled: true, servicesState: 'enabled' as const };
type Resolved = Awaited<ReturnType<typeof LocationAccessService.resolveCurrentLocation>>;
const okFix = (coordinate = fresh()): Resolved => ({ ok: true, source: 'live', coordinate, permissionState: grantedFacts, message: null });

function authorize(patch: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    currentLocation: null, currentLocationSource: null, hasLocationPermission: true, locationPermissionState: 'granted',
    locationPermissionPrecision: 'fine', locationServicesState: 'enabled', ...patch,
  } as never);
}
beforeEach(() => { useAppStore.setState(initial, true); authorize(); });
afterEach(() => jest.restoreAllMocks());

const resolveSpy = (impl: () => Promise<Resolved>) => jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(impl);
// Every call stays pending; `release` settles the FIRST call only, so a later acquisition (another destination) is untouched.
const deferred = () => {
  const pending: Array<(r: Resolved) => void> = [];
  const control = { release: (r: Resolved) => pending[0]?.(r), releaseAt: (index: number, r: Resolved) => pending[index]?.(r), calls: () => pending.length };
  const spy = resolveSpy(() => new Promise<Resolved>((resolve) => { pending.push(resolve); }));
  return { spy, control };
};
const intent = () => useAppStore.getState().destinationJourneyIntent;

describe('A1-08 intent state machine (store level)', () => {
  const setIntent = () => { useAppStore.getState().setPendingJourney({ destination }); return intent()!.id; };

  it('pending_fix and acquiring carry no start authority: only eligible can be consumed', () => {
    const id = setIntent();
    expect(useAppStore.getState().consumeDestinationIntent(id)).toBe(false);
    expect(useAppStore.getState().beginDestinationIntentAcquisition(id)).toBe(true);
    expect(intent()?.autoLive).toBe('acquiring');
    expect(useAppStore.getState().consumeDestinationIntent(id)).toBe(false);
  });

  it('an acquisition begins once and only the acquiring intent can be promoted', () => {
    const id = setIntent();
    expect(useAppStore.getState().promoteDestinationIntent(id)).toBe(false);
    expect(useAppStore.getState().beginDestinationIntentAcquisition(id)).toBe(true);
    expect(useAppStore.getState().beginDestinationIntentAcquisition(id)).toBe(false);
    expect(useAppStore.getState().promoteDestinationIntent(id)).toBe(true);
    expect(intent()?.autoLive).toBe('eligible');
    expect(useAppStore.getState().consumeDestinationIntent(id)).toBe(true);
    expect(useAppStore.getState().promoteDestinationIntent(id)).toBe(false);
  });

  it('a retired or replaced intent can neither begin nor be promoted', () => {
    const id = setIntent();
    useAppStore.getState().retireDestinationIntent(id);
    expect(useAppStore.getState().beginDestinationIntentAcquisition(id)).toBe(false);
    const second = setIntent();
    expect(useAppStore.getState().beginDestinationIntentAcquisition(second)).toBe(true);
    const third = setIntent();
    expect(useAppStore.getState().promoteDestinationIntent(second)).toBe(false);
    expect(intent()?.id).toBe(third);
    expect(intent()?.autoLive).toBe('pending_fix');
  });

  it('opening the Directory chooser spends an acquiring intent', () => {
    const id = setIntent();
    useAppStore.getState().beginDestinationIntentAcquisition(id);
    useAppStore.getState().setDirectoryPurpose('start');
    expect(intent()?.autoLive).toBe('consumed');
    expect(useAppStore.getState().promoteDestinationIntent(id)).toBe(false);
  });
});

describe('A1-08 tap-time classification', () => {
  it('permission granted, precise, services on, no fresh fix: the intent may acquire one fix', () => {
    useAppStore.getState().setPendingJourney({ destination });
    expect(intent()?.autoLive).toBe('pending_fix');
  });

  it.each([
    ['no fix', { currentLocation: null }],
    ['a stale fix', { currentLocation: { ...fresh(), observedAtMs: 1 } }],
    ['a fix without a timestamp', { currentLocation: { ...fresh(), observedAtMs: undefined } }],
    ['an inaccurate fix', { currentLocation: { ...fresh(), accuracy: 51 } }],
    ['a remembered fix', { currentLocation: fresh(), currentLocationSource: 'remembered' }],
  ])('%s: may acquire', (_name, patch) => {
    authorize({ currentLocation: fresh(), currentLocationSource: 'live', ...patch } as never);
    useAppStore.getState().setPendingJourney({ destination });
    expect(intent()?.autoLive).toBe('pending_fix');
  });

  it.each([
    ['permission not granted', { hasLocationPermission: false }],
    ['approximate permission', { locationPermissionPrecision: 'coarse' }],
    ['unknown precision', { locationPermissionPrecision: 'none' }],
    ['services off', { locationServicesState: 'disabled' }],
    ['services unknown', { locationServicesState: 'unknown' }],
    ['already navigating', { isNavigating: true }],
  ])('%s: never acquires (and never prompts)', async (_name, patch) => {
    authorize(patch as never);
    const resolve = resolveSpy(async () => okFix());
    useAppStore.getState().setPendingJourney({ destination });
    expect(intent()?.autoLive).toBe('ineligible');
    await renderHook(() => useDirectionsViewModel(destination));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('a fresh usable fix at the tap stays eligible and starts without acquiring', async () => {
    authorize({ currentLocation: fresh(), currentLocationSource: 'live' });
    const resolve = resolveSpy(async () => okFix());
    useAppStore.getState().setPendingJourney({ destination });
    expect(intent()?.autoLive).toBe('eligible');
    await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('A1-08 cold launch: one bounded acquisition owned by the intent', () => {
  it('a fresh usable fix starts guarded automatic navigation once, without prompting', async () => {
    const resolve = resolveSpy(async () => okFix());
    const activate = jest.spyOn(useAppStore.getState(), 'startNavigation');
    useAppStore.getState().setPendingJourney({ destination });

    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(false);
    expect(intent()?.autoLive).toBe('consumed');
    await hook.rerender({});
    expect(activate).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a stale fix', okFix({ ...fresh(), observedAtMs: Date.now() - 31_000 })],
    ['an inaccurate fix', okFix(fresh(51))],
    ['a remembered fix', { ...okFix(), source: 'device_last_known' as const }],
    ['approximate permission', { ...okFix(), permissionState: { ...grantedFacts, precision: 'coarse' as const } }],
    ['services off', { ...okFix(), permissionState: { ...grantedFacts, servicesEnabled: false, servicesState: 'disabled' as const } }],
    ['services unknown', { ...okFix(), permissionState: { ...grantedFacts, servicesEnabled: false, servicesState: 'unknown' as const } }],
    ['permission revoked meanwhile', { ok: false, source: null, coordinate: null, message: 'off', permissionState: { ...grantedFacts, granted: false, status: 'denied' as never, precision: 'none' as const } } as Resolved],
    ['no fix before the timeout', { ok: false, source: null, coordinate: null, message: 'timeout', permissionState: grantedFacts } as Resolved],
  ])('%s never authorizes a start, retires the intent and keeps the manual-start fallback', async (_name, result) => {
    const resolve = resolveSpy(async () => result);
    useAppStore.getState().setPendingJourney({ destination });

    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(intent()?.autoLive).toBe('consumed'));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().currentLocation).toBeNull();
    await waitFor(() => expect(hook.result.current.loadState).toBe('needs_origin'));
    expect(hook.result.current.startSource).toBe('manual_place');
    expect(hook.result.current.locationAcquiring).toBe(false);
  });

  it('a thrown acquisition retires the intent without starting', async () => {
    resolveSpy(async () => { throw new Error('native failure'); });
    useAppStore.getState().setPendingJourney({ destination });

    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(intent()?.autoLive).toBe('consumed'));

    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(hook.result.current.locationAcquiring).toBe(false);
  });

  it('acquires at most once per intent: reruns and remounts do not start another acquisition', async () => {
    const resolve = resolveSpy(async () => ({ ok: false, source: null, coordinate: null, message: 'x', permissionState: grantedFacts }) as Resolved);
    useAppStore.getState().setPendingJourney({ destination });

    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(intent()?.autoLive).toBe('consumed'));
    await hook.rerender({});
    await act(async () => hook.result.current.calculateRoute());
    await hook.unmount();
    await renderHook(() => useDirectionsViewModel(destination));

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('a pending acquisition is not restarted by reruns, recalculation or a remount', async () => {
    const { spy, control } = deferred();
    useAppStore.getState().setPendingJourney({ destination });

    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.locationAcquiring).toBe(true));
    await hook.rerender({});
    await act(async () => hook.result.current.calculateRoute());
    await hook.rerender({});

    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => control.release(okFix()));
    await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a native throw is not a reading: it never demotes the stored permission facts', async () => {
    resolveSpy(async () => ({ ok: false, source: null, coordinate: null, message: 'try again',
      permissionState: { granted: false, canAskAgain: true, status: 'denied' as never, precision: 'none' as const, servicesEnabled: false, servicesState: 'unknown' as const } }) as Resolved);
    useAppStore.getState().setPendingJourney({ destination });

    await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(intent()?.autoLive).toBe('consumed'));

    expect(useAppStore.getState().hasLocationPermission).toBe(true);
    expect(useAppStore.getState().locationPermissionPrecision).toBe('fine');
    expect(useAppStore.getState().locationServicesState).toBe('enabled');
  });

  it('shows the acquisition as in progress, not as a failure', async () => {
    const { control } = deferred();
    useAppStore.getState().setPendingJourney({ destination });

    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.locationAcquiring).toBe(true));
    expect(hook.result.current.startAttempt).toBe('idle');

    await act(async () => control.release(okFix()));
    await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
    expect(hook.result.current.locationAcquiring).toBe(false);
  });
});

describe('A1-08 the live-start guards still hold at the moment of the start', () => {
  const outside = () => ({ latitude: 24.9762, longitude: 67.011, accuracy: 8, observedAtMs: Date.now() });
  async function acquireThenHoldRouteComputation() {
    resolveSpy(async () => okFix(outside()));
    const original = V2DirectionsService.calculateHybridPreview.bind(V2DirectionsService);
    let release!: (result: Awaited<ReturnType<typeof original>>) => void;
    let input!: Parameters<typeof original>[0];
    jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation((request) => {
      input = request; return new Promise((resolve) => { release = resolve; });
    });
    useAppStore.getState().setPendingJourney({ destination });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(input).toBeDefined());
    const result = await original(input);
    return { hook, finish: () => act(async () => release(result)) };
  }

  it('a fix that aged past 30 s while the route was computed is refused: the intent is spent and nothing starts', async () => {
    const { hook, finish } = await acquireThenHoldRouteComputation();
    const real = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(real + 31_000);

    await finish();
    await waitFor(() => expect(hook.result.current.startAttempt).toBe('failed'));

    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(intent()?.autoLive).toBe('consumed');
  });

  it('control: with the fix still fresh and services enabled the same flow does start', async () => {
    const startSpy = jest.spyOn(NavigationViewModelV2, 'startPreviewNavigationV2');
    const { finish } = await acquireThenHoldRouteComputation();

    await finish();
    await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('services reading unknown instead of enabled at the start refuses it before the engine is even asked', async () => {
    const startSpy = jest.spyOn(NavigationViewModelV2, 'startPreviewNavigationV2');
    const { hook, finish } = await acquireThenHoldRouteComputation();
    await act(async () => useAppStore.setState({ locationServicesState: 'unknown' }));

    await finish();
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));

    expect(startSpy).not.toHaveBeenCalled();
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(intent()?.autoLive).toBe('consumed');
  });
});

describe('A1-08 a withdrawn or replaced intent cannot be revived by a late fix', () => {
  type Hook = Awaited<ReturnType<typeof renderHook<ReturnType<typeof useDirectionsViewModel>, { place: typeof destination }>>>;
  const cancellations: Array<[string, (hook: Hook) => Promise<void>]> = [
    ['the Directory chooser opens', async () => { await act(async () => useAppStore.getState().setDirectoryPurpose('start')); }],
    ['the user chooses a manual start', async (hook) => { await act(async () => hook.result.current.chooseManualStart()); }],
    ['the user cancels the acquisition', async (hook) => { await act(async () => hook.result.current.cancelLocationRecovery()); }],
    ['another destination is selected', async (hook) => {
      await act(async () => useAppStore.getState().setPendingJourney({ destination: other }));
      await hook.rerender({ place: other });
    }],
    ['the screen unmounts', async (hook) => { await hook.unmount(); }],
    ['the app goes to the background', async () => { await act(async () => { backgroundListeners.forEach((listener) => listener('background')); }); }],
  ];
  let backgroundListeners: Array<(state: string) => void> = [];
  beforeEach(() => {
    backgroundListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: string) => void) => {
      backgroundListeners.push(listener);
      return { remove: () => { backgroundListeners = backgroundListeners.filter((item) => item !== listener); } };
    }) as never);
  });

  it.each(cancellations)('%s while acquiring: the late fix neither starts navigation nor lands in the store', async (_name, cancel) => {
    const { control } = deferred();
    useAppStore.getState().setPendingJourney({ destination });
    const hook = await renderHook((p: { place: typeof destination }) => useDirectionsViewModel(p.place), { initialProps: { place: destination } });
    await waitFor(() => expect(hook.result.current.locationAcquiring).toBe(true));
    const firstIntent = intent()!.id;

    await cancel(hook);
    await act(async () => control.release(okFix()));
    await act(async () => { await Promise.resolve(); });

    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().currentLocation).toBeNull();
    const first = useAppStore.getState().destinationJourneyIntent;
    if (first && first.id === firstIntent) expect(first.autoLive).toBe('consumed');
  });

  it('the AppState listener exists only while acquiring and is released on every outcome', async () => {
    const { control } = deferred();
    useAppStore.getState().setPendingJourney({ destination });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.locationAcquiring).toBe(true));
    expect(backgroundListeners).toHaveLength(1);

    await act(async () => control.release(okFix()));
    await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));

    expect(backgroundListeners).toHaveLength(0);
  });

  it('a superseded acquisition\'s listener cannot cancel the newer explicit request', async () => {
    const { control } = deferred();
    useAppStore.getState().setPendingJourney({ destination });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.locationAcquiring).toBe(true));
    await act(async () => hook.result.current.cancelLocationRecovery());
    // The user now asks for their location explicitly while the first native call is still outstanding.
    let explicit!: Promise<boolean>;
    await act(async () => { explicit = hook.result.current.chooseCurrentLocation(); });
    await waitFor(() => expect(control.calls()).toBe(2));

    await act(async () => { backgroundListeners.forEach((listener) => listener('background')); });
    await act(async () => control.releaseAt(1, okFix()));
    await act(async () => { await explicit; });

    expect(useAppStore.getState().currentLocation).not.toBeNull();
    expect(hook.result.current.startSource).toBe('live_gps');
  });
});

describe('A1-08 stationary phone: Start after the fix aged out recovers instead of failing', () => {
  async function readyWithFreshFix() {
    authorize({ currentLocation: fresh(), currentLocationSource: 'live' });
    const hook = await renderHook(() => useDirectionsViewModel(destination));
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    await waitFor(() => expect(hook.result.current.startAction?.kind).toBe('start'));
    return hook;
  }
  // The fix ages past 30 s while the sheet stays up: nothing re-renders, so the primary action still reads "Start".
  const ageFix = () => { const real = Date.now(); jest.spyOn(Date, 'now').mockReturnValue(real + 31_000); };

  it('acquires a fresh fix, refreshes the origin, and does not report a failure', async () => {
    const hook = await readyWithFreshFix();
    const startNow = jest.fn();
    const stale = hook.result.current;
    ageFix();
    const resolve = resolveSpy(async () => okFix({ ...start.coordinate, accuracy: 5, observedAtMs: Date.now() }));

    await act(async () => stale.runStartAction(startNow));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(hook.result.current.startAttempt).not.toBe('failed');
    expect(useAppStore.getState().currentLocation?.observedAtMs).toBe(Date.now());
    expect(useAppStore.getState().isNavigating).toBe(false);
  });

  it('never silently starts: the explicit second Start is the one that activates', async () => {
    const hook = await readyWithFreshFix();
    const startNow = jest.fn();
    ageFix();
    resolveSpy(async () => okFix({ ...start.coordinate, accuracy: 5, observedAtMs: Date.now() }));
    await act(async () => hook.result.current.runStartAction(startNow));
    expect(startNow).not.toHaveBeenCalled();

    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    await waitFor(() => expect(hook.result.current.startAction?.kind).toBe('start'));
    await waitFor(() => expect(hook.result.current.routeRefreshing).toBe(false));
    await act(async () => hook.result.current.runStartAction(startNow));

    expect(startNow).toHaveBeenCalledTimes(1);
  });

  it('a recovered fix far from the old origin recomputes the route and still needs an explicit Start', async () => {
    const hook = await readyWithFreshFix();
    const startNow = jest.fn();
    const before = hook.result.current.route;
    ageFix();
    const moved = V2PlaceAdapter.getPlaceById('B28')!.coordinate;
    resolveSpy(async () => okFix({ ...moved, accuracy: 5, observedAtMs: Date.now() }));

    await act(async () => hook.result.current.runStartAction(startNow));
    await waitFor(() => expect(hook.result.current.route).not.toBe(before));

    expect(startNow).not.toHaveBeenCalled();
    expect(useAppStore.getState().isNavigating).toBe(false);
  });

  it('recovery that cannot obtain a usable fix reports the usual recovery state and never starts', async () => {
    const hook = await readyWithFreshFix();
    const startNow = jest.fn();
    ageFix();
    // Permission was revoked and cannot be asked again: the user must change it in system settings.
    resolveSpy(async () => ({ ok: false, source: null, coordinate: null, message: 'off', permissionState: { ...grantedFacts, granted: false, canAskAgain: false, status: 'denied' as never, precision: 'none' as const } }) as Resolved);

    await act(async () => hook.result.current.runStartAction(startNow));

    expect(startNow).not.toHaveBeenCalled();
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(hook.result.current.startAttempt).toBe('settings');
  });
});
