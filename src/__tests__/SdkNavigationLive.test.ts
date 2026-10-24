import {
  createNavigationController,
  findBestVenuePath,
  LIVE_ORIGIN_ID,
  type LiveFixCoordinate,
  type LocationPermissionInput,
  type NavigationControllerOptions,
  type NavigationLocationAdapter,
  type VenueCoordinate,
  type VenueEdge,
  type VenueRoute,
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
const now = () => t;
const fix = (p: VenueCoordinate, over: Partial<LiveFixCoordinate> = {}): LiveFixCoordinate =>
  ({ latitude: p.lat, longitude: p.lng, accuracy: 5, observedAtMs: t, ...over });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const FINE: LocationPermissionInput = { granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' };
const DENIED: LocationPermissionInput = { granted: false, canAskAgain: true, precision: 'none', servicesState: 'enabled' };

interface FakeLocation extends NavigationLocationAdapter {
  permission: LocationPermissionInput;
  afterPrompt: LocationPermissionInput | null;
  prompts: number;
  currentFix: LiveFixCoordinate | null;
  watching: number;
  watchStarts: number;
  emit: (fix: LiveFixCoordinate) => void;
}
const makeLocation = (): FakeLocation => {
  const L: FakeLocation = {
    permission: FINE,
    afterPrompt: null,
    prompts: 0,
    currentFix: null,
    watching: 0,
    watchStarts: 0,
    emit: () => {},
    getPermission: async () => L.permission,
    requestPermission: async () => {
      L.prompts += 1;
      if (L.afterPrompt) L.permission = L.afterPrompt;
      return L.permission;
    },
    getCurrentFix: async () => L.currentFix,
    watch: (onFix) => {
      L.watching += 1;
      L.watchStarts += 1;
      L.emit = onFix;
      return () => {
        L.watching -= 1;
        L.emit = () => {};
      };
    },
  };
  return L;
};

const countingFinder = () => {
  const calls: Array<{ startIds: readonly string[]; goalIds: readonly string[] }> = [];
  const findRoute: NavigationControllerOptions['findRoute'] = ({ graph, startIds, goalIds }) => {
    calls.push({ startIds, goalIds });
    return findBestVenuePath(graph, startIds, goalIds);
  };
  return { calls, findRoute };
};

// Routes normally for the live start itself, then hands every later search (reroutes) to `replacement`.
const finderAfterStart = (replacement: NonNullable<NavigationControllerOptions['findRoute']>) => {
  let started = false;
  const findRoute: NonNullable<NavigationControllerOptions['findRoute']> = (input) =>
    started ? replacement(input) : findBestVenuePath(input.graph, input.startIds, input.goalIds);
  return { findRoute, markStarted: () => { started = true; } };
};

const setup = (extra: Partial<NavigationControllerOptions> = {}) => {
  t = T0;
  const L = makeLocation();
  L.currentFix = fix(offset(N1, 3, 0));
  const c = createNavigationController({ venue: testVenue, location: L, now, ...extra });
  return { c, L };
};
const goLive = async (extra: Partial<NavigationControllerOptions> = {}) => {
  const s = setup(extra);
  s.c.selectDestination('annex');
  expect(await s.c.requestLive()).toBe(true);
  return s;
};
// One watcher fix `dtMs` after the previous one.
const walk = (L: FakeLocation, p: VenueCoordinate, dtMs = 4_000, over: Partial<LiveFixCoordinate> = {}) => {
  t += dtMs;
  L.emit(fix(p, over));
};
const offRoute = (L: FakeLocation) => {
  walk(L, offset(N1, 10, 48));
  walk(L, offset(N1, 10, 56));
  walk(L, offset(N1, 10, 64));
};

describe('requestLive: the explicit live start', () => {
  it('starts live navigation from a fresh precise fix, re-routing from where the walker stands', async () => {
    const { c, L } = setup();
    c.selectDestination('annex');
    expect(c.getState().presentation).toBe('NEEDS_START');
    expect(await c.requestLive()).toBe(true);
    const s = c.getState();
    expect(s).toMatchObject({
      phase: 'live', originSource: 'live_gps', originId: LIVE_ORIGIN_ID, presentation: 'ACTIVE_NAVIGATION',
      liveAttempt: { status: 'idle', blocker: null },
    });
    expect(s.route!.nodeIds).toEqual(['n/1', 'n/2', 'n/3']);
    expect(s.live).toMatchObject({ signal: 'good', rerouting: false, notice: null });
    expect(s.live!.progressM).toBeGreaterThan(2);
    expect(L.watching).toBe(1);
    expect(L.prompts).toBe(0);
  });

  it('upgrades a Manual Guide only when asked, restarting the guide from the live position', async () => {
    const { c, L } = setup();
    c.selectDestination('annex');
    c.selectOrigin('hall');
    c.startGuide();
    c.nextStep();
    expect(L.watching).toBe(0);
    expect(await c.requestLive()).toBe(true);
    expect(c.getState()).toMatchObject({ phase: 'live', stepIndex: 0, originSource: 'live_gps' });
  });

  it('a guide never goes live by itself: fixes and permission changes are inert without an explicit request', () => {
    const { c, L } = setup();
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.startGuide();
    const before = c.getState();
    L.emit(fix(N1));
    c.ingestFix(fix(offset(N1, 20, 0)));
    c.tick();
    expect(c.getState()).toBe(before);
    expect(L.watchStarts).toBe(0);
  });

  it('waits for a pending route instead of superseding it', async () => {
    const { c, L } = setup({ findRoute: () => new Promise(() => {}) });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    expect(c.getState().loadState).toBe('loading');
    expect(await c.requestLive()).toBe(false);
    expect(c.getState()).toMatchObject({ loadState: 'loading', liveAttempt: { status: 'blocked', blocker: 'route_pending' } });
    expect(L.prompts).toBe(0);
  });

  it('is a no-op that reports false without a destination, and true when already live', async () => {
    const { c, L } = setup();
    expect(await c.requestLive()).toBe(false);
    expect(c.getState().liveAttempt).toEqual({ status: 'idle', blocker: null });
    c.selectDestination('annex');
    expect(await c.requestLive()).toBe(true);
    const before = c.getState();
    expect(await c.requestLive()).toBe(true);
    expect(c.getState()).toBe(before);
    expect(L.watchStarts).toBe(1);
  });

  describe('permission and capability', () => {
    it('asks for permission only because the user asked, then continues when it is granted', async () => {
      const { c, L } = setup();
      L.permission = DENIED;
      L.afterPrompt = FINE;
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(true);
      expect(L.prompts).toBe(1);
    });

    it('a denied prompt blocks live, starts nothing and is never retried implicitly', async () => {
      const { c, L } = setup();
      L.permission = DENIED;
      c.selectDestination('annex');
      c.selectOrigin('lobby');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState()).toMatchObject({ phase: 'preview', liveAttempt: { status: 'blocked', blocker: 'permission_needed' } });
      expect(L.prompts).toBe(1);
      expect(L.watchStarts).toBe(0);
      c.selectOrigin('hall'); // other activity must not re-prompt
      c.startGuide();
      expect(L.prompts).toBe(1);
      expect(c.getState().phase).toBe('guide');
    });

    it('a permission that cannot be asked again is reported as blocked in settings', async () => {
      const { c, L } = setup();
      L.permission = { ...DENIED, canAskAgain: false };
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState().liveAttempt.blocker).toBe('permission_blocked');
    });

    it.each([
      ['approximate location', { permission: { ...FINE, precision: 'coarse' as const } }, 'approximate_only'],
      ['unread precision', { permission: { ...FINE, precision: 'none' as const } }, 'precision_unknown'],
      ['location services off', { permission: { ...FINE, servicesState: 'disabled' as const } }, 'services_off'],
      ['no fix', { currentFix: null }, 'no_fix'],
      ['a weak fix (80 m)', { currentFix: fix(N1, { accuracy: 80 }) }, 'weak_fix'],
      ['a stale fix (31 s old)', { currentFix: fix(N1, { observedAtMs: T0 - 31_000 }) }, 'stale_fix'],
      ['a fix with no timestamp', { currentFix: fix(N1, { observedAtMs: undefined }) }, 'stale_fix'],
      ['a fix from the future', { currentFix: fix(N1, { observedAtMs: T0 + 5_000 }) }, 'stale_fix'],
    ])('%s blocks live and leaves the journey alone', async (_name, patch, blocker) => {
      const { c, L } = setup();
      Object.assign(L, patch);
      c.selectDestination('annex');
      c.selectOrigin('lobby');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState()).toMatchObject({ phase: 'preview', loadState: 'ready', liveAttempt: { status: 'blocked', blocker } });
      expect(L.watchStarts).toBe(0);
    });

    it('an adapter that throws blocks live instead of crashing', async () => {
      const { c, L } = setup();
      L.getCurrentFix = async () => { throw new Error('provider unavailable'); };
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState().liveAttempt).toEqual({ status: 'blocked', blocker: 'no_fix' });
    });

    it('without a location adapter live is unsupported', async () => {
      const c = createNavigationController({ venue: testVenue });
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState().liveAttempt.blocker).toBe('unsupported');
    });

    it('a location adapter without a clock is a programming error', () => {
      expect(() => createNavigationController({ venue: testVenue, location: makeLocation() })).toThrow(/clock/);
    });
  });

  describe('where the fix is', () => {
    it('a fix far outside the venue cannot start live', async () => {
      const { c, L } = setup();
      L.currentFix = fix(offset(N1, 1_500, 0));
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState().liveAttempt.blocker).toBe('outside_venue');
    });

    it('the snap radius is configurable', async () => {
      const { c, L } = setup({ maxLiveSnapDistanceM: 500 });
      L.currentFix = fix(offset(N1, -300, 0));
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(true);
    });

    it('standing at the destination is reported rather than routed', async () => {
      const { c, L } = setup();
      L.currentFix = fix(offset(N3, 2, 0));
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState().liveAttempt.blocker).toBe('already_at_destination');
    });

    it('no route from the snapped node is reported as no_route', async () => {
      const { c, L } = setup();
      L.currentFix = fix(testVenue.graph.getNode('island')!.coordinate);
      c.selectDestination('annex');
      expect(await c.requestLive()).toBe(false);
      expect(c.getState().liveAttempt.blocker).toBe('no_route');
    });
  });

  describe('stale asynchronous results', () => {
    it('Exit while the fix is pending: the late fix starts nothing', async () => {
      const { c, L } = setup();
      let release!: (f: LiveFixCoordinate | null) => void;
      L.getCurrentFix = () => new Promise((resolve) => { release = resolve; });
      c.selectDestination('annex');
      const pending = c.requestLive();
      await flush();
      expect(c.getState().liveAttempt.status).toBe('requesting');
      c.exit();
      release(fix(N1));
      expect(await pending).toBe(false);
      expect(c.getState().phase).toBe('browsing');
      expect(L.watchStarts).toBe(0);
    });

    it('a new destination while the fix is pending: the late fix starts nothing', async () => {
      const { c, L } = setup();
      let release!: (f: LiveFixCoordinate | null) => void;
      L.getCurrentFix = () => new Promise((resolve) => { release = resolve; });
      c.selectDestination('annex');
      const pending = c.requestLive();
      await flush();
      c.selectDestination('hall');
      release(fix(N1));
      expect(await pending).toBe(false);
      expect(c.getState()).toMatchObject({ phase: 'preview', destinationId: 'hall' });
      expect(L.watchStarts).toBe(0);
    });

    it('a trip that has ended does no further routing work for the late fix', async () => {
      const f = countingFinder();
      const { c, L } = setup({ findRoute: f.findRoute });
      let release!: (f: LiveFixCoordinate | null) => void;
      L.getCurrentFix = () => new Promise((resolve) => { release = resolve; });
      c.selectDestination('annex');
      const pending = c.requestLive();
      await flush();
      c.selectDestination('hall'); // a new trip: the pending request belongs to the old one
      release(fix(N1));
      await pending;
      expect(f.calls).toHaveLength(0);
    });

    it('a second request supersedes the first, which can no longer commit', async () => {
      const { c, L } = setup();
      const releases: Array<(f: LiveFixCoordinate | null) => void> = [];
      L.getCurrentFix = () => new Promise((resolve) => { releases.push(resolve); });
      c.selectDestination('annex');
      const first = c.requestLive();
      await flush();
      const second = c.requestLive();
      await flush();
      releases[1](fix(N1));
      releases[0](fix(N1));
      expect([await first, await second]).toEqual([false, true]);
      expect(L.watchStarts).toBe(1);
    });

    it('a late route result after Exit never goes live', async () => {
      let settle!: (r?: VenueRoute<VenueEdge>) => void;
      const { c, L } = setup({ findRoute: () => new Promise((resolve) => { settle = resolve; }) });
      c.selectDestination('annex');
      const pending = c.requestLive();
      await flush();
      await flush();
      c.exit();
      settle(findBestVenuePath(testVenue.graph, ['n/1'], ['n/3']));
      expect(await pending).toBe(false);
      expect(c.getState().phase).toBe('browsing');
      expect(L.watchStarts).toBe(0);
    });
  });
});

