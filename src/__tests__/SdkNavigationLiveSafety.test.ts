// Codex independent audit (13f4629): live-navigation authority and trust-boundary defects NAV-01, NAV-02, NAV-07, NAV-08, NAV-09.
// Each case is a regression for the audited reproducer; none of them relaxes a permission, freshness or arrival rule.
import {
  createNavigationController,
  findBestVenuePath,
  haversineM,
  type LiveFixCoordinate,
  type LocationPermissionInput,
  type NavigationControllerOptions,
  type NavigationLocationAdapter,
  type OutsideRoute,
  type VenueCoordinate,
} from '@muslim-ummah/offline-navigation';
import { testVenue } from './sdkTestVenue';

const M_PER_DEG = 111_320;
const offset = (from: VenueCoordinate, northM: number, eastM: number): VenueCoordinate => ({
  lat: from.lat + northM / M_PER_DEG,
  lng: from.lng + eastM / (M_PER_DEG * Math.cos((from.lat * Math.PI) / 180)),
});
const N1 = testVenue.graph.getNode('n/1')!.coordinate;
const N2 = testVenue.graph.getNode('n/2')!.coordinate;
const N3 = testVenue.graph.getNode('n/3')!.coordinate;

const T0 = 1_000_000;
let t = T0;
const fix = (p: VenueCoordinate, over: Partial<LiveFixCoordinate> = {}): LiveFixCoordinate =>
  ({ latitude: p.lat, longitude: p.lng, accuracy: 5, observedAtMs: t, ...over });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const FINE: LocationPermissionInput = { granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' };
const DENIED: LocationPermissionInput = { granted: false, canAskAgain: false, precision: 'none', servicesState: 'enabled' };

interface Fake extends NavigationLocationAdapter {
  permission: LocationPermissionInput;
  currentFix: LiveFixCoordinate | null;
  watching: number;
  starts: number;
  /** Every callback ever handed to watch(), stopped or not: a stopped watcher that still calls back must stay deaf. */
  callbacks: Array<(fix: LiveFixCoordinate) => void>;
}
const makeLocation = (): Fake => {
  const L: Fake = {
    permission: FINE, currentFix: null, watching: 0, starts: 0, callbacks: [],
    getPermission: async () => L.permission,
    requestPermission: async () => L.permission,
    getCurrentFix: async () => L.currentFix,
    watch: (onFix) => {
      L.watching += 1;
      L.starts += 1;
      L.callbacks.push(onFix);
      let stopped = false;
      return () => { if (!stopped) { stopped = true; L.watching -= 1; } };
    },
  };
  return L;
};
const setup = (extra: Partial<NavigationControllerOptions> = {}) => {
  t = T0;
  const L = makeLocation();
  L.currentFix = fix(offset(N1, 3, 0));
  const c = createNavigationController({ venue: testVenue, location: L, now: () => t, ...extra });
  c.selectDestination('annex');
  return { c, L };
};
const goLive = async (extra: Partial<NavigationControllerOptions> = {}) => {
  const s = setup(extra);
  expect(await s.c.requestLive()).toBe(true);
  return s;
};
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};
/** A permission reader whose answers are released by hand, in any order. */
const gatedPermission = (L: Fake) => {
  const gates: Array<ReturnType<typeof deferred<LocationPermissionInput>>> = [];
  L.getPermission = () => { const g = deferred<LocationPermissionInput>(); gates.push(g); return g.promise; };
  return gates;
};

