import { createExpoLocationAdapter } from './expoLocation';

type Callback = (p: any) => void;
// A scripted stand-in for the expo-location module.
function fakeLocation(over: Record<string, any> = {}) {
  const removed: number[] = [];
  let callback: Callback = () => undefined;
  let release: (s: { remove: () => void }) => void = () => undefined;
  const module: any = {
    Accuracy: { High: 4 },
    getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, android: { accuracy: 'fine' } })),
    requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, android: { accuracy: 'fine' } })),
    hasServicesEnabledAsync: jest.fn(async () => true),
    getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 24.97, longitude: 67.005, accuracy: 6 }, timestamp: 1_000 })),
    watchPositionAsync: jest.fn((_o: unknown, cb: Callback) => { callback = cb; return new Promise((r) => { release = r; }); }),
    ...over,
  };
  return { module, removed, emit: (p: unknown) => callback(p), subscribe: () => release({ remove: () => removed.push(1) }) };
}
const android = (location: any, extra = {}) => createExpoLocationAdapter({ location, platform: 'android', ...extra });
const ios = (location: any, extra = {}) => createExpoLocationAdapter({ location, platform: 'ios', ...extra });

describe('permission mapping', () => {
  it('reads without prompting and reports Android fine/coarse honestly', async () => {
    const f = fakeLocation();
    expect(await android(f.module).getPermission()).toEqual({ granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' });
    expect(f.module.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    f.module.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true, android: { accuracy: 'coarse' } });
    expect((await android(f.module).getPermission()).precision).toBe('coarse');
  });

  it('a denied permission has no precision, and services off or unreadable are never "enabled"', async () => {
    const f = fakeLocation({ getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied', canAskAgain: false })), hasServicesEnabledAsync: jest.fn(async () => false) });
    expect(await android(f.module).getPermission()).toEqual({ granted: false, canAskAgain: false, precision: 'none', servicesState: 'disabled' });
    f.module.hasServicesEnabledAsync.mockRejectedValue(new Error('x'));
    expect((await android(f.module).getPermission()).servicesState).toBe('unknown');
  });

  it('iOS precision is "none" unless the host proves it: scope or fix accuracy never count', async () => {
    const f = fakeLocation({ getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true, ios: { scope: 'whenInUse' } })) });
    expect((await ios(f.module).getPermission()).precision).toBe('none');
    expect((await ios(f.module, { readIOSPrecision: async () => 'full' }).getPermission()).precision).toBe('fine');
    expect((await ios(f.module, { readIOSPrecision: async () => 'reduced' }).getPermission()).precision).toBe('coarse');
    expect((await ios(f.module, { readIOSPrecision: async () => { throw new Error('bridge'); } }).getPermission()).precision).toBe('none');
  });

  it('only requestPermission shows the prompt', async () => {
    const f = fakeLocation();
    await android(f.module).requestPermission();
    expect(f.module.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('fresh fix', () => {
  it('maps a live position with its own timestamp and never asks for a remembered one', async () => {
    const f = fakeLocation();
    expect(await android(f.module).getCurrentFix(new AbortController().signal)).toEqual({ latitude: 24.97, longitude: 67.005, accuracy: 6, observedAtMs: 1_000 });
    expect(f.module.getLastKnownPositionAsync).toBeUndefined();
  });

  it('is null when the platform fails, the signal is already aborted, or it aborts first; a late result is dropped', async () => {
    const failing = fakeLocation({ getCurrentPositionAsync: jest.fn(async () => { throw new Error('unavailable'); }) });
    expect(await android(failing.module).getCurrentFix(new AbortController().signal)).toBeNull();
    const c = new AbortController(); c.abort();
    expect(await android(fakeLocation().module).getCurrentFix(c.signal)).toBeNull();
    let resolveLate: (v: unknown) => void = () => undefined;
    const slow = fakeLocation({ getCurrentPositionAsync: jest.fn(() => new Promise((r) => { resolveLate = r; })) });
    const abort = new AbortController();
    const pending = android(slow.module).getCurrentFix(abort.signal);
    abort.abort();
    expect(await pending).toBeNull();
    resolveLate({ coords: { latitude: 1, longitude: 2 }, timestamp: 5 }); // must not throw or resolve anything
  });

  it('gives up after the timeout instead of waiting for the platform', async () => {
    jest.useFakeTimers();
    try {
      const f = fakeLocation({ getCurrentPositionAsync: jest.fn(() => new Promise(() => undefined)) });
      const pending = android(f.module, { freshFixTimeoutMs: 2_000 }).getCurrentFix(new AbortController().signal);
      jest.advanceTimersByTime(2_000);
      expect(await pending).toBeNull();
    } finally { jest.useRealTimers(); }
  });

  it('omits accuracy the platform did not report, so the SDK treats the fix as unusable', async () => {
    const f = fakeLocation({ getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 1, longitude: 2, accuracy: null }, timestamp: 9 })) });
    expect(await android(f.module).getCurrentFix(new AbortController().signal)).toEqual({ latitude: 1, longitude: 2, observedAtMs: 9 });
  });
});

describe('watch', () => {
  it('delivers fixes until stopped, then releases the subscription exactly once', async () => {
    const f = fakeLocation();
    const seen: unknown[] = [];
    const stop = android(f.module).watch((fix) => seen.push(fix));
    f.subscribe();
    await Promise.resolve();
    f.emit({ coords: { latitude: 3, longitude: 4, accuracy: 5 }, timestamp: 7 });
    stop(); stop();
    f.emit({ coords: { latitude: 9, longitude: 9, accuracy: 5 }, timestamp: 8 });
    expect(seen).toEqual([{ latitude: 3, longitude: 4, accuracy: 5, observedAtMs: 7 }]);
    expect(f.removed).toHaveLength(1);
  });

  it('stopping before the platform has subscribed still releases it once it arrives', async () => {
    const f = fakeLocation();
    const stop = android(f.module).watch(() => undefined);
    stop();
    f.subscribe();
    await Promise.resolve(); await Promise.resolve();
    expect(f.removed).toHaveLength(1);
  });

  it('a failed subscription is not an unhandled rejection', async () => {
    const f = fakeLocation({ watchPositionAsync: jest.fn(async () => { throw new Error('denied'); }) });
    const stop = android(f.module).watch(() => undefined);
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });
});
