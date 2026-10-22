import { AppState, NativeEventEmitter, NativeModules } from 'react-native';
import { LocationAccessService, observeIOSLocationPermission } from '../services/LocationAccessService';
import { readIOSLocationSnapshot } from '../services/IOSLocationPrecision';
import type { LocationPermissionState } from '../services/LocationAccessService';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }, Linking: {},
  NativeModules: { IjtemaLocationPrecision: { getSnapshot: jest.fn(), addListener: jest.fn(), removeListeners: jest.fn() } },
  NativeEventEmitter: jest.fn(),
  AppState: { currentState: 'active', addEventListener: jest.fn() },
}));
jest.mock('expo-location', () => ({ PermissionStatus: { UNDETERMINED: 'undetermined' } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
const full: LocationPermissionState = { granted: true, precision: 'fine', status: 'granted' as LocationPermissionState['status'], canAskAgain: true, servicesState: 'enabled', servicesEnabled: true };
const reduced: LocationPermissionState = { ...full, precision: 'coarse' };
let change: () => void;
let stateChange: (state: string) => void;
let removeNative: jest.Mock;
let removeApp: jest.Mock;
let stop: (() => void) | undefined;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
beforeEach(() => {
  AppState.currentState = 'active';
  removeNative = jest.fn(); removeApp = jest.fn();
  (NativeEventEmitter as jest.Mock).mockImplementation(() => ({ addListener: (_event: string, cb: () => void) => { change = cb; return { remove: removeNative }; } }));
  (AppState.addEventListener as jest.Mock).mockImplementation((_event, cb) => { stateChange = cb; return { remove: removeApp }; });
});
afterEach(() => { stop?.(); stop = undefined; jest.restoreAllMocks(); });

it('refreshes full/reduced/denied/reverse settings changes without a GPS watch and clears full while pending', async () => {
  const values: LocationPermissionState[] = [];
  const pending = deferred<LocationPermissionState>();
  jest.spyOn(LocationAccessService, 'getPermissionState').mockResolvedValueOnce(full).mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ...full, granted: false, precision: 'none' }).mockResolvedValueOnce(full);
  stop = observeIOSLocationPermission((facts) => values.push(facts));
  await tick(); expect(values.at(-1)?.precision).toBe('fine');
  change(); expect(values.at(-1)?.precision).toBe('none');
  pending.resolve(reduced); await tick(); expect(values.at(-1)?.precision).toBe('coarse');
  change(); await tick(); expect(values.at(-1)?.granted).toBe(false);
  change(); await tick(); expect(values.at(-1)?.precision).toBe('fine');
});
it('ignores older full results after a newer reduced read', async () => {
  const old = deferred<LocationPermissionState>(); const values: LocationPermissionState[] = [];
  jest.spyOn(LocationAccessService, 'getPermissionState').mockReturnValueOnce(old.promise).mockResolvedValueOnce(reduced);
  stop = observeIOSLocationPermission((facts) => values.push(facts));
  change(); await tick(); old.resolve(full); await tick();
  expect(values.at(-1)?.precision).toBe('coarse');
});
it('background invalidates pending full; foreground rechecks and disposal prevents pending publication', async () => {
  const first = deferred<LocationPermissionState>(); const last = deferred<LocationPermissionState>();
  const values: LocationPermissionState[] = [];
  jest.spyOn(LocationAccessService, 'getPermissionState').mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
  stop = observeIOSLocationPermission((facts) => values.push(facts));
  stateChange('background'); first.resolve(full); await tick(); expect(values.at(-1)?.precision).toBe('none');
  stateChange('active'); const count = values.length; stop(); stop = undefined;
  last.resolve(full); await tick(); change(); stateChange('active'); expect(values).toHaveLength(count);
  expect(removeNative).toHaveBeenCalledTimes(1); expect(removeApp).toHaveBeenCalledTimes(1);
});
it('native query begun before a settings event cannot return old full precision to other consumers', async () => {
  jest.spyOn(LocationAccessService, 'getPermissionState').mockResolvedValue(reduced);
  const native = deferred<unknown>(); NativeModules.IjtemaLocationPrecision.getSnapshot.mockReturnValue(native.promise);
  stop = observeIOSLocationPermission(() => {});
  const result = readIOSLocationSnapshot(); change();
  native.resolve({ authorization: 'whenInUse', precision: 'full', servicesEnabled: true });
  expect(await result).toBeNull();
});
it('a failed refresh leaves capability unknown, never full', async () => {
  const values: LocationPermissionState[] = [];
  jest.spyOn(LocationAccessService, 'getPermissionState').mockRejectedValue(new Error('unavailable'));
  stop = observeIOSLocationPermission((facts) => values.push(facts)); await tick();
  expect(values.at(-1)).toMatchObject({ granted: false, precision: 'none', servicesState: 'unknown' });
});

it('cannot publish a full native snapshot while app is in background', async () => {
  AppState.currentState = 'background';
  NativeModules.IjtemaLocationPrecision.getSnapshot.mockResolvedValue({ authorization: 'whenInUse', precision: 'full', servicesEnabled: true });
  expect(await readIOSLocationSnapshot()).toBeNull();
});