describe('ingestFix: live progress', () => {
  it('advances progress, remaining distance, the active step and the maneuver distance', async () => {
    const { c, L } = await goLive();
    walk(L, offset(N1, 40, 0));
    expect(c.getState().live!.progressM).toBeGreaterThan(39);
    expect(c.getState().stepIndex).toBe(0);
    expect(c.getState().live!.maneuverDistanceM).toBeLessThan(17);
    walk(L, offset(N2, 0, 5));
    expect(c.getState().stepIndex).toBe(1); // past the corner: the right turn step
    expect(c.getState().live!.remainingM).toBeLessThan(60);
  });

  it('arrival is latched: the route completes, the watcher stops and later fixes are ignored', async () => {
    const { c, L } = await goLive();
    walk(L, offset(N1, 40, 0));
    walk(L, N2);
    walk(L, offset(N2, 0, 40));
    expect(c.getState().phase).toBe('live');
    walk(L, N3);
    const arrived = c.getState();
    expect(arrived).toMatchObject({ phase: 'arrived', presentation: 'ARRIVED' });
    expect(arrived.route).not.toBeNull();
    expect(L.watching).toBe(0);
    c.ingestFix(fix(offset(N1, 30, 90))); // a noisy fix after arrival must not undo it
    expect(c.getState()).toBe(arrived);
  });

  it('a fix cached before the watcher started is ignored entirely', async () => {
    const { c, L } = await goLive();
    const before = c.getState();
    walk(L, offset(N1, 30, 0), 4_000, { observedAtMs: T0 - 5_000 });
    expect(c.getState()).toBe(before);
    walk(L, offset(N1, 30, 0), 0, { observedAtMs: T0 - 1_500 }); // within the clock tolerance: genuine
    expect(c.getState()).not.toBe(before);
  });

  it('counts one physical observation once', async () => {
    const { c, L } = await goLive();
    walk(L, offset(N1, 10, 48));
    const once = c.getState();
    L.emit(fix(offset(N1, 10, 48), { observedAtMs: t }));
    expect(c.getState()).toBe(once);
  });

  it('a weak fix shows weak GPS without moving the walker; a good fix restores it', async () => {
    const { c, L } = await goLive();
    const progress = c.getState().live!.progressM;
    walk(L, offset(N1, 30, 0), 4_000, { accuracy: 70 });
    expect(c.getState().live).toMatchObject({ signal: 'weak', progressM: progress });
    walk(L, offset(N1, 30, 0));
    expect(c.getState().live!.signal).toBe('good');
  });

  it('a fix without a timestamp cannot establish freshness: GPS is treated as lost', async () => {
    const { c, L } = await goLive();
    walk(L, offset(N1, 30, 0), 4_000, { observedAtMs: undefined });
    expect(c.getState().live!.signal).toBe('lost');
  });

  it('GPS is lost after eight seconds without a fix and recovers on the next one', async () => {
    const { c, L } = await goLive();
    t += 7_999;
    c.tick();
    expect(c.getState().live!.signal).toBe('good');
    t += 1;
    c.tick();
    expect(c.getState().live!.signal).toBe('lost');
    const lost = c.getState();
    c.tick();
    expect(c.getState()).toBe(lost); // no churn
    walk(L, offset(N1, 20, 0), 0);
    expect(c.getState().live!.signal).toBe('good');
  });

  it('fixes outside the live phase are ignored', () => {
    const { c } = setup();
    c.selectDestination('annex');
    const before = c.getState();
    c.ingestFix(fix(N1));
    expect(c.getState()).toBe(before);
  });
});

