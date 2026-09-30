import * as Location from 'expo-location';
import { AppState } from 'react-native';
import type { Coordinate } from '../models/types';
import { GPSManagerService } from '../services/GPSManagerService';

jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3, High: 4 },
}));

function nativeFix(latitude: number): Location.LocationObject {
  return {
    coords: { latitude, longitude: 67.05, accuracy: 5, altitude: null,
      altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  };
}

const listener = jest.fn();

beforeEach(async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
  const onAppStateChange = (AppState.addEventListener as jest.Mock).mock.calls[0]?.[1];
  onAppStateChange?.('active');
  await new Promise<void>((resolve) => setImmediate(resolve));
  listener.mockClear();
});

afterEach(async () => {
  GPSManagerService.removeListener(listener);
  await new Promise<void>((resolve) => setImmediate(resolve));
  GPSManagerService.stop();
});

it('a removed watch cannot overwrite a resumed watch position or notify current listeners', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
  const callbacks: Location.LocationCallback[] = [];
  (Location.watchPositionAsync as jest.Mock).mockImplementation(async (_options, callback) => {
    callbacks.push(callback);
    return { remove: jest.fn() };
  });
  let lastPosition: Coordinate | null = null;
  GPSManagerService.setStoreUpdater((coordinate) => { lastPosition = coordinate; });
  GPSManagerService.addListener(listener, 'navigation');
  // Drain the real manager's queued asynchronous reconciliation.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const onAppStateChange = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
  onAppStateChange('background');
  onAppStateChange('active');
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(callbacks).toHaveLength(2);
  callbacks[1](nativeFix(24.9));
  listener.mockClear();
  // Native removal cannot retract an already queued callback. Its timestamp can
  // be fresh; subscription ownership, rather than age, must fence delivery.
  callbacks[0](nativeFix(24.8));
  expect(lastPosition).toMatchObject({ latitude: 24.9 });
  expect(listener).not.toHaveBeenCalled();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

it('backgrounding while permissions resolve does not start a native watch', async () => {
  const permission = deferred<{ status: string }>();
  (Location.getForegroundPermissionsAsync as jest.Mock).mockReturnValueOnce(permission.promise);
  (Location.watchPositionAsync as jest.Mock).mockClear();
  GPSManagerService.addListener(listener, 'navigation');
  const onAppStateChange = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
  onAppStateChange('background');
  permission.resolve({ status: 'granted' });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  onAppStateChange('active');
  await new Promise<void>((resolve) => setImmediate(resolve));
});

it('a pending watch invalidated by background cannot publish and is removed on resolution', async () => {
  const pending = deferred<Location.LocationSubscription>();
  let callback!: Location.LocationCallback;
  const remove = jest.fn();
  (Location.watchPositionAsync as jest.Mock).mockImplementationOnce((_options, nextCallback) => {
    callback = nextCallback;
    return pending.promise;
  });
  const storeUpdater = jest.fn();
  GPSManagerService.setStoreUpdater(storeUpdater);
  GPSManagerService.addListener(listener, 'navigation');
  await new Promise<void>((resolve) => setImmediate(resolve));
  const onAppStateChange = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
  onAppStateChange('background');
  callback(nativeFix(24.8));
  pending.resolve({ remove });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(storeUpdater).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
  onAppStateChange('active');
  await new Promise<void>((resolve) => setImmediate(resolve));
});

it('the current watch can publish before its native subscription handle resolves', async () => {
  const pending = deferred<Location.LocationSubscription>();
  let callback!: Location.LocationCallback;
  (Location.watchPositionAsync as jest.Mock).mockImplementationOnce((_options, nextCallback) => {
    callback = nextCallback;
    return pending.promise;
  });
  const storeUpdater = jest.fn();
  GPSManagerService.setStoreUpdater(storeUpdater);
  GPSManagerService.addListener(listener, 'navigation');
  await new Promise<void>((resolve) => setImmediate(resolve));
  callback(nativeFix(24.9));
  pending.resolve({ remove: jest.fn() });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(storeUpdater).toHaveBeenCalledWith(expect.objectContaining({ latitude: 24.9 }));
});

it('a setup discarded because no listener requests its mode cannot publish later', async () => {
  let callback!: Location.LocationCallback;
  const remove = jest.fn();
  (Location.watchPositionAsync as jest.Mock).mockImplementationOnce(async (_options, nextCallback) => {
    callback = nextCallback;
    return { remove };
  });
  const storeUpdater = jest.fn();
  GPSManagerService.setStoreUpdater(storeUpdater);
  await GPSManagerService.start('navigation');
  expect(remove).toHaveBeenCalledTimes(1);
  callback(nativeFix(24.8));
  expect(storeUpdater).not.toHaveBeenCalled();
});