describe('NAV-01: overlapping foreground resumes', () => {
  it.each([
    ['grant then grant, newest answers first', [FINE, FINE], [1, 0]],
    ['grant then grant, oldest answers first', [FINE, FINE], [0, 1]],
  ])('%s keeps exactly one watcher and Exit stops it', async (_n, answers, order) => {
    const { c, L } = await goLive();
    const gates = gatedPermission(L);
    const a = c.resume();
    const b = c.resume();
    for (const i of order) { gates[i].resolve(answers[i]); await flush(); }
    await Promise.all([a, b]);
    expect(L.watching).toBe(1);
    c.exit();
    expect(L.watching).toBe(0);
  });

  it('an older grant cannot override a newer revocation (deny/grant)', async () => {
    const { c, L } = await goLive();
    const gates = gatedPermission(L);
    const a = c.resume();
    const b = c.resume();
    gates[1].resolve(DENIED);
    await b;
    gates[0].resolve(FINE);
    await a;
    expect(L.watching).toBe(0);
    t += 1_000;
    c.ingestFix(fix(offset(N1, 20, 0)));
    expect(c.getState().live!.signal).toBe('lost');
  });

  it('a newer grant is not undone by an older revocation (grant/deny)', async () => {
    const { c, L } = await goLive();
    const gates = gatedPermission(L);
    const a = c.resume();
    const b = c.resume();
    gates[1].resolve(FINE);
    await b;
    gates[0].resolve(DENIED);
    await a;
    expect(L.watching).toBe(1);
    c.exit();
    expect(L.watching).toBe(0);
  });

  it('Exit and Dispose during the await leave no watcher and no state', async () => {
    for (const end of ['exit', 'dispose'] as const) {
      const { c, L } = await goLive();
      const gates = gatedPermission(L);
      const pending = c.resume();
      c[end]();
      gates[0].resolve(FINE);
      await pending;
      expect(L.watching).toBe(0);
      expect(c.getState().phase).toBe('browsing');
    }
  });

  it('20 foreground cycles, half of them overlapping, never hold more than one watcher', async () => {
    const { c, L } = await goLive();
    for (let i = 0; i < 20; i += 1) {
      t += 500;
      if (i % 2 === 0) { await c.resume(); } else { await Promise.all([c.resume(), c.resume()]); }
      expect(L.watching).toBe(1);
    }
    c.exit();
    expect(L.watching).toBe(0);
  });

  it('a watcher that was stopped cannot feed the trip any more', async () => {
    const { c, L } = await goLive();
    const first = L.callbacks[0];
    await c.resume();
    await flush();
    t += 1_000;
    const before = c.getState();
    first(fix(offset(N1, 20, 0)));
    expect(c.getState()).toBe(before);
    L.callbacks[L.callbacks.length - 1](fix(offset(N1, 20, 0)));
    expect(c.getState()).not.toBe(before);
  });
});

describe('NAV-07: replayed and out-of-order observations', () => {
  it('replaying A after B cannot revive a lost signal', async () => {
    const { c } = await goLive();
    const a = fix(offset(N1, 3, 0));
    t += 1_000;
    c.ingestFix(fix(offset(N1, 10, 0)));
    t += 9_000;
    c.tick();
    expect(c.getState().live!.signal).toBe('lost');
    const lost = c.getState();
    c.ingestFix(a);
    expect(c.getState()).toBe(lost);
  });

  it('A, B, A moves nothing: progress, state object and reroute evidence are untouched', async () => {
    const { c } = await goLive();
    const a = fix(offset(N1, 10, 0));
    t += 1_000;
    const b = fix(offset(N1, 30, 0));
    c.ingestFix(a);
    c.ingestFix(b);
    const after = c.getState();
    c.ingestFix(a);
    expect(c.getState()).toBe(after);
    expect(c.getState().live!.progressM).toBe(after.live!.progressM);
  });

  it('a one-shot fix older than a watcher fix is dropped; a newer one is accepted', async () => {
    const { c, L } = await goLive();
    const resumeFix = fix(offset(N1, 10, 0), { observedAtMs: t + 100 });
    t += 2_000;
    L.callbacks[0](fix(offset(N1, 30, 0)));
    const watched = c.getState();
    c.ingestFix(resumeFix);
    expect(c.getState()).toBe(watched);
    t += 1_000;
    c.ingestFix(fix(offset(N1, 40, 0)));
    expect(c.getState()).not.toBe(watched);
  });

  it('a replayed weak fix does not turn lost into weak', async () => {
    const { c } = await goLive();
    t += 1_000;
    const weak = fix(offset(N1, 10, 0), { accuracy: 80 });
    c.ingestFix(weak);
    t += 9_000;
    c.tick();
    expect(c.getState().live!.signal).toBe('lost');
    const lost = c.getState();
    c.ingestFix(weak);
    expect(c.getState()).toBe(lost);
  });

  it('a fix with a time far in the future is stale and never raises the mark that would reject real fixes', async () => {
    const { c } = await goLive();
    t += 1_000;
    c.ingestFix(fix(offset(N1, 10, 0), { observedAtMs: t + 3_600_000 }));
    t += 1_000;
    c.ingestFix(fix(offset(N1, 20, 0)));
    expect(c.getState().live!.signal).toBe('good');
  });

  it('newer fixes keep arriving normally', async () => {
    const { c } = await goLive();
    let last = c.getState().live!.progressM;
    for (let d = 10; d <= 50; d += 10) {
      t += 4_000;
      c.ingestFix(fix(offset(N1, d, 0)));
      expect(c.getState().live!.progressM).toBeGreaterThanOrEqual(last);
      last = c.getState().live!.progressM;
    }
    expect(last).toBeGreaterThan(40);
  });
});

