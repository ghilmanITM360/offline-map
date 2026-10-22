import { AppState, NativeModules, Platform } from 'react-native';
import * as Location from 'expo-location';
import { LocationAccessService } from '../services/LocationAccessService';
import { evaluateLocationCapability } from '../services/LocationCapability';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(), hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(), getLastKnownPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

const snapshot = jest.fn();
const full = { authorization: 'whenInUse', servicesEnabled: true, precision: 'full' };
const originalOS = Platform.OS;
beforeEach(() => {
  AppState.currentState = 'active';
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  NativeModules.IjtemaLocationPrecision = { getSnapshot: snapshot };
  snapshot.mockReset().mockResolvedValue(full);
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted', canAskAgain: true });
  (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
});
afterAll(() => { Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true }); });

it('maps native full authorization to fine only with foreground permission and services', async () => {
  expect((await LocationAccessService.getPermissionState()).precision).toBe('fine');
});
it.each([
  [{ ...full, precision: 'reduced' }, 'coarse'],
  [{ ...full, authorization: 'denied' }, 'none'],
  [{ ...full, authorization: 'restricted' }, 'none'],
  [{ ...full, authorization: 'notDetermined' }, 'none'],
  [{ ...full, authorization: 'unknown' }, 'none'],
  [{ ...full, servicesEnabled: false }, 'none'],
  [{ ...full, precision: 'futureValue' }, 'none'],
  [{ precision: 'full' }, 'none'], [null, 'none'],
])('fails closed or maps reduced for %p', async (value, precision) => {
  snapshot.mockResolvedValue(value);
  const permission = await LocationAccessService.getPermissionState();
  expect(permission.precision).toBe(precision);
  const capability = evaluateLocationCapability({ permission, liveFix: null });
  expect(capability.mode).toBe('route_guide');
  expect(capability.routeGuideAvailable).toBe(true);
});
it('does not infer full from a native result when Expo denies foreground permission', async () => {
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  expect((await LocationAccessService.getPermissionState()).precision).toBe('none');
});
it('requires verified services even when native reports full', async () => {
  (Location.hasServicesEnabledAsync as jest.Mock).mockRejectedValue(new Error('unavailable'));
  expect((await LocationAccessService.getPermissionState()).precision).toBe('none');
});
it('fails closed when bridge rejects or is unavailable', async () => {
  snapshot.mockRejectedValue(new Error('unavailable'));
  expect((await LocationAccessService.getPermissionState()).precision).toBe('none');
  delete NativeModules.IjtemaLocationPrecision;
  expect((await LocationAccessService.getPermissionState()).precision).toBe('none');
});
it('full authorization alone never authorizes Live with no, stale or untrusted fix', async () => {
  const permission = await LocationAccessService.getPermissionState();
  expect(permission.precision).toBe('fine');
  for (const liveFix of [null,
    { latitude: 24.96, longitude: 67.01, accuracy: 5, observedAtMs: 1 },
    { latitude: 24.96, longitude: 67.01, observedAtMs: Date.now() },
  ]) expect(evaluateLocationCapability({ permission, liveFix }).mode).toBe('route_guide');
});
it('rechecks precision after a fix wait so a settings change cannot return old full authority', async () => {
  (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async () => {
    snapshot.mockResolvedValue({ ...full, precision: 'reduced' });
    return { coords: { latitude: 24.96, longitude: 67.01, accuracy: 5 }, timestamp: Date.now() };
  });
  const result = await LocationAccessService.resolveCurrentLocation(false);
  expect(result.ok).toBe(true);
  expect(result.permissionState.precision).toBe('coarse');
});
it('a native query that never settles times out fail-closed', async () => {
  jest.useFakeTimers();
  try {
    snapshot.mockReturnValue(new Promise(() => {}));
    const result = LocationAccessService.getPermissionState();
    await jest.advanceTimersByTimeAsync(2000);
    expect((await result).precision).toBe('none');
  } finally { jest.useRealTimers(); }
});
