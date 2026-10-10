import { act, renderHook, waitFor } from './test-utils';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { LocationAccessService } from '../services/LocationAccessService';

const initial = { ...useAppStore.getState() };
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const start = V2PlaceAdapter.getPlaceById('B9')!;
const other = V2PlaceAdapter.getPlaceById('B28')!;
const fresh = () => ({ ...start.coordinate, accuracy: 5, observedAtMs: Date.now() });
function authorize() {
  useAppStore.setState({ currentLocation: fresh(), currentLocationSource: 'live', hasLocationPermission: true,
    locationPermissionState: 'granted', locationPermissionPrecision: 'fine', locationServicesState: 'enabled' });
}
beforeEach(() => { useAppStore.setState(initial, true); authorize(); });
afterEach(() => jest.restoreAllMocks());

it.each([
  { hasLocationPermission: false }, { locationPermissionPrecision: 'coarse' }, { locationPermissionPrecision: 'none' },
  { locationServicesState: 'disabled' }, { locationServicesState: 'unknown' }, { currentLocationSource: 'remembered' },
  { currentLocation: null }, { currentLocation: { ...fresh(), accuracy: undefined } },
  { currentLocation: { ...fresh(), accuracy: -1 } }, { currentLocation: { ...fresh(), accuracy: 51 } },
  { currentLocation: { ...fresh(), observedAtMs: 1 } }, { currentLocation: { ...fresh(), observedAtMs: undefined } },
  { currentLocation: { ...fresh(), observedAtMs: Number.POSITIVE_INFINITY } },
])('selection records ineligible authority for %j', patch => {
  useAppStore.setState(patch as Partial<ReturnType<typeof useAppStore.getState>>);
  useAppStore.getState().setPendingJourney({ destination });
  expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('ineligible');
});

it('handoff consumption preserves unique runtime intent; cancellation retires it', () => {
  useAppStore.getState().setPendingJourney({ destination });
  const first = useAppStore.getState().destinationJourneyIntent!;
  expect(first.autoLive).toBe('eligible');
  useAppStore.getState().setPendingJourney(null);
  expect(useAppStore.getState().destinationJourneyIntent).toBe(first);
  useAppStore.getState().setPendingJourney({ destination });
  expect(useAppStore.getState().destinationJourneyIntent!.id).toBeGreaterThan(first.id);
  useAppStore.getState().clearRoutePlanner();
  expect(useAppStore.getState().destinationJourneyIntent).toBeNull();
});

it.each(['B1', 'GATE_08', 'R4', 'SHAHR_E_PINDAL_NORTH'])('fresh destination intent starts supported %s once without requesting permission', async id => {
  const place = V2PlaceAdapter.getPlaceById(id);
  expect(place).not.toBeNull();
  const acquire = jest.spyOn(LocationAccessService, 'resolveCurrentLocation');
  const activate = jest.spyOn(useAppStore.getState(), 'startNavigation');
  useAppStore.getState().setPendingJourney({ destination: place! });
  const hook = await renderHook(() => useDirectionsViewModel(place!));
  await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
  expect(useAppStore.getState().activeRoute).toMatchObject({ sourceVersion: 'v2' });
  expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
  await hook.rerender({});
  expect(activate).toHaveBeenCalledTimes(1);
  expect(acquire).not.toHaveBeenCalled();
});

it('mounting a route without a destination-selection intent never auto-starts', async () => {
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  expect(useAppStore.getState().isNavigating).toBe(false);
});

it('later fresh GPS cannot promote an initially ineligible selection', async () => {
  useAppStore.setState({ currentLocation: null });
  useAppStore.getState().setPendingJourney({ destination });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(() => authorize());
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue({ ok: true, source: 'live', coordinate: fresh(), permissionState: { granted: true, canAskAgain: true, status: 'granted' as never, precision: 'fine', servicesEnabled: true, servicesState: 'enabled' }, message: null });
  await act(async () => hook.result.current.chooseCurrentLocation());
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  expect(useAppStore.getState().isNavigating).toBe(false);
});

it.each(['none', 'manual', 'cancel', 'unmount', 'revoked', 'services', 'stale', 'replacement'] as const)('late outside calculation cannot start after %s', async change => {
  useAppStore.setState({ currentLocation: { latitude: 24.9762, longitude: 67.011, accuracy: 8, observedAtMs: Date.now() } });
  useAppStore.getState().setPendingJourney({ destination });
  const original = V2DirectionsService.calculateHybridPreview.bind(V2DirectionsService);
  type Result = Awaited<ReturnType<typeof original>>;
  let release!: (result: Result) => void;
  let input!: Parameters<typeof original>[0];
  const calculate = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(request => {
    input = request; return new Promise(resolve => { release = resolve; });
  });
  const hook = await renderHook((p: { place: typeof destination }) => useDirectionsViewModel(p.place), { initialProps: { place: destination } });
  await waitFor(() => expect(calculate).toHaveBeenCalled());
  const finish = release;
  const request = input;
  const result = await original(request);
  expect(result.status).toBe('ready');
  expect(result.route?.outsideRoute?.provider).not.toBe('direct-guide');
  if (change === 'manual') await act(() => hook.result.current.chooseManualStart());
  if (change === 'cancel') await act(() => useAppStore.getState().clearRoutePlanner());
  if (change === 'unmount') await hook.unmount();
  if (change === 'revoked') await act(() => useAppStore.setState({ hasLocationPermission: false }));
  if (change === 'services') await act(() => useAppStore.setState({ locationServicesState: 'disabled' }));
  if (change === 'stale') await act(() => useAppStore.setState({ currentLocation: { ...fresh(), observedAtMs: 1 } }));
  if (change === 'replacement') {
    await act(() => useAppStore.getState().setPendingJourney({ destination: other }));
    await hook.rerender({ place: other });
  }
  await act(async () => finish(result));
  if (change === 'none') await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
  else expect(useAppStore.getState().isNavigating).toBe(false);
});