describe('rerouting', () => {
  it('three off-route fixes with real movement reroute from the nearest node and announce it', async () => {
    const f = countingFinder();
    const { c, L } = await goLive({ findRoute: f.findRoute });
    f.calls.length = 0;
    offRoute(L);
    await flush();
    const s = c.getState();
    expect(f.calls).toHaveLength(1);
    expect(s.route!.nodeIds).toEqual(['n/4', 'n/3']);
    expect(s).toMatchObject({ phase: 'live', stepIndex: 0, live: { rerouting: false, notice: 'rerouted' } });
  });

  it('does not reroute for jitter: two off-route fixes, or one stationary off-route fix, are not enough', async () => {
    const f = countingFinder();
    const { L } = await goLive({ findRoute: f.findRoute });
    f.calls.length = 0;
    walk(L, offset(N1, 10, 48));
    walk(L, offset(N1, 10, 56));
    await flush();
    expect(f.calls).toHaveLength(0);
  });

  it('honours the cooldown, then allows another reroute', async () => {
    const f = countingFinder();
    const { L } = await goLive({ findRoute: f.findRoute });
    f.calls.length = 0;
    offRoute(L);
    await flush();
    expect(f.calls).toHaveLength(1);
    walk(L, offset(N1, 28, 0));
    walk(L, offset(N1, 28, -8));
    walk(L, offset(N1, 28, -16));
    await flush();
    expect(f.calls).toHaveLength(1); // inside the 25 s cooldown
    t += 30_000;
    walk(L, offset(N1, 28, -30));
    walk(L, offset(N1, 28, -38));
    walk(L, offset(N1, 28, -46));
    await flush();
    expect(f.calls).toHaveLength(2);
  });

  it('keeps the current route, and says so, when no better route is found', async () => {
    const f = finderAfterStart(() => undefined);
    const { c, L } = await goLive({ findRoute: f.findRoute });
    f.markStarted();
    const route = c.getState().route;
    offRoute(L);
    await flush();
    expect(c.getState().route).toBe(route);
    expect(c.getState().live).toMatchObject({ rerouting: false, notice: 'kept_route' });
  });

  it('keeps the current route when the finder throws', async () => {
    const f = finderAfterStart(() => { throw new Error('boom'); });
    const { c, L } = await goLive({ findRoute: f.findRoute });
    f.markStarted();
    const route = c.getState().route;
    offRoute(L);
    await flush();
    expect(c.getState().route).toBe(route);
    expect(c.getState().live!.notice).toBe('kept_route');
  });

  it('autoReroute false never reroutes on its own', async () => {
    const f = countingFinder();
    const { L } = await goLive({ findRoute: f.findRoute, autoReroute: false });
    f.calls.length = 0;
    offRoute(L);
    await flush();
    expect(f.calls).toHaveLength(0);
  });

  it('never has two reroutes in flight', async () => {
    const calls: Array<() => void> = [];
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = ({ graph, startIds, goalIds }) => {
      if (phase === 0) return findBestVenuePath(graph, startIds, goalIds);
      return new Promise((resolve) => { calls.push(() => resolve(findBestVenuePath(graph, startIds, goalIds))); });
    };
    const { c, L } = await goLive({ findRoute });
    phase = 1;
    offRoute(L);
    expect(calls).toHaveLength(1);
    expect(c.getState().live!.rerouting).toBe(true);
    walk(L, offset(N1, 12, 50));
    walk(L, offset(N1, 12, 58));
    walk(L, offset(N1, 12, 66));
    expect(calls).toHaveLength(1);
    calls[0]();
    await flush();
    expect(c.getState().live).toMatchObject({ rerouting: false, notice: 'rerouted' });
  });

  it('a reroute that finishes after Exit is dropped', async () => {
    let settle!: (r?: VenueRoute<VenueEdge>) => void;
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = ({ graph, startIds, goalIds }) => {
      if (phase === 0) return findBestVenuePath(graph, startIds, goalIds); // the live start
      return new Promise((resolve) => { settle = resolve; });
    };
    const { c, L } = await goLive({ findRoute });
    phase = 1;
    offRoute(L);
    expect(c.getState().live!.rerouting).toBe(true);
    c.exit();
    settle(findBestVenuePath(testVenue.graph, ['n/4'], ['n/3']));
    await flush();
    expect(c.getState()).toMatchObject({ phase: 'browsing', route: null });
  });

  it('a reroute that finishes after arrival can never replace the completed route (A5-02)', async () => {
    let settle!: (r?: VenueRoute<VenueEdge>) => void;
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = ({ graph, startIds, goalIds }) => {
      if (phase === 0) return findBestVenuePath(graph, startIds, goalIds);
      return new Promise((resolve) => { settle = resolve; });
    };
    const { c, L } = await goLive({ findRoute });
    phase = 1;
    offRoute(L);
    expect(c.getState().live!.rerouting).toBe(true);
    walk(L, N3); // arrives while the reroute is still computing
    const route = c.getState().route;
    expect(c.getState().phase).toBe('arrived');
    settle(findBestVenuePath(testVenue.graph, ['n/4'], ['n/3']));
    await flush();
    expect(c.getState()).toMatchObject({ phase: 'arrived' });
    expect(c.getState().route).toBe(route);
  });
});

