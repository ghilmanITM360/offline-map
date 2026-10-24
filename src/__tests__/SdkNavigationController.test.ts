import {
  createNavigationController,
  findBestVenuePath,
  type NavigationControllerOptions,
  type VenueDataSource,
  type VenueRoute,
  type VenueEdge,
} from '@muslim-ummah/offline-navigation';
import { testVenue } from './sdkTestVenue';

const venue: VenueDataSource = testVenue;

const make = (extra: Partial<NavigationControllerOptions> = {}) => createNavigationController({ venue, ...extra });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Deferred = { startIds: readonly string[]; goalIds: readonly string[]; signal: AbortSignal; settle: (route?: VenueRoute<VenueEdge>) => void; fail: (e: Error) => void };
const deferredFinder = () => {
  const calls: Deferred[] = [];
  const findRoute: NavigationControllerOptions['findRoute'] = (input) =>
    new Promise((resolve, reject) => {
      calls.push({ ...input, settle: resolve, fail: reject });
    });
  const real = (call: Deferred) => findBestVenuePath(venue.graph, call.startIds, call.goalIds);
  return { calls, findRoute, real };
};

describe('NavigationController: planning and Manual Guide', () => {
  it('starts in browsing with no journey', () => {
    const state = make().getState();
    expect(state).toMatchObject({
      venueId: 'synthetic-test-venue', phase: 'browsing', destinationId: null, originId: null,
      route: null, error: null, sessionId: null, presentation: null, canStartGuide: false, stepIndex: 0,
    });
  });

  it('selecting a destination opens the preview and asks for a start; nothing is invented', () => {
    const c = make();
    c.selectDestination('annex');
    expect(c.getState()).toMatchObject({
      phase: 'preview', destinationId: 'annex', originId: null, route: null,
      loadState: 'needs_origin', presentation: 'NEEDS_START', canStartGuide: false,
    });
    expect(c.getState().sessionId).toBe('synthetic-test-venue#1');
  });

  it('a manual origin calculates the route and makes the guide startable', () => {
    const c = make();
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    const s = c.getState();
    expect(s).toMatchObject({ phase: 'preview', originId: 'lobby', loadState: 'ready', presentation: 'MANUAL_GUIDE_READY', canStartGuide: true });
    expect(s.route).toMatchObject({ originId: 'lobby', destinationId: 'annex', nodeIds: ['n/1', 'n/2', 'n/3'], distanceM: 117 });
    expect(s.route!.steps.map((x) => x.kind)).toEqual(['depart', 'turn_right', 'arrive']);
  });

  it('steps through the guide, clamped at both ends, and only inside the guide', () => {
    const c = make();
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    expect(c.nextStep()).toBe(false); // preview: no stepping
    expect(c.startGuide()).toBe(true);
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 0 });
    expect(c.previousStep()).toBe(false);
    expect(c.nextStep()).toBe(true);
    expect(c.nextStep()).toBe(true);
    expect(c.getState().stepIndex).toBe(2);
    expect(c.nextStep()).toBe(false);
    expect(c.previousStep()).toBe(true);
    expect(c.getState().stepIndex).toBe(1);
  });

  it('refuses to start a guide without a ready route', () => {
    const c = make();
    expect(c.startGuide()).toBe(false);
    c.selectDestination('annex');
    expect(c.startGuide()).toBe(false);
    expect(c.getState().phase).toBe('preview');
  });

  it('exit clears the journey, cancels its session and cannot be resumed by stale calls', () => {
    const c = make();
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.startGuide();
    c.exit();
    expect(c.getState()).toMatchObject({ phase: 'browsing', destinationId: null, originId: null, route: null, sessionId: null, stepIndex: 0 });
    expect(c.nextStep()).toBe(false);
    expect(c.startGuide()).toBe(false);
    c.exit(); // idempotent
    expect(c.getState().phase).toBe('browsing');
  });

  it('a new trip gets a fresh session id', () => {
    const c = make();
    c.selectDestination('annex');
    const first = c.getState().sessionId;
    c.exit();
    c.selectDestination('annex');
    expect(c.getState().sessionId).not.toBe(first);
  });

  it('uses the injected session id factory', () => {
    const ids = ['trip-a', 'trip-b'];
    const c = make({ createSessionId: () => ids.shift()! });
    c.selectDestination('annex');
    expect(c.getState().sessionId).toBe('trip-a');
  });

  it('changing the destination keeps the origin, recalculates, leaves the guide and starts a new session', () => {
    const c = make();
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.startGuide();
    c.nextStep();
    const before = c.getState().sessionId;
    c.selectDestination('hall');
    const s = c.getState();
    expect(s).toMatchObject({ phase: 'preview', destinationId: 'hall', originId: 'lobby', loadState: 'ready', stepIndex: 0 });
    expect(s.route).toMatchObject({ originId: 'lobby', destinationId: 'hall' });
    expect(s.sessionId).not.toBe(before);
  });

  it('origin equal to the destination, or sharing its node, is the same place: no route, no guide', () => {
    const c = make();
    c.selectDestination('lobby');
    c.selectOrigin('lobby');
    expect(c.getState()).toMatchObject({ loadState: 'same_place', presentation: 'SAME_PLACE', route: null, canStartGuide: false });
    c.selectOrigin('lobby2'); // different place, same graph node
    expect(c.getState()).toMatchObject({ loadState: 'same_place', route: null });
    expect(c.startGuide()).toBe(false);
  });

  it('an unreachable pair is a no_route failure with no stale route left behind', () => {
    const c = make();
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    expect(c.getState().route).not.toBeNull();
    c.selectOrigin('isle');
    expect(c.getState()).toMatchObject({ loadState: 'error', error: 'no_route', presentation: 'ROUTE_FAILURE', route: null, canStartGuide: false });
    c.selectOrigin('lobby'); // recoverable
    expect(c.getState()).toMatchObject({ loadState: 'ready', error: null });
  });

  it('unknown place ids are reported in state, never thrown', () => {
    const c = make();
    expect(() => c.selectDestination('nope')).not.toThrow();
    expect(c.getState()).toMatchObject({ phase: 'browsing', error: 'unknown_place', destinationId: null });
    c.selectDestination('annex');
    expect(() => c.selectOrigin('__proto__')).not.toThrow();
    expect(c.getState()).toMatchObject({ loadState: 'error', error: 'unknown_place' });
  });

  it('an unknown destination during a journey does not disturb the journey', () => {
    const c = make();
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.selectDestination('nope');
    expect(c.getState()).toMatchObject({ destinationId: 'annex', loadState: 'ready', error: 'unknown_place' });
  });

  it('getState is referentially stable until something changes; subscribers are notified once per change', () => {
    const c = make();
    const seen: string[] = [];
    const off = c.subscribe(() => seen.push(c.getState().phase));
    expect(c.getState()).toBe(c.getState());
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.startGuide();
    off();
    c.exit();
    expect(seen).toEqual(['preview', 'preview', 'guide']);
  });

  it('dispose silences listeners and ignores later calls', () => {
    const c = make();
    const listener = jest.fn();
    c.subscribe(listener);
    c.dispose();
    c.selectDestination('annex');
    expect(listener).not.toHaveBeenCalled();
    expect(c.getState().phase).toBe('browsing');
    expect(() => c.dispose()).not.toThrow();
  });
});