it.each(['failure', 'same_place'] as const)('%s consumes the attempt; a later retry cannot auto-start', async outcome => {
  const original = V2DirectionsService.calculatePreview.bind(V2DirectionsService);
  const spy = jest.spyOn(V2DirectionsService, 'calculatePreview').mockImplementation(request => {
    const result = original(request);
    return outcome === 'failure' ? { status: 'unavailable', route: null, instructions: [], message: 'No route' } :
      { ...result, route: result.route ? { ...result.route, coordinates: result.route.coordinates.slice(0, 1), totalDistance: 0 } : null };
  });
  useAppStore.getState().setPendingJourney({ destination });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(hook.result.current.loadState).toBe(outcome === 'failure' ? 'error' : 'same_place'));
  expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
  expect(useAppStore.getState().isNavigating).toBe(false);
  spy.mockRestore();
  await act(async () => hook.result.current.calculateRoute());
  expect(hook.result.current.loadState).toBe('ready');
  expect(useAppStore.getState().isNavigating).toBe(false);
});

it('GPS quality updates do not cancel a pending outside calculation or activate twice', async () => {
  const coordinate = { latitude: 24.9762, longitude: 67.011, accuracy: 8, observedAtMs: Date.now() };
  useAppStore.setState({ currentLocation: coordinate });
  const original = V2DirectionsService.calculateHybridPreview.bind(V2DirectionsService);
  let release!: (result: Awaited<ReturnType<typeof original>>) => void;
  let request!: Parameters<typeof original>[0];
  const spy = jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(input => {
    request = input; return new Promise(resolve => { release = resolve; });
  });
  useAppStore.getState().setPendingJourney({ destination });
  await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  await act(() => useAppStore.setState({ currentLocation: { ...coordinate, accuracy: 7, observedAtMs: Date.now() } }));
  expect(spy).toHaveBeenCalledTimes(1);
  await act(async () => release(await original(request)));
  await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
});


it('rapid A/B selection publishes and activates B only even when A finishes last', async () => {
  useAppStore.setState({ currentLocation: { latitude: 24.9762, longitude: 67.011, accuracy: 8, observedAtMs: Date.now() } });
  const original = V2DirectionsService.calculateHybridPreview.bind(V2DirectionsService);
  const requests: Array<{ input: Parameters<typeof original>[0]; release: (result: Awaited<ReturnType<typeof original>>) => void }> = [];
  jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(input => new Promise(release => { requests.push({ input, release }); }));
  const activate = jest.spyOn(useAppStore.getState(), 'startNavigation');
  useAppStore.getState().setPendingJourney({ destination });
  const hook = await renderHook((p: { place: typeof destination }) => useDirectionsViewModel(p.place), { initialProps: { place: destination } });
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  const a = requests[0];
  const resultA = await original(a.input);
  await act(() => useAppStore.getState().setPendingJourney({ destination: other }));
  await hook.rerender({ place: other });
  const b = requests.find(request => request.input.request.destination.id === other.id)!;
  expect(b).toBeDefined();
  const resultB = await original(b.input);
  await act(async () => b.release(resultB));
  await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
  const active = useAppStore.getState().activeRoute;
  await act(async () => a.release(resultA));
  expect(useAppStore.getState().activeRoute).toBe(active);
  expect(useAppStore.getState().destination?.id).toBe(other.id);
  expect(activate).toHaveBeenCalledTimes(1);
});

it('Stop then selecting the same destination grants a new single attempt', async () => {
  useAppStore.getState().setPendingJourney({ destination });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
  const session = useAppStore.getState().navigationSessionId;
  await act(() => useAppStore.getState().stopNavigation());
  await act(() => useAppStore.getState().setPendingJourney({ destination }));
  await waitFor(() => expect(useAppStore.getState().isNavigating).toBe(true));
  expect(useAppStore.getState().navigationSessionId).toBe(session + 1);
  await hook.rerender({});
  expect(useAppStore.getState().navigationSessionId).toBe(session + 1);
});

it('an eligible outside direct guide remains non-active and consumes automatic authority', async () => {
  useAppStore.setState({ currentLocation: { latitude: 24.9762, longitude: 67.011, accuracy: 8, observedAtMs: Date.now() } });
  const original = V2DirectionsService.calculateHybridPreview.bind(V2DirectionsService);
  jest.spyOn(V2DirectionsService, 'calculateHybridPreview').mockImplementation(async input => {
    const result = await original(input);
    return result.route?.outsideRoute ? { ...result, route: { ...result.route, outsideRoute: { ...result.route.outsideRoute, provider: 'direct-guide', walkingRouteAvailable: false } } } : result;
  });
  useAppStore.getState().setPendingJourney({ destination });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
  expect(hook.result.current.journeyState).toBe('OUTSIDE_VENUE_GUIDE');
  expect(useAppStore.getState().isNavigating).toBe(false);
  expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
});
