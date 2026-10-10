import { useAppStore } from '../store/useAppStore';
import { PublicDestinationsService } from '../services/PublicDestinationsService';

const initial = useAppStore.getState();
const [destination, origin] = PublicDestinationsService.getByCategory('blocks');
beforeEach(() => useAppStore.setState(initial, true));
function open() {
  useAppStore.getState().setPendingJourney({ destination });
  useAppStore.getState().setRoutePlannerDest(destination);
  useAppStore.getState().setDirectoryPurpose('start');
  return { purpose: 'start' as const, place: origin, request: useAppStore.getState().directoryRequest };
}
test.each([false, true])('rejects cancelled old answer after newer journey (same destination %s)', (same) => {
  const answer = open();
  useAppStore.getState().setDirectoryPurpose(null);
  useAppStore.getState().setPendingJourney({ destination: same ? destination : origin });
  useAppStore.getState().setRoutePlannerDest(same ? destination : origin);
  useAppStore.getState().setDirectoryChoice(answer);
  expect(useAppStore.getState().directoryChoice).toBeNull();
  expect(useAppStore.getState().routePlannerOrigin).toBeNull();
});
test('reopen rejects older request without cancelling current chooser', () => {
  const answer = open();
  useAppStore.getState().setDirectoryPurpose(null);
  useAppStore.getState().setDirectoryPurpose('start');
  useAppStore.getState().setDirectoryChoice(answer);
  expect(useAppStore.getState().directoryChoice).toBeNull();
  expect(useAppStore.getState().directoryPurpose).toBe('start');
});
test('accepts matching answer once and rejects duplicate taps', () => {
  const answer = open();
  useAppStore.getState().setDirectoryChoice(answer);
  expect(useAppStore.getState().directoryChoice).toEqual(answer);
  expect(useAppStore.getState().directoryPurpose).toBeNull();
  useAppStore.getState().setDirectoryChoice({ ...answer, place: destination });
  expect(useAppStore.getState().directoryChoice).toEqual(answer);
});
test('new destination invalidates queued answer before consumption', () => {
  const answer = open();
  useAppStore.getState().setDirectoryChoice(answer);
  useAppStore.getState().setRoutePlannerDest(origin);
  expect(useAppStore.getState().directoryChoice).toBeNull();
});
test('old unmount cancellation does not clear newer request or accepted answer', () => {
  const old = open();
  useAppStore.getState().setDirectoryPurpose('start');
  const current = { ...old, request: useAppStore.getState().directoryRequest! };
  useAppStore.getState().setDirectoryChoice(current);
  useAppStore.getState().cancelDirectoryRequest(old.request!.serial);
  expect(useAppStore.getState().directoryChoice).toEqual(current);
  expect(useAppStore.getState().consumeDirectoryChoice(current, destination.id)).toBe(true);
  expect(useAppStore.getState().consumeDirectoryChoice(current, destination.id)).toBe(false);
});
test('mismatched purpose and missing destination cannot authorize selection', () => {
  const answer = open();
  useAppStore.getState().setDirectoryChoice({ ...answer, purpose: 'destination' });
  expect(useAppStore.getState().directoryChoice).toBeNull();
  useAppStore.getState().clearRoutePlanner();
  useAppStore.getState().setDirectoryChoice(answer);
  expect(useAppStore.getState().directoryChoice).toBeNull();
});
test('language and location changes do not transfer or recreate request ownership', () => {
  const answer = open();
  useAppStore.getState().updateSettings({ language: 'ur' });
  useAppStore.getState().setCurrentLocation(origin.coordinate, 'live');
  expect(useAppStore.getState().setDirectoryChoice(answer)).toBe(true);
  expect(useAppStore.getState().consumeDirectoryChoice(answer, destination.id)).toBe(true);
  expect(useAppStore.getState().isNavigating).toBe(false);
});