describe('NAV-08: subscribers that command the controller while it publishes', () => {
  it.each([
    ['exit', (c: ReturnType<typeof createNavigationController>) => c.exit()],
    ['dispose', (c: ReturnType<typeof createNavigationController>) => c.dispose()],
    ['select another destination', (c: ReturnType<typeof createNavigationController>) => c.selectDestination('hall')],
  ])('%s on the first Live state leaves no watcher and no crash', async (_n, command) => {
    const { c, L } = setup();
    let fired = false;
    c.subscribe(() => {
      if (!fired && c.getState().phase === 'live') { fired = true; command(c); }
    });
    await expect(c.requestLive()).resolves.toEqual(expect.any(Boolean));
    expect(fired).toBe(true);
    expect(L.watching).toBe(0);
    expect(c.getState().phase).not.toBe('live');
  });

  it('a subscriber that exits on the first live fix does not crash fix handling', async () => {
    const { c, L } = setup();
    let live = 0;
    c.subscribe(() => {
      if (c.getState().phase !== 'live') return;
      live += 1;
      if (live === 2) c.exit(); // the state published by the first accepted fix
    });
    await c.requestLive();
    expect(L.watching).toBe(0);
    expect(c.getState().phase).toBe('browsing');
  });

  it('a subscriber that exits while a reroute is announced leaves nothing running', async () => {
    const { c, L } = await goLive();
    let armed = false;
    c.subscribe(() => { if (armed && c.getState().live?.rerouting) c.exit(); });
    armed = true;
    t += 2_000;
    c.ingestFix(fix(offset(N1, 10, 0)));
    expect(c.requestReroute()).toBe(true);
    expect(L.watching).toBe(0);
    expect(c.getState().phase).toBe('browsing');
  });
});

