import { useDirectionsViewModel } from '../viewmodels/DirectionsViewModel';
import { useAppStore } from '../store/useAppStore';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { LocationAccessService } from '../services/LocationAccessService';
import { act, renderHook, waitFor } from './test-utils';

const initial = useAppStore.getState();
const block2 = PublicDestinationsService.getByCategory('blocks').find(place => place.id === 'B2')!;
const destination = PublicDestinationsService.getByCategory('blocks').find(place => place.id === 'B28')!;
beforeEach(() => useAppStore.setState(initial, true));
afterEach(() => jest.restoreAllMocks());
async function preview(to = destination) {
  const hook = await renderHook(() => useDirectionsViewModel(to));
  await act(() => hook.result.current.previewBlock2());
  await waitFor(() => expect(hook.result.current.loadState).toBe(to.id === 'B2' ? 'same_place' : 'ready'));
  return hook;
}
test('Block 2 preview is hypothetical, never position or guide/live authority', async () => {
  const hook = await preview();
  expect(hook.result.current.startSource).toBe('hypothetical_place');
  expect(hook.result.current.journeyState).toBe('HYPOTHETICAL_PREVIEW');
  expect(hook.result.current.activeOriginCoordinate).toEqual(block2.coordinate);
  expect(hook.result.current.canStartNavigation).toBe(false);
  await act(() => { hook.result.current.startRouteGuide(); hook.result.current.handleStartNavigation(); });
  expect(useAppStore.getState().currentLocation).toBeNull();
  expect(useAppStore.getState().routeGuide).toBeNull();
  expect(useAppStore.getState().isNavigating).toBe(false);
});
test('explicit confirmation changes only current journey to manual origin', async () => {
  const hook = await preview();
  await act(() => hook.result.current.confirmBlock2());
  await waitFor(() => expect(hook.result.current.journeyState).toBe('MANUAL_GUIDE_READY'));
  expect(hook.result.current.startSource).toBe('manual_place');
  await act(() => hook.result.current.startRouteGuide());
  expect(useAppStore.getState().routeGuide).not.toBeNull();
  expect(useAppStore.getState().currentLocation).toBeNull();
  expect(useAppStore.getState().isNavigating).toBe(false);
});
test('Block 2 to Block 2 remains SAME_PLACE before and after confirmation', async () => {
  const hook = await preview(block2);
  expect(hook.result.current.journeyState).toBe('SAME_PLACE');
  await act(() => hook.result.current.confirmBlock2());
  expect(hook.result.current.loadState).toBe('same_place');
  expect(useAppStore.getState().activeRoute).toBeNull();
});
test('same-destination replacement rejects retained confirmation and does not reuse Block 2', async () => {
  useAppStore.getState().setPendingJourney({ destination });
  const hook = await preview();
  const confirm = hook.result.current.confirmBlock2;
  await act(() => { useAppStore.getState().setPendingJourney({ destination }); confirm(); });
  await waitFor(() => expect(hook.result.current.loadState).toBe('needs_origin'));
  expect(hook.result.current.manualStart).toBeNull();
  expect(useAppStore.getState().routeGuide).toBeNull();
});
test('fresh GPS does not silently reinterpret hypothetical preview', async () => {
  const hook = await preview();
  await act(() => {
    useAppStore.getState().setCurrentLocation({ ...destination.coordinate, accuracy: 8, observedAtMs: Date.now() }, 'live');
    useAppStore.setState({ hasLocationPermission: true, locationPermissionPrecision: 'fine', locationServicesState: 'enabled' });
  });
  expect(hook.result.current.startSource).toBe('hypothetical_place');
  expect(hook.result.current.activeOriginCoordinate).toEqual(block2.coordinate);
  expect(useAppStore.getState().isNavigating).toBe(false);
});
test('failed location recovery preserves hypothetical authorization boundary', async () => {
  const hook = await preview();
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockResolvedValue({ ok: false, source: null, coordinate: null,
    permissionState: { granted: false, canAskAgain: false, precision: 'none', status: 'denied' as never, servicesState: 'enabled', servicesEnabled: true }, message: 'Denied' });
  await act(async () => { await hook.result.current.chooseCurrentLocation(); });
  expect(hook.result.current.startSource).toBe('hypothetical_place');
  await act(() => hook.result.current.startRouteGuide());
  expect(useAppStore.getState().routeGuide).toBeNull();
});
test('unmount rejects retained preview and confirmation commands', async () => {
  const hook = await preview();
  const actions = hook.result.current;
  await hook.unmount();
  expect(actions.confirmBlock2()).toBe(false);
  expect(actions.previewBlock2()).toBe(false);
  expect(useAppStore.getState().currentLocation).toBeNull();
});
test('unroutable preview reports failure and cannot be confirmed as a route', async () => {
  jest.spyOn(V2DirectionsService, 'calculatePreview').mockReturnValue({ status: 'unavailable', route: null, instructions: [], message: 'No walking route' });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  await act(() => hook.result.current.previewBlock2());
  await waitFor(() => expect(hook.result.current.journeyState).toBe('ROUTE_FAILURE'));
  expect(hook.result.current.confirmBlock2()).toBe(false);
  expect(useAppStore.getState().activeRoute).toBeNull();
  expect(useAppStore.getState().isNavigating).toBe(false);
});
test('preview cancels pending location acquisition without accepting late permission/fix', async () => {
  let finish!: (value: Awaited<ReturnType<typeof LocationAccessService.resolveCurrentLocation>>) => void;
  jest.spyOn(LocationAccessService, 'resolveCurrentLocation').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  let pending!: Promise<boolean>;
  await act(() => { pending = hook.result.current.chooseCurrentLocation(); });
  await act(() => hook.result.current.previewBlock2());
  await waitFor(() => expect(hook.result.current.journeyState).toBe('HYPOTHETICAL_PREVIEW'));
  await act(async () => { finish({ ok: true, source: 'live', coordinate: { ...destination.coordinate, accuracy: 8, observedAtMs: Date.now() },
    permissionState: { granted: true, canAskAgain: true, status: 'granted' as never, precision: 'fine', servicesEnabled: true, servicesState: 'enabled' }, message: null }); await pending; });
  expect(hook.result.current.startSource).toBe('hypothetical_place');
  expect(useAppStore.getState().currentLocation).toBeNull();
  expect(useAppStore.getState().hasLocationPermission).toBe(false);
});

test('retained preview command cannot alter a newer same-destination journey', async () => {
  useAppStore.getState().setPendingJourney({ destination });
  const hook = await renderHook(() => useDirectionsViewModel(destination));
  const retained = hook.result.current.previewBlock2;
  await act(() => useAppStore.getState().setPendingJourney({ destination }));
  await waitFor(() => expect(hook.result.current.loadState).toBe('needs_origin'));
  let accepted: boolean | undefined;
  await act(() => { accepted = retained(); });
  expect(accepted).toBe(false);
  expect(useAppStore.getState().routePlannerOrigin).toBeNull();
  expect(hook.result.current.manualStart).toBeNull();
});