describe('lifecycle', () => {
  it('choosing another destination from live ends live, stops the watcher and asks for a start again', async () => {
    const { c, L } = await goLive();
    c.selectDestination('hall');
    expect(L.watching).toBe(0);
    expect(c.getState()).toMatchObject({ phase: 'preview', destinationId: 'hall', originId: null, originSource: null, live: null, loadState: 'needs_origin' });
  });

  it('a manual origin cannot be chosen mid-live or after arrival', async () => {
    const { c } = await goLive();
    const live = c.getState();
    c.selectOrigin('hall');
    expect(c.getState()).toBe(live);
  });

  it('Exit stops the watcher and clears the trip', async () => {
    const { c, L } = await goLive();
    c.exit();
    expect(L.watching).toBe(0);
    expect(c.getState()).toMatchObject({ phase: 'browsing', live: null, route: null, originSource: null });
  });

  it('dispose stops the watcher', async () => {
    const { c, L } = await goLive();
    c.dispose();
    expect(L.watching).toBe(0);
  });

  it('resume restarts the watcher and rejects fixes cached while backgrounded', async () => {
    const { c, L } = await goLive();
    t += 60_000;
    await c.resume();
    expect(L.watchStarts).toBe(2);
    expect(L.watching).toBe(1);
    const before = c.getState();
    L.emit(fix(offset(N1, 30, 0), { observedAtMs: t - 10_000 })); // Play Services' cached last-known fix
    expect(c.getState()).toBe(before);
    L.emit(fix(offset(N1, 30, 0)));
    expect(c.getState().live!.progressM).toBeGreaterThan(29);
  });

  it('resume with permission revoked keeps the journey but freezes live: no progress, GPS lost', async () => {
    const { c, L } = await goLive();
    t += 5_000;
    L.permission = DENIED;
    await c.resume();
    const s = c.getState();
    expect(s).toMatchObject({ phase: 'live', live: { signal: 'lost' } });
    const progress = s.live!.progressM;
    c.ingestFix(fix(offset(N1, 30, 0))); // even a fresh fix cannot move a walker whose permission is gone
    expect(c.getState().live).toMatchObject({ signal: 'lost', progressM: progress });
    expect(L.prompts).toBe(0); // resuming never prompts
  });

  it('resume outside live does nothing', async () => {
    const { c, L } = setup();
    c.selectDestination('annex');
    const before = c.getState();
    await c.resume();
    expect(c.getState()).toBe(before);
    expect(L.watchStarts).toBe(0);
  });
});

// The guard rails the brief calls out, in one place.
describe('safety invariants', () => {
  it('no implicit Live start after permission denial, across every other action', async () => {
    const { c, L } = setup();
    L.permission = DENIED;
    c.selectDestination('annex');
    await c.requestLive();
    c.selectOrigin('lobby');
    c.startGuide();
    c.nextStep();
    c.tick();
    await c.resume();
    expect(L.watchStarts).toBe(0);
    expect(c.getState().phase).toBe('guide');
  });

  it('every live-start blocker keeps the previous valid route and phase', async () => {
    const { c, L } = setup();
    L.currentFix = fix(N1, { accuracy: 80 });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.startGuide();
    const route = c.getState().route;
    expect(await c.requestLive()).toBe(false);
    expect(c.getState()).toMatchObject({ phase: 'guide', liveAttempt: { blocker: 'weak_fix' } });
    expect(c.getState().route).toBe(route);
  });
});
