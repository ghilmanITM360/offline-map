import { act, renderHook } from './test-utils';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { useAppStore } from '../store/useAppStore';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';

const initial = useAppStore.getState();

afterEach(() => { useAppStore.setState(initial, true); jest.useRealTimers(); });

test('accepted GPS update settles without a snap/reroute callback render loop', async () => {
  jest.useFakeTimers();
  const destination = V2PlaceAdapter.getPlaceById('B1')!;
  const preview = RoutingServiceV2.calculateRoute({ start: { type: 'gate', gateId: 'GATE_13' },
    destination: { type: 'block', blockId: 'B1' } })!;
  const route = V2NavigationAdapter.fromPreview({ previewRoute: preview, destination });
  useAppStore.setState({ ...initial, settings: { ...initial.settings, autoReroute: false, voiceInstructions: false } }, true);
  useAppStore.getState().startNavigation(destination, route, route.instructions);
  let renders = 0;
  const hook = await renderHook(() => {
    if (++renders > 25) throw new Error('Navigation render loop after GPS update');
    return useNavigationViewModelV2();
  });
  await act(async () => {
    jest.advanceTimersByTime(1000);
    useAppStore.setState({ currentLocation: { ...route.coordinates[0], accuracy: 5, observedAtMs: Date.now() },
      currentLocationSource: 'live' });
  });
  expect(hook.result.current.gpsSignalState).toBe('GPS_GOOD');
  expect(renders).toBeLessThan(12);
});
