import { act, renderHook, waitFor } from './test-utils';
import { useAppStore } from '../store/useAppStore';
import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { startPreviewNavigationV2 } from '../viewmodels/NavigationViewModelV2';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';

// A1-10: with a fresh live fix outside the venue and only a straight-line direct guide, the primary action used to
// read "Start walking" and then be refused ("Can't start yet"). A direct guide is not live walking navigation, so it
// is offered as the route guide instead. Real view model, store and routing: a fix far outside the street-graph
// coverage yields a genuine direct guide.

jest.setTimeout(15_000);

const initial = { ...useAppStore.getState() };
const destination = V2PlaceAdapter.getPlaceById('B1')!;
const farOutsideFix = () => ({ latitude: 24.9, longitude: 67.01, accuracy: 8, observedAtMs: Date.now() });

const savedEnv = { proxy: process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL, v2Routing: process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING };
const restoreEnv = (key: string, value: string | undefined) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL;
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
  useAppStore.setState(initial, true);
  useAppStore.setState({
    currentLocation: farOutsideFix(), currentLocationSource: 'live', hasLocationPermission: true,
    locationPermissionState: 'granted', locationPermissionPrecision: 'fine', locationServicesState: 'enabled',
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  restoreEnv('EXPO_PUBLIC_IJTEMA_ROUTING_PROXY_BASE_URL', savedEnv.proxy);
  restoreEnv('EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING', savedEnv.v2Routing);
});

async function mountReadyDirectGuide() {
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await waitFor(() => expect(hook.result.current.journeyState).toBe('OUTSIDE_VENUE_GUIDE'), { timeout: 8_000 });
  expect(hook.result.current.startSource).toBe('live_gps');
  expect((hook.result.current.route as { outsideRoute?: { provider: string } }).outsideRoute?.provider).toBe('direct-guide');
  return hook;
}

it('offers the route guide, not a live Start, for a live fix outside the venue with only a direct guide', async () => {
  const hook = await mountReadyDirectGuide();

  expect(hook.result.current.startAction).toMatchObject({ kind: 'route_guide', primaryLabel: 'Start route' });
  expect(hook.result.current.startAction?.secondaryLabel).toBeUndefined();
});

it('starting it opens the route guide with the direct-guide step and never a live navigation session', async () => {
  const hook = await mountReadyDirectGuide();

  await act(async () => hook.result.current.startRouteGuide());

  const guide = useAppStore.getState().routeGuide;
  expect(guide).not.toBeNull();
  expect(guide!.steps.length).toBeGreaterThan(0);
  expect(guide!.steps[0].semantic?.key).toBe('instructions.direct');
  expect(useAppStore.getState().isNavigating).toBe(false);
});

it('live walking activation of a direct guide is still refused by the engine', async () => {
  const hook = await mountReadyDirectGuide();

  const result = startPreviewNavigationV2({ route: hook.result.current.route as never, destination });

  expect(result.canStart).toBe(false);
  expect(useAppStore.getState().isNavigating).toBe(false);
});

it('an eligible destination intent is consumed by a direct guide without a false "location failed"', async () => {
  useAppStore.getState().setPendingJourney({ destination });
  expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('eligible');

  const hook = await mountReadyDirectGuide();

  expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
  expect(useAppStore.getState().isNavigating).toBe(false);
  expect(hook.result.current.startAttempt).toBe('idle');
});