describe('NAV-09: a one-step Live start must not commit what went stale during routing', () => {
  const slowFinder = () => {
    const gate = deferred<ReturnType<typeof findBestVenuePath>>();
    const findRoute: NonNullable<NavigationControllerOptions['findRoute']> = () => gate.promise;
    return { gate, findRoute };
  };
  const release = (gate: ReturnType<typeof slowFinder>['gate']) =>
    gate.resolve(findBestVenuePath(testVenue.graph, ['n/1'], ['n/3', 'n/5']));

  it('a route that took 31 s is refused when the receiver cannot produce a fresh fix', async () => {
    const f = slowFinder();
    const { c, L } = setup({ findRoute: f.findRoute });
    const started = c.requestLive();
    await flush();
    t += 31_000;
    release(f.gate);
    expect(await started).toBe(false);
    expect(c.getState().phase).toBe('preview');
    expect(c.getState().liveAttempt.blocker).toBe('stale_fix');
    expect(L.starts).toBe(0);
  });

  it('a slow route is reacquired against a fresh fix that is still where the route began', async () => {
    const f = slowFinder();
    const { c, L } = setup({ findRoute: f.findRoute });
    const started = c.requestLive();
    await flush();
    t += 31_000;
    L.currentFix = fix(offset(N1, 5, 0));
    release(f.gate);
    expect(await started).toBe(true);
    expect(L.watching).toBe(1);
    expect(c.getState().phase).toBe('live');
  });

  it('a walker who moved on while the route was calculated is refused as outdated', async () => {
    const f = slowFinder();
    const { c, L } = setup({ findRoute: f.findRoute });
    const started = c.requestLive();
    await flush();
    t += 31_000;
    L.currentFix = fix(offset(N1, 60, 0));
    release(f.gate);
    expect(await started).toBe(false);
    expect(c.getState().liveAttempt.blocker).toBe('route_outdated');
    expect(L.starts).toBe(0);
  });

  it('permission revoked while the route was calculated is refused, even when the fix is still fresh', async () => {
    const f = slowFinder();
    const { c, L } = setup({ findRoute: f.findRoute });
    const started = c.requestLive();
    await flush();
    t += 1_000;
    L.permission = DENIED;
    release(f.gate);
    expect(await started).toBe(false);
    expect(c.getState().liveAttempt.blocker).toBe('permission_blocked');
    expect(L.starts).toBe(0);
  });

  it('cancelling during the refresh leaves no Live behind', async () => {
    const f = slowFinder();
    const { c, L } = setup({ findRoute: f.findRoute });
    const started = c.requestLive();
    await flush();
    t += 31_000;
    const fresh = deferred<LiveFixCoordinate | null>();
    L.getCurrentFix = () => fresh.promise;
    release(f.gate);
    await flush();
    c.cancelLive();
    fresh.resolve(fix(offset(N1, 5, 0)));
    expect(await started).toBe(false);
    expect(c.getState().phase).toBe('preview');
    expect(L.starts).toBe(0);
  });

  it('the ordinary quick start is unchanged', async () => {
    const { c, L } = setup();
    expect(await c.requestLive()).toBe(true);
    expect(L.starts).toBe(1);
  });
});

describe('NAV-02: an outside route is bound to the journey', () => {
  const OUT = offset(N1, -300, 0);
  const route = (points: VenueCoordinate[]): OutsideRoute => {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += haversineM(points[i - 1], points[i]);
    return {
      points,
      steps: [
        { kind: 'depart', nodeId: 'o/0', toNodeId: 'o/1', distanceM: total },
        { kind: 'arrive', nodeId: 'o/1', toNodeId: 'o/1', distanceM: 0 },
      ],
    };
  };
  const withProvider = (r: () => OutsideRoute) => {
    const s = setup({ outside: { route: r } });
    s.L.currentFix = fix(OUT);
    return s;
  };

  it('a route that ends at the destination is accepted', async () => {
    const { c } = withProvider(() => route([OUT, N1, N2, N3]));
    expect(await c.requestLive()).toBe(true);
    expect(c.getState().phase).toBe('live');
  });

  it('a well-formed route that ends somewhere else cannot start Live or arrive', async () => {
    const wrongEnd = offset(OUT, 5, 0);
    const { c, L } = withProvider(() => route([OUT, wrongEnd]));
    expect(await c.requestLive()).toBe(false);
    expect(c.getState()).toMatchObject({ phase: 'preview', liveAttempt: { blocker: 'no_route' } });
    expect(L.starts).toBe(0);
  });

  it('a route that starts away from the walker is refused', async () => {
    const { c } = withProvider(() => route([offset(OUT, 0, 400), N1, N2, N3]));
    expect(await c.requestLive()).toBe(false);
    expect(c.getState().liveAttempt.blocker).toBe('no_route');
  });

  it('a wrong-ending replacement during a reroute is not adopted', async () => {
    let calls = 0;
    const { c } = withProvider(() => (calls++ === 0 ? route([OUT, N1, N2, N3]) : route([offset(OUT, 20, 60), offset(OUT, 25, 60)])));
    await c.requestLive();
    const first = c.getState().route;
    expect(c.requestReroute()).toBe(true);
    await flush();
    expect(calls).toBe(2);
    expect(c.getState().route).toBe(first);
    expect(c.getState().live).toMatchObject({ notice: 'kept_route' });
  });
});