describe('NavigationController: asynchronous route calculation is deterministic', () => {
  it('shows loading while pending, then commits the result', async () => {
    const f = deferredFinder();
    const c = make({ findRoute: f.findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    expect(c.getState()).toMatchObject({ loadState: 'loading', presentation: 'CALCULATING', canStartGuide: false });
    f.calls[0].settle(f.real(f.calls[0]));
    await flush();
    expect(c.getState()).toMatchObject({ loadState: 'ready', canStartGuide: true });
  });

  it('a superseded origin result can never commit', async () => {
    const f = deferredFinder();
    const c = make({ findRoute: f.findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.selectOrigin('hall');
    expect(f.calls[0].signal.aborted).toBe(true);
    f.calls[1].settle(f.real(f.calls[1]));
    await flush();
    f.calls[0].settle(f.real(f.calls[0])); // late and stale
    await flush();
    expect(c.getState()).toMatchObject({ originId: 'hall', loadState: 'ready' });
    expect(c.getState().route!.originId).toBe('hall');
  });

  it('a result that arrives after Exit is dropped', async () => {
    const f = deferredFinder();
    const c = make({ findRoute: f.findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    const listener = jest.fn();
    c.subscribe(listener);
    c.exit();
    listener.mockClear();
    f.calls[0].settle(f.real(f.calls[0]));
    await flush();
    expect(c.getState()).toMatchObject({ phase: 'browsing', route: null });
    expect(listener).not.toHaveBeenCalled();
  });

  it('a result for the previous destination is dropped after the destination changes', async () => {
    const f = deferredFinder();
    const c = make({ findRoute: f.findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.selectDestination('hall');
    f.calls[1].settle(f.real(f.calls[1]));
    await flush();
    f.calls[0].settle(f.real(f.calls[0]));
    await flush();
    expect(c.getState().route).toMatchObject({ destinationId: 'hall' });
  });

  it('a result that arrives after dispose is dropped', async () => {
    const f = deferredFinder();
    const c = make({ findRoute: f.findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.dispose();
    f.calls[0].settle(f.real(f.calls[0]));
    await flush();
    expect(c.getState().route).toBeNull();
  });

  it('a finder that rejects becomes route_failed and the next origin recovers', async () => {
    const f = deferredFinder();
    const c = make({ findRoute: f.findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    f.calls[0].fail(new Error('pack unreadable'));
    await flush();
    expect(c.getState()).toMatchObject({ loadState: 'error', error: 'route_failed', route: null });
    c.selectOrigin('hall');
    f.calls[1].settle(f.real(f.calls[1]));
    await flush();
    expect(c.getState()).toMatchObject({ loadState: 'ready', error: null });
  });

  it('a synchronous finder that throws becomes route_failed', () => {
    const c = make({ findRoute: () => { throw new Error('boom'); } });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    expect(c.getState()).toMatchObject({ loadState: 'error', error: 'route_failed' });
  });

  it('a rejection from a superseded request is swallowed, not surfaced', async () => {
    const f = deferredFinder();
    const c = make({ findRoute: f.findRoute });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    c.selectOrigin('hall');
    f.calls[0].fail(new Error('late failure'));
    f.calls[1].settle(f.real(f.calls[1]));
    await flush();
    expect(c.getState()).toMatchObject({ loadState: 'ready', error: null });
  });
});
