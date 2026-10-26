import React, { useImperativeHandle } from 'react';
import { Dimensions, Platform, View } from 'react-native';
import { act, fireEvent, render, screen, within } from './test-utils';
import {
  createNavigationController,
  findBestVenuePath,
  type LiveFixCoordinate,
  type LocationPermissionInput,
  type NavigationController,
  type NavigationControllerOptions,
  type NavigationLocationAdapter,
  type VenueCoordinate,
  type VenueEdge,
  type VenuePlace,
  type VenueRoute,
} from '@muslim-ummah/offline-navigation';
import {
  createDefaultNavigationTheme,
  ENGLISH_NAVIGATION_SCREEN_COPY,
  NavigationProvider,
  NavigationScreen,
  type NavigationMapProps,
  type NavigationScreenCopy,
  HEADING_MAX_FONT_SCALE,
  type NavigationScreenProps,
} from '@muslim-ummah/offline-navigation/ui';
import { testVenue } from './sdkTestVenue';

// Everything below is SIMULATION: a real SDK controller over the synthetic venue, driven by a fake location adapter
// and an injected clock. It proves the screen's wiring in Jest; it says nothing about real GPS, MapLibre or a device.

const copy = ENGLISH_NAVIGATION_SCREEN_COPY;
const M_PER_DEG = 111_320;
const offset = (from: VenueCoordinate, northM: number, eastM: number): VenueCoordinate => ({
  lat: from.lat + northM / M_PER_DEG,
  lng: from.lng + eastM / (M_PER_DEG * Math.cos((from.lat * Math.PI) / 180)),
});
const N1 = testVenue.graph.getNode('n/1')!.coordinate;
const N3 = testVenue.graph.getNode('n/3')!.coordinate;

const T0 = 1_000_000;
let t = T0;
const now = () => t;
const fixAt = (p: VenueCoordinate, over: Partial<LiveFixCoordinate> = {}): LiveFixCoordinate =>
  ({ latitude: p.lat, longitude: p.lng, accuracy: 5, observedAtMs: t, ...over });

const FINE: LocationPermissionInput = { granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' };
const BLOCKED: LocationPermissionInput = { granted: false, canAskAgain: false, precision: 'none', servicesState: 'enabled' };

interface SimulatedLocation extends NavigationLocationAdapter {
  permission: LocationPermissionInput;
  currentFix: LiveFixCoordinate | null;
  permissionReads: number;
  prompts: number;
  watching: number;
  emit: (fix: LiveFixCoordinate) => void;
}
const simulatedLocation = (): SimulatedLocation => {
  const L: SimulatedLocation = {
    permission: FINE,
    currentFix: fixAt(offset(N1, 3, 0)),
    permissionReads: 0,
    prompts: 0,
    watching: 0,
    emit: () => {},
    getPermission: async () => { L.permissionReads += 1; return L.permission; },
    requestPermission: async () => { L.prompts += 1; return L.permission; },
    getCurrentFix: async () => L.currentFix,
    watch: (onFix) => {
      L.watching += 1;
      L.emit = onFix;
      return () => { L.watching -= 1; L.emit = () => {}; };
    },
  };
  return L;
};
const walk = async (L: SimulatedLocation, p: VenueCoordinate, dtMs = 4_000) => {
  t += dtMs;
  await act(async () => L.emit(fixAt(p)));
};
const offRoute = async (L: SimulatedLocation) => {
  await walk(L, offset(N1, 10, 48));
  await walk(L, offset(N1, 10, 56));
  await walk(L, offset(N1, 10, 64));
};

type Deferred = { startIds: readonly string[]; goalIds: readonly string[]; settle: (route?: VenueRoute<VenueEdge>) => void };
const deferredFinder = () => {
  const calls: Deferred[] = [];
  const findRoute: NavigationControllerOptions['findRoute'] = (input) =>
    new Promise((resolve) => { calls.push({ ...input, settle: resolve }); });
  const real = (call: Deferred) => findBestVenuePath(testVenue.graph, call.startIds, call.goalIds);
  return { calls, findRoute, real };
};

const TITLES: Record<string, string> = { lobby: 'Main Lobby', annex: 'Annex Wing', hall: 'Grand Hall', isle: 'Island Office' };
const describePlace = (place: VenuePlace) =>
  place.id === 'lobby2' ? null : { title: TITLES[place.id] ?? place.id, subtitle: place.id === 'hall' ? 'Level 2' : undefined };

let mapProps: NavigationMapProps | null = null;
let recenters = 0;
function FakeMap(props: NavigationMapProps) {
  mapProps = props;
  useImperativeHandle(props.ref, () => ({ recenter: () => { recenters += 1; } }), []);
  return <View testID="fake-map" />;
}

const ctrl = (extra: Partial<NavigationControllerOptions> = {}) => createNavigationController({ venue: testVenue, now, ...extra });
const tree = (c: NavigationController, props: Partial<NavigationScreenProps> = {}) => (
  <NavigationProvider controller={c}>
    <NavigationScreen
      copy={copy}
      theme={createDefaultNavigationTheme({ isRTL: false })}
      isRTL={false}
      describePlace={describePlace}
      MapComponent={FakeMap}
      reviewLiveRoute={false}
      {...props}
    />
  </NavigationProvider>
);
const mount = async (c: NavigationController, props: Partial<NavigationScreenProps> = {}) => {
  const view = await render(tree(c, props));
  return { view, rerender: (next: Partial<NavigationScreenProps> = {}) => view.rerender(tree(c, next)) };
};
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const settle = (fn: () => void) => act(async () => { fn(); });

// Directory -> Annex Wing -> start at Main Lobby: a ready 117 m route.
const planAnnexFromLobby = async () => {
  await press('Annex Wing');
  await press(copy.trip.chooseStart);
  await press('Main Lobby');
};

beforeEach(() => {
  // react-native's jest setup starts at fontScale 2; the layout tests below choose their own scale, everything else runs at 1.
  Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } });
  t = T0;
  mapProps = null;
  recenters = 0;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('NavigationScreen: directory, search and destination', () => {
  it('mounts inside the provider on the offline directory, with a search field', async () => {
    await mount(ctrl());
    expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
    expect(screen.getByLabelText(copy.directory.searchLabel)).toBeOnTheScreen();
  });

  it('lists the destinations the controller can route to, as the host presents them', async () => {
    await mount(ctrl());
    for (const name of ['Main Lobby', 'Annex Wing', 'Island Office']) expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Grand Hall. Level 2' })).toBeOnTheScreen();
    expect(screen.queryByText('lobby2')).toBeNull(); // the host chose not to list it
  });

  it('shows the place ids when the host gives no presentation, never an invented name', async () => {
    await mount(ctrl(), { describePlace: undefined });
    expect(screen.getByRole('button', { name: 'annex' })).toBeOnTheScreen();
  });

  it('filters as the user types and says so when nothing matches', async () => {
    await mount(ctrl());
    await fireEvent.changeText(screen.getByLabelText(copy.directory.searchLabel), 'wing');
    expect(screen.getByRole('button', { name: 'Annex Wing' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Main Lobby' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(copy.directory.searchLabel), 'zzz');
    expect(screen.getByText(copy.directory.noMatches('zzz'))).toBeOnTheScreen();
  });

  it('says so when the venue has no places at all', async () => {
    const empty = createNavigationController({ venue: { ...testVenue, placeIds: () => [] } });
    await mount(empty);
    expect(screen.getByText(copy.directory.empty)).toBeOnTheScreen();
  });

  it('choosing a destination asks the controller for a trip and opens the preview', async () => {
    const c = ctrl();
    await mount(c);
    await press('Annex Wing');
    expect(c.getState()).toMatchObject({ phase: 'preview', destinationId: 'annex', loadState: 'needs_origin' });
    expect(screen.getByText(copy.trip.title('Annex Wing'))).toBeOnTheScreen();
    expect(screen.getByText(copy.trip.needsOrigin)).toBeOnTheScreen();
    expect(screen.queryByLabelText(copy.directory.searchLabel)).toBeNull();
  });

  it('Back on the directory is the host\'s call, and is not offered when the host gave none', async () => {
    const onClose = jest.fn();
    const view = await mount(ctrl(), { onClose });
    await press(copy.directory.back);
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.rerender({ onClose: undefined });
    expect(screen.queryByRole('button', { name: copy.directory.back })).toBeNull();
    expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  });
});

describe('NavigationScreen: manual origin, preview and Manual Guide', () => {
  it('choosing a start lists every other place, then previews the real route', async () => {
    const c = ctrl();
    await mount(c);
    await press('Annex Wing');
    await press(copy.trip.chooseStart);
    expect(screen.getByText(copy.directory.originTitle)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Annex Wing' })).toBeNull(); // not a start for itself
    await press('Main Lobby');
    expect(c.getState()).toMatchObject({ phase: 'preview', originId: 'lobby', loadState: 'ready', canStartGuide: true });
    expect(screen.getByText(copy.trip.summary('117 m'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.trip.changeFrom('Main Lobby') })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.trip.changeTo('Annex Wing') })).toBeOnTheScreen();
  });

  it('Back inside the start chooser returns to the preview without touching the trip', async () => {
    const c = ctrl();
    await mount(c);
    await press('Annex Wing');
    const sessionId = c.getState().sessionId;
    await press(copy.trip.chooseStart);
    await press(copy.directory.back);
    expect(screen.getByText(copy.trip.title('Annex Wing'))).toBeOnTheScreen();
    expect(c.getState()).toMatchObject({ phase: 'preview', sessionId });
  });

  it('the Manual Guide starts only from the explicit choice and steps through the real route', async () => {
    const c = ctrl();
    await mount(c);
    await planAnnexFromLobby();
    expect(c.getState().phase).toBe('preview'); // nothing started by itself
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 0 });
    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
    expect(screen.getByText('Start walking')).toBeOnTheScreen();
    expect(screen.getByText('56 m')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.guide.previousStep })).toBeDisabled();

    await press(copy.guide.nextStep);
    expect(c.getState().stepIndex).toBe(1);
    expect(screen.getByText('Turn right')).toBeOnTheScreen();
    await press(copy.guide.nextStep);
    expect(screen.getByText('You have arrived at Annex Wing')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: copy.guide.nextStep })).toBeDisabled();
    await press(copy.guide.previousStep);
    expect(c.getState().stepIndex).toBe(1);
  });

  it('Manual Guide works with no location adapter at all', async () => {
    const c = ctrl(); // no `location`
    await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 1 });
  });

  it('ending the guide returns to the directory and tells the host', async () => {
    const onTripEnded = jest.fn();
    const c = ctrl();
    await mount(c, { onTripEnded });
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.end);
    expect(c.getState()).toMatchObject({ phase: 'browsing', route: null });
    expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
    expect(onTripEnded).toHaveBeenCalledWith('exit');
  });

  it('Back from the preview ends the trip', async () => {
    const onTripEnded = jest.fn();
    const c = ctrl();
    await mount(c, { onTripEnded });
    await press('Annex Wing');
    await press(copy.trip.back);
    expect(c.getState().phase).toBe('browsing');
    expect(onTripEnded).toHaveBeenCalledWith('exit');
  });

  it('changing the destination keeps the manual start and recalculates', async () => {
    const c = ctrl();
    await mount(c);
    await planAnnexFromLobby();
    await press(copy.trip.changeTo('Annex Wing'));
    expect(screen.queryByRole('button', { name: 'Annex Wing' })).toBeNull(); // already the destination
    await press('Grand Hall. Level 2');
    expect(c.getState()).toMatchObject({ phase: 'preview', destinationId: 'hall', originId: 'lobby', loadState: 'ready' });
  });
});

describe('NavigationScreen: loading, failure and recovery are safe', () => {
  it('shows loading while the finder is pending: the guide is not offered yet and Live is disabled', async () => {
    const f = deferredFinder();
    const c = ctrl({ findRoute: f.findRoute });
    await mount(c);
    await planAnnexFromLobby();
    expect(screen.getAllByText(copy.trip.loading).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: `${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}` })).toBeNull();
    const live = screen.getByRole('button', { name: `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}` });
    expect(live).toBeDisabled(); // the controller would refuse with route_pending; the screen does not even offer it
    await settle(() => f.calls[0].settle(f.real(f.calls[0])));
    expect(screen.queryByText(copy.trip.loading)).toBeNull();
    expect(screen.getByText(copy.trip.summary('117 m'))).toBeOnTheScreen();
  });

  it('a route that cannot be found says so and lets the user retry or choose another start', async () => {
    const c = ctrl();
    await mount(c);
    await press('Island Office');
    await press(copy.trip.chooseStart);
    await press('Main Lobby');
    expect(c.getState()).toMatchObject({ loadState: 'error', error: 'no_route' });
    expect(screen.getByText(copy.trip.errors.no_route)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: `${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}` })).toBeNull();
    const before = c.getState();
    await press(copy.trip.retry);
    expect(c.getState()).not.toBe(before); // asked the controller again
    expect(c.getState()).toMatchObject({ loadState: 'error', error: 'no_route', originId: 'lobby' });
  });

  it('a finder that throws is a route failure message, not a crash', async () => {
    const c = ctrl({ findRoute: () => { throw new Error('pack unreadable'); } });
    await mount(c);
    await planAnnexFromLobby();
    expect(screen.getByText(copy.trip.errors.route_failed)).toBeOnTheScreen();
  });

  it('start and destination being the same place is explained', async () => {
    const c = ctrl();
    await mount(c);
    await press('Main Lobby');
    await press(copy.trip.chooseStart);
    expect(screen.queryByRole('button', { name: 'Main Lobby' })).toBeNull(); // not a start for itself
    await press(copy.directory.back);
    await act(async () => c.selectOrigin('lobby')); // a host (or a race) can still ask: the screen explains it
    expect(screen.getByText(copy.trip.samePlace)).toBeOnTheScreen();
  });

  it('changing the destination while a route is pending never lets the old route land', async () => {
    const f = deferredFinder();
    const c = ctrl({ findRoute: f.findRoute });
    await mount(c);
    await planAnnexFromLobby(); // request 0: lobby -> annex, still pending
    await press(copy.trip.changeTo('Annex Wing'));
    await press('Grand Hall. Level 2'); // request 1: lobby -> hall
    expect(f.calls).toHaveLength(2);
    await settle(() => f.calls[0].settle(f.real(f.calls[0]))); // the superseded answer arrives first
    expect(c.getState()).toMatchObject({ destinationId: 'hall', loadState: 'loading', route: null });
    expect(screen.getByText(copy.trip.title('Grand Hall'))).toBeOnTheScreen();
    expect(screen.getAllByText(copy.trip.loading).length).toBeGreaterThan(0);
    await settle(() => f.calls[1].settle(f.real(f.calls[1])));
    expect(c.getState()).toMatchObject({ destinationId: 'hall', loadState: 'ready' });
    expect(c.getState().route!.destinationId).toBe('hall');
  });

  it('exiting while a route is pending leaves the directory, and the late answer changes nothing', async () => {
    const f = deferredFinder();
    const onTripEnded = jest.fn();
    const c = ctrl({ findRoute: f.findRoute });
    await mount(c, { onTripEnded });
    await planAnnexFromLobby();
    await press(copy.trip.back);
    await settle(() => f.calls[0].settle(f.real(f.calls[0])));
    expect(c.getState()).toMatchObject({ phase: 'browsing', route: null, loadState: 'idle' });
    expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
    expect(screen.queryByText(copy.trip.summary('117 m'))).toBeNull();
    expect(onTripEnded).toHaveBeenCalledTimes(1);
  });
});

describe('NavigationScreen: explicit Live Navigation (simulated fixes)', () => {
  const liveOption = `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`;

  it('nothing reads permission, prompts or watches until the user asks for Live', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    expect(L).toMatchObject({ permissionReads: 0, prompts: 0, watching: 0 });
    expect(c.getState().phase).toBe('guide');
  });

  it('the Live option in the preview starts live from the first fresh fix and shows live guidance', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await press('Annex Wing');
    await press(liveOption);
    expect(await screen.findByText(copy.live.exit)).toBeOnTheScreen();
    expect(c.getState()).toMatchObject({ phase: 'live', originSource: 'live_gps' });
    expect(L.watching).toBe(1);
    expect(screen.getByText('Start walking')).toBeOnTheScreen();
    expect(screen.getByText(/left/)).toBeOnTheScreen();
    expect(screen.queryByText(copy.live.gpsLost)).toBeNull();
    expect(screen.queryByText(copy.arrival.title)).toBeNull(); // the arrival sheet belongs to arrival only
    // While live the distance is what is left of the step (about 53 m after the first fix), not its whole 56 m.
    const left = c.getState().live!.maneuverDistanceM;
    expect(left).toBeLessThan(56);
    expect(screen.getByText(`${Math.round(left)} m`)).toBeOnTheScreen();
    expect(screen.queryByText('56 m')).toBeNull();
  });

  it('shows the live instruction and the distance left to the next turn as the walker advances', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await press('Annex Wing');
    await press(liveOption);
    await screen.findByText(copy.live.exit);
    await walk(L, offset(N1, 56, 0)); // roughly at the first corner
    await walk(L, offset(N1, 60, 30));
    expect(c.getState().stepIndex).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Turn right')).toBeOnTheScreen();
  });

  it('from the guide, Live asks for confirmation first and keeps the guide until it starts', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    await press(copy.guide.useLocation);
    expect(screen.getByText(copy.upgrade.confirm)).toBeOnTheScreen();
    expect(screen.getByText(copy.upgrade.preserved)).toBeOnTheScreen();
    expect(L.permissionReads).toBe(0); // asking to switch is not yet switching
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 1 });
    await press(copy.upgrade.cancel);
    expect(screen.queryByText(copy.upgrade.confirm)).toBeNull();
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 1 });
    expect(L.permissionReads).toBe(0);
  });

  it('confirming from the guide starts live', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.useLocation);
    await press(copy.upgrade.continue);
    expect(await screen.findByText(copy.live.exit)).toBeOnTheScreen();
    expect(c.getState().phase).toBe('live');
  });

  it('a denied location keeps the Manual Guide, explains why, and never retries by itself', async () => {
    const L = simulatedLocation();
    L.permission = BLOCKED;
    const c = ctrl({ location: L });
    await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    await press(copy.guide.useLocation);
    await press(copy.upgrade.continue);
    expect(await screen.findByText(copy.liveBlockers.permission_blocked)).toBeOnTheScreen();
    expect(screen.getByText(copy.upgrade.failed)).toBeOnTheScreen();
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 1, liveAttempt: { status: 'blocked', blocker: 'permission_blocked' } });
    const reads = L.permissionReads;
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(L.permissionReads).toBe(reads);
    expect(L.watching).toBe(0);
    await press(copy.upgrade.cancel);
    await press(copy.guide.nextStep); // the guide is still fully usable
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 2 });
  });

  it('a stale or missing fix cannot start live, and says which problem it was', async () => {
    const L = simulatedLocation();
    L.currentFix = fixAt(offset(N1, 3, 0), { observedAtMs: T0 - 120_000 });
    const c = ctrl({ location: L });
    await mount(c);
    await press('Annex Wing');
    await press(liveOption);
    expect(await screen.findByText(copy.liveBlockers.stale_fix)).toBeOnTheScreen();
    expect(c.getState().phase).toBe('preview');
    expect(L.watching).toBe(0);
  });

  it('a host with no location adapter gets a plain refusal, and can hide the option entirely', async () => {
    const c = ctrl();
    const view = await mount(c);
    await press('Annex Wing');
    await press(liveOption);
    expect(await screen.findByText(copy.liveBlockers.unsupported)).toBeOnTheScreen();
    await view.rerender({ allowLive: false });
    expect(screen.queryByRole('button', { name: liveOption })).toBeNull();
  });

  it('turning Live off while its confirmation is open withdraws the confirmation', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    const view = await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.useLocation);
    expect(screen.getByText(copy.upgrade.confirm)).toBeOnTheScreen();
    await view.rerender({ allowLive: false });
    expect(screen.queryByText(copy.upgrade.confirm)).toBeNull();
    expect(screen.queryByRole('button', { name: copy.upgrade.continue })).toBeNull();
    expect(L.permissionReads).toBe(0);
  });

  it('allowLive=false also removes the guide shortcut', async () => {
    const c = ctrl({ location: simulatedLocation() });
    await mount(c, { allowLive: false });
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    expect(screen.queryByRole('button', { name: copy.guide.useLocation })).toBeNull();
  });
});

describe('NavigationScreen: GPS loss, reroute, arrival and Exit while live (simulated)', () => {
  const liveOption = `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`;
  const goLive = async (extra: Partial<NavigationControllerOptions> = {}, props: Partial<NavigationScreenProps> = {}) => {
    const L = simulatedLocation();
    const c = ctrl({ location: L, ...extra });
    const view = await mount(c, props);
    await press('Annex Wing');
    await press(liveOption);
    await screen.findByText(copy.live.exit);
    return { L, c, ...view };
  };

  it('a silent GPS shows the lost banner and freezes progress instead of inventing movement', async () => {
    const { c } = await goLive();
    const before = c.getState().live!;
    t += 8_000;
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(screen.getByText(copy.live.gpsLost)).toBeOnTheScreen();
    expect(c.getState().live).toMatchObject({ signal: 'lost', progressM: before.progressM, remainingM: before.remainingM });
  });

  it('a fresh fix clears the lost banner and progress resumes from the same place', async () => {
    const { L, c } = await goLive();
    t += 8_000;
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(screen.getByText(copy.live.gpsLost)).toBeOnTheScreen();
    await walk(L, offset(N1, 8, 0), 1_000);
    expect(screen.queryByText(copy.live.gpsLost)).toBeNull();
    expect(c.getState().live!.signal).toBe('good');
  });

  it('a weak signal is a warning, not a reroute', async () => {
    const { L, c } = await goLive();
    t += 4_000;
    await act(async () => L.emit(fixAt(offset(N1, 8, 0), { accuracy: 400 })));
    expect(screen.getByText(copy.live.gpsWeak)).toBeOnTheScreen();
    expect(c.getState().live).toMatchObject({ signal: 'weak', rerouting: false });
  });

  it('reroutes with a visible state, and announces the new route when it lands', async () => {
    const f = deferredFinder();
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = (input) =>
      phase === 0 ? findBestVenuePath(input.graph, input.startIds, input.goalIds) : f.findRoute!(input);
    const { L, c } = await goLive({ findRoute });
    phase = 1;
    await offRoute(L);
    expect(screen.getByText(copy.live.rerouting)).toBeOnTheScreen();
    expect(c.getState().live!.rerouting).toBe(true);
    expect(f.calls).toHaveLength(1); // one reroute at a time, however many off-route fixes follow
    await walk(L, offset(N1, 10, 70));
    expect(f.calls).toHaveLength(1);
    await settle(() => f.calls[0].settle(findBestVenuePath(testVenue.graph, ['n/4'], ['n/3'])));
    expect(screen.queryByText(copy.live.rerouting)).toBeNull();
    expect(screen.getByText(copy.live.rerouted)).toBeOnTheScreen();
    expect(c.getState().route!.nodeIds).toEqual(['n/4', 'n/3']);
  });

  it('keeps the route and says so when no better route is found', async () => {
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = (input) =>
      phase === 0 ? findBestVenuePath(input.graph, input.startIds, input.goalIds) : undefined;
    const { L, c } = await goLive({ findRoute });
    const route = c.getState().route;
    phase = 1;
    await offRoute(L);
    expect(screen.getByText(copy.live.keptRoute)).toBeOnTheScreen();
    expect(c.getState().route).toBe(route);
  });

  it('a lost GPS outranks the settled-reroute notice in the status slot', async () => {
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = (input) =>
      phase === 0 ? findBestVenuePath(input.graph, input.startIds, input.goalIds) : undefined;
    const { L } = await goLive({ findRoute });
    phase = 1;
    await offRoute(L);
    expect(screen.getByText(copy.live.keptRoute)).toBeOnTheScreen();
    t += 8_000;
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(screen.getByText(copy.live.gpsLost)).toBeOnTheScreen();
    expect(screen.queryByText(copy.live.keptRoute)).toBeNull();
  });

  it('a reroute that lands after arrival never replaces the finished journey (A5-02)', async () => {
    const f = deferredFinder();
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = (input) =>
      phase === 0 ? findBestVenuePath(input.graph, input.startIds, input.goalIds) : f.findRoute!(input);
    const { L, c } = await goLive({ findRoute });
    phase = 1;
    await offRoute(L);
    expect(c.getState().live!.rerouting).toBe(true);
    await walk(L, N3); // arrives while the reroute is still computing
    expect(c.getState().phase).toBe('arrived');
    const route = c.getState().route;
    await settle(() => f.calls[0].settle(findBestVenuePath(testVenue.graph, ['n/4'], ['n/3'])));
    expect(c.getState()).toMatchObject({ phase: 'arrived' });
    expect(c.getState().route).toBe(route);
    expect(screen.getByText(copy.arrival.title)).toBeOnTheScreen();
  });

  it('arrival shows the arrival card for the destination; Done finishes the journey cleanly', async () => {
    const onTripEnded = jest.fn();
    const { L, c } = await goLive({}, { onTripEnded });
    await walk(L, offset(N1, 56, 0));
    await walk(L, N3);
    expect(c.getState().phase).toBe('arrived');
    expect(await screen.findByText(copy.arrival.title)).toBeOnTheScreen();
    expect(screen.getByText('Annex Wing')).toBeOnTheScreen();
    expect(L.watching).toBe(0); // arrival stopped the watcher
    await press(copy.arrival.doneA11y);
    expect(c.getState()).toMatchObject({ phase: 'browsing', route: null, live: null });
    expect(onTripEnded).toHaveBeenCalledWith('arrived');
    expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  });

  it('Exit while live stops the watcher, ignores any late reroute, and returns to the directory', async () => {
    const f = deferredFinder();
    let phase = 0;
    const findRoute: NavigationControllerOptions['findRoute'] = (input) =>
      phase === 0 ? findBestVenuePath(input.graph, input.startIds, input.goalIds) : f.findRoute!(input);
    const onTripEnded = jest.fn();
    const { L, c } = await goLive({ findRoute }, { onTripEnded });
    phase = 1;
    await offRoute(L);
    await press(copy.live.exit);
    expect(L.watching).toBe(0);
    expect(onTripEnded).toHaveBeenCalledWith('exit');
    await settle(() => f.calls[0].settle(findBestVenuePath(testVenue.graph, ['n/4'], ['n/3'])));
    expect(c.getState()).toMatchObject({ phase: 'browsing', route: null });
    expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  });
});

describe('NavigationScreen: injected map', () => {
  it('hands the map the controller\'s state and never owns map rendering', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    expect(screen.getByTestId('fake-map')).toBeOnTheScreen();
    expect(mapProps).toMatchObject({ phase: 'browsing', route: null, destinationId: null, position: null });
    await planAnnexFromLobby();
    expect(mapProps).toMatchObject({ phase: 'preview', originId: 'lobby', destinationId: 'annex' });
    expect(mapProps!.route).toBe(c.getState().route);
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    expect(mapProps).toMatchObject({ phase: 'guide', stepIndex: 1, position: null }); // Manual Guide invents no position
  });

  it('passes the snapped live position while live', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await press('Annex Wing');
    await press(`${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`);
    await screen.findByText(copy.live.exit);
    await walk(L, offset(N1, 20, 0));
    expect(mapProps!.position).not.toBeNull();
    expect(mapProps!.position).toEqual(c.getState().live!.snapped);
  });

  it('Recenter is the map adapter\'s job, offered while following directions or live', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await planAnnexFromLobby();
    expect(screen.queryByRole('button', { name: copy.live.recenterA11y })).toBeNull(); // nothing to follow in the preview
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.live.recenterA11y);
    expect(recenters).toBe(1);
  });

  it('the arrival card can recenter through the same adapter', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await press('Annex Wing');
    await press(`${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`);
    await screen.findByText(copy.live.exit);
    await walk(L, offset(N1, 56, 0));
    await walk(L, N3);
    await press(copy.arrival.recenterA11y);
    expect(recenters).toBe(1);
  });

  it('shows the map-unavailable notice when the map says so, and directions keep working', async () => {
    const c = ctrl();
    await mount(c);
    await planAnnexFromLobby();
    expect(screen.queryByText(copy.mapUnavailable)).toBeNull();
    await act(async () => mapProps!.onAvailabilityChange(false));
    expect(screen.getByText(copy.mapUnavailable)).toBeOnTheScreen();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
    await act(async () => mapProps!.onAvailabilityChange(true));
    expect(screen.queryByText(copy.mapUnavailable)).toBeNull();
  });

  it('works with no map at all: directions only, no recenter control', async () => {
    const c = ctrl();
    await mount(c, { MapComponent: undefined });
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    expect(screen.queryByTestId('fake-map')).toBeNull();
    expect(screen.queryByRole('button', { name: copy.live.recenterA11y })).toBeNull();
    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
  });
});

describe('NavigationScreen: host configuration changes keep the journey', () => {
  const HOST: NavigationScreenCopy = {
    ...copy,
    guide: { ...copy.guide, stepCount: (s, n) => `[host] ${s}/${n}`, next: '[host] Next', nextStep: '[host] Next step' },
    routeStep: { ...copy.routeStep, turnRight: '[host] Turn right' },
  };

  it('swapping labels, theme and direction mid-guide keeps the step, the controller state and the local search', async () => {
    const c = ctrl();
    const view = await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    const state = c.getState();
    await view.rerender({
      copy: HOST,
      isRTL: true,
      theme: createDefaultNavigationTheme({ isRTL: true, colorScheme: 'dark' }),
    });
    expect(c.getState()).toBe(state); // not one controller update
    expect(screen.getByText('[host] 2/3')).toBeOnTheScreen();
    expect(screen.getByText('[host] Turn right')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '[host] Next step' })).toBeOnTheScreen();
  });

  it('keeps the typed search when the host re-themes the directory', async () => {
    const view = await mount(ctrl());
    await fireEvent.changeText(screen.getByLabelText(copy.directory.searchLabel), 'wing');
    await view.rerender({ isRTL: true, theme: createDefaultNavigationTheme({ isRTL: true }) });
    expect(screen.getByLabelText(copy.directory.searchLabel).props.value).toBe('wing');
    expect(screen.queryByRole('button', { name: 'Main Lobby' })).toBeNull();
  });

  it('RTL flips the text flow but never the map or its controls', async () => {
    const c = ctrl();
    const view = await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    const flat = (id: string) => Object.assign({}, ...[screen.getByTestId(id).props.style].flat(3).filter(Boolean));
    expect(flat('navigation-map').direction).toBe('ltr');
    expect(flat('navigation-panel').direction).toBe('ltr');
    const recenterRight = flat('navigation-recenter').right;
    await view.rerender({ isRTL: true, theme: createDefaultNavigationTheme({ isRTL: true }) });
    expect(flat('navigation-map').direction).toBe('ltr');
    expect(flat('navigation-panel').direction).toBe('rtl');
    expect(flat('navigation-recenter').right).toBe(recenterRight);
    expect(flat('navigation-recenter').left).toBeUndefined();
  });

  it('RTL text follows the paragraph direction instead of an absolute edge, and the chevrons are drawn, never glyphs', async () => {
    const view = await mount(ctrl());
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await view.rerender({ isRTL: true, theme: createDefaultNavigationTheme({ isRTL: true }) });
    // Android and iOS both flip an explicit left/right again once writingDirection is rtl, which put RTL text on the wrong edge.
    const styles: any[] = [];
    const walk = (node: any) => {
      if (!node || typeof node === 'string') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node.props?.style) styles.push(Object.assign({}, ...[node.props.style].flat(3).filter(Boolean)));
      walk(node.children);
    };
    walk(screen.toJSON());
    const aligned = styles.filter((style) => style.textAlign !== undefined);
    expect(aligned.filter((style) => style.textAlign === 'auto').length).toBeGreaterThan(0);
    expect(aligned.filter((style) => style.textAlign === 'left' || style.textAlign === 'right')).toEqual([]); // centred labels are fine
    // U+2039/U+203A are bidi-mirrored, so a glyph already chosen for the direction was mirrored again inside an RTL layout.
    for (const direction of [false, true]) {
      const theme = createDefaultNavigationTheme({ isRTL: direction });
      for (const Icon of [theme.icons.Back, theme.icons.Forward]) {
        expect(JSON.stringify((Icon as (p: { size: number; color: string }) => unknown)({ size: 24, color: '#000' }))).not.toMatch(/[\u2039\u203A]/);
        expect(JSON.stringify((Icon as (p: { size: number; color: string }) => unknown)({ size: 24, color: '#000' }))).toContain('"direction":"ltr"'); // never re-flipped by an RTL parent
      }
    }
  });

  it('the host\'s style prop reaches the root, so safe areas stay the host\'s', async () => {
    await mount(ctrl(), { style: { paddingTop: 47 } });
    const root = screen.getByTestId('navigation-screen');
    expect(Object.assign({}, ...[root.props.style].flat(3).filter(Boolean)).paddingTop).toBe(47);
  });
});

describe('NavigationScreen: accessibility and large text', () => {
  const labelledControls = () => screen.getAllByRole('button').map((b) => b.props.accessibilityLabel ?? '');

  it('every control in every stage has an accessible name', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    const stages: Array<() => Promise<void>> = [
      async () => {},
      async () => { await press('Annex Wing'); },
      async () => { await press(copy.trip.chooseStart); await press('Main Lobby'); },
      async () => { await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`); },
      async () => { await press(copy.guide.useLocation); },
    ];
    for (const next of stages) {
      await next();
      const names = labelledControls();
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(name.trim()).not.toBe('');
    }
  });

  it('the search field is labelled and the status text is announced politely', async () => {
    const f = deferredFinder();
    const c = ctrl({ findRoute: f.findRoute });
    await mount(c);
    expect(screen.getByLabelText(copy.directory.searchLabel).props.accessibilityLabel).toBe(copy.directory.searchLabel);
    await planAnnexFromLobby();
    const status = screen.getByTestId('navigation-status');
    expect(status.props.accessibilityLiveRegion).toBe('polite');
  });

  it('at the largest text size nothing is truncated and the guide buttons stack', async () => {
    Dimensions.set({ window: { width: 320, height: 640, scale: 2, fontScale: 2 } });
    try {
      const c = ctrl();
      await mount(c);
      await planAnnexFromLobby();
      await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
      const texts = screen.getAllByText(/.+/);
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.ellipsizeMode).toBeUndefined();
      }
      const stepper = Object.assign({}, ...[screen.getByTestId('guide-stepper').props.style].flat(3).filter(Boolean));
      expect(stepper.flexDirection).toBe('column');
    } finally {
      await act(async () => { Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } }); });
    }
  });
});

describe('NavigationScreen: large text layout (AX5-like scale)', () => {
  const guideOption = `${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`;
  const liveOption = `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`;
  const setScale = (fontScale: number) => act(async () => { Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale } }); });
  afterEach(async () => { await setScale(1); });
  const flat = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean));

  it('at a normal scale nothing is pinned: the guide card keeps its own controls', async () => {
    await mount(ctrl());
    await planAnnexFromLobby();
    await press(guideOption);
    expect(screen.queryByTestId('navigation-pinned')).toBeNull();
    expect(within(screen.getByTestId('route-guide-card')).getByTestId('guide-stepper')).toBeOnTheScreen();
  });

  it('keeps Previous and Next pinned under the scrolling guide, with End right after the step text, and they all still work', async () => {
    await setScale(3.1);
    const c = ctrl();
    await mount(c);
    await planAnnexFromLobby();
    await press(guideOption);
    const pinned = screen.getByTestId('navigation-pinned');
    expect(within(pinned).getByTestId('guide-stepper')).toBeOnTheScreen();
    expect(within(pinned).queryByRole('button', { name: copy.guide.end })).toBeNull(); // End scrolls with the step: the pinned strip stays small
    expect(screen.getByRole('button', { name: copy.guide.end })).toBeOnTheScreen();
    expect(screen.queryByTestId('route-guide-card')).toBeNull(); // the step text scrolls; the stepper is not inside it
    const pinnedNow = () => within(screen.getByTestId('navigation-pinned'));
    await fireEvent.press(pinnedNow().getByRole('button', { name: copy.guide.nextStep }));
    expect(c.getState().stepIndex).toBe(1);
    await fireEvent.press(pinnedNow().getByRole('button', { name: copy.guide.previousStep }));
    expect(c.getState().stepIndex).toBe(0);
    await fireEvent.press(screen.getByRole('button', { name: copy.guide.end }));
    expect(c.getState().phase).toBe('browsing');
  });

  it('keeps End navigation pinned while live', async () => {
    await setScale(3.1);
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await press('Annex Wing');
    await press(liveOption);
    await screen.findByText(copy.live.exit);
    const pinned = screen.getByTestId('navigation-pinned');
    await fireEvent.press(within(pinned).getByRole('button', { name: copy.live.exit }));
    expect(c.getState().phase).toBe('browsing');
  });

  it('survives a system text-size change mid-journey: same trip, same step, controls switch place', async () => {
    const c = ctrl();
    await mount(c);
    await planAnnexFromLobby();
    await press(guideOption);
    await press(copy.guide.nextStep);
    const before = c.getState();
    expect(before).toMatchObject({ phase: 'guide', stepIndex: 1 });
    await setScale(3.1);
    expect(c.getState()).toBe(before);
    expect(within(screen.getByTestId('navigation-pinned')).getByRole('button', { name: copy.guide.nextStep })).toBeOnTheScreen();
    await setScale(1);
    expect(c.getState()).toBe(before);
    expect(screen.queryByTestId('navigation-pinned')).toBeNull();
    await press(copy.guide.nextStep);
    expect(c.getState().stepIndex).toBe(2);
  });

  it('stacked step buttons size to their content: a column of `flex: 1` buttons collapses to its minimum height and the large text overflows', async () => {
    await setScale(3.1);
    await mount(ctrl());
    await planAnnexFromLobby();
    await press(guideOption);
    for (const name of [copy.guide.previousStep, copy.guide.nextStep]) {
      const style = flat(within(screen.getByTestId('guide-stepper')).getByRole('button', { name }).props.style);
      expect(style.flexBasis).toBe('auto');
      expect(style.flexGrow).toBe(0);
      expect(style.flexShrink).toBe(0);
    }
    expect(flat(screen.getByTestId('guide-stepper').props.style).flexDirection).toBe('column');
    await setScale(1);
    const side = flat(within(screen.getByTestId('guide-stepper')).getByRole('button', { name: copy.guide.nextStep }).props.style);
    expect(side.flex).toBe(1); // side by side at a normal size, as before
  });

  it('puts the directory heading inside the list scroll, so the places can always be reached', async () => {
    await setScale(3.1);
    await mount(ctrl());
    const scrollsWith = (el: { parent: unknown }, wanted: unknown): boolean => {
      for (let node = (el as { parent: { type: unknown; parent: unknown } | null }).parent; node; node = node.parent as typeof node) if (node.type === wanted) return true;
      return false;
    };
    const scroll = screen.getByText('Annex Wing');
    let list: { type: unknown; parent: unknown } | null = (scroll as unknown as { parent: { type: unknown; parent: unknown } }).parent;
    while (list && !String(list.type).includes('ScrollView')) list = list.parent as typeof list;
    expect(list).toBeTruthy();
    expect(scrollsWith(screen.getByText(copy.directory.destinationTitle), list!.type)).toBe(true);
    await setScale(1);
    let normal: { type: unknown; parent: unknown } | null = (screen.getByText('Annex Wing') as unknown as { parent: { type: unknown; parent: unknown } }).parent;
    while (normal && !String(normal.type).includes('ScrollView')) normal = normal.parent as typeof normal;
    expect(scrollsWith(screen.getByText(copy.directory.destinationTitle), normal!.type)).toBe(false);
  });

  it('scales the search field itself on iOS, where a TextInput keeps drawing at the previous system size', async () => {
    const fontSizeOf = (input: { props: { style: unknown } }) => flat(input.props.style).fontSize;
    await mount(ctrl());
    const android = screen.getByLabelText(copy.directory.searchLabel);
    expect(android.props.allowFontScaling).not.toBe(false); // Android: the platform scales it
    expect(fontSizeOf(android)).toBe(16);
    jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      await setScale(2.5);
      const ios = screen.getByLabelText(copy.directory.searchLabel);
      expect(ios.props.allowFontScaling).toBe(false); // scaled by hand from the window's font scale, which does update
      expect(fontSizeOf(ios)).toBe(40);
      await setScale(1);
      expect(fontSizeOf(screen.getByLabelText(copy.directory.searchLabel))).toBe(16);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('caps headings but leaves instructions, rows and buttons fully scalable', async () => {
    await setScale(3.1);
    const c = ctrl();
    await mount(c);
    await planAnnexFromLobby();
    await press(guideOption);
    expect(screen.getByText(copy.trip.title('Annex Wing')).props.maxFontSizeMultiplier).toBe(HEADING_MAX_FONT_SCALE);
    const instruction = screen.getByText(copy.routeStep.depart);
    expect(instruction.props.maxFontSizeMultiplier).toBeUndefined();
    expect(instruction.props.allowFontScaling).not.toBe(false);
  });

  it('applies the host bottom inset to the panel, so the system bar never covers a control', async () => {
    await mount(ctrl(), { bottomInset: 34 });
    expect(flat(screen.getByTestId('navigation-panel').props.style).paddingBottom).toBe(34);
  });
});

describe('NavigationScreen: appearance', () => {
  it('tells the map the theme\'s appearance, and restyling does not touch the journey', async () => {
    const c = ctrl();
    const { rerender } = await mount(c);
    expect(mapProps?.colorScheme).toBe('light');
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    const before = c.getState();
    await rerender({ theme: createDefaultNavigationTheme({ isRTL: false, colorScheme: 'dark' }) });
    expect(mapProps?.colorScheme).toBe('dark');
    expect(c.getState()).toBe(before);
    await rerender({ theme: createDefaultNavigationTheme({ isRTL: false }) });
    expect(mapProps?.colorScheme).toBe('light');
    expect(c.getState()).toBe(before);
  });

  it('a custom theme that does not name its appearance gets the light map', async () => {
    const custom = { ...createDefaultNavigationTheme({ isRTL: false, colorScheme: 'dark' }) };
    delete custom.colorScheme;
    await mount(ctrl(), { theme: custom });
    expect(mapProps?.colorScheme).toBe('light');
  });
});

describe('NavigationScreen: ownership and cleanup', () => {
  it('holds exactly one subscription of its own and releases it on unmount, leaving the controller alive', async () => {
    const c = ctrl();
    let active = 0;
    const counted: NavigationController = {
      ...c,
      subscribe: (listener) => {
        active += 1;
        const off = c.subscribe(listener);
        let done = false;
        return () => { if (!done) { done = true; active -= 1; } off(); };
      },
    };
    const { view } = await mount(counted);
    const mounted = active;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThanOrEqual(3); // provider + screen, nothing per row or per leaf
    await press('Annex Wing');
    await press(copy.trip.chooseStart);
    await press('Main Lobby');
    expect(active).toBe(mounted); // navigating adds no subscriptions
    await view.unmount();
    expect(active).toBe(0);
    c.selectDestination('annex');
    expect(c.getState().phase).toBe('preview');
  });

  it('unmounting while live stops the clock but leaves the host-owned watcher to the host', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    const { view } = await mount(c);
    await press('Annex Wing');
    await press(`${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`);
    await screen.findByText(copy.live.exit);
    const mine = started.mock.results.filter((_, i) => started.mock.calls[i][1] === 1_000).map((r) => r.value);
    expect(mine.length).toBeGreaterThan(0);
    await view.unmount();
    for (const id of mine) expect(cleared).toHaveBeenCalledWith(id);
    expect(c.getState().phase).toBe('live'); // the controller is the host's: unmounting is not Exit
    c.dispose();
    expect(L.watching).toBe(0);
    started.mockRestore();
    cleared.mockRestore();
  });

  it('a chooser left open does not survive a different trip being chosen behind the screen', async () => {
    const c = ctrl();
    await mount(c);
    await press('Annex Wing');
    await press(copy.trip.chooseStart);
    expect(screen.getByTestId('place-directory')).toBeOnTheScreen();
    await act(async () => c.selectDestination('hall'));
    expect(screen.queryByTestId('place-directory')).toBeNull();
    expect(screen.getByText(copy.trip.title('Grand Hall'))).toBeOnTheScreen();
  });

  it('a chooser left open is not reopened by the next trip after Exit', async () => {
    const c = ctrl();
    await mount(c);
    await press('Annex Wing');
    await press(copy.trip.chooseStart);
    await act(async () => c.exit());
    await press('Grand Hall. Level 2');
    expect(screen.getByText(copy.trip.title('Grand Hall'))).toBeOnTheScreen();
    expect(screen.queryByTestId('place-directory')).toBeNull();
  });

  it('a Live confirmation left open does not carry over to the next trip', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.useLocation);
    expect(screen.getByText(copy.upgrade.confirm)).toBeOnTheScreen();
    await press(copy.guide.end);
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    expect(screen.queryByText(copy.upgrade.confirm)).toBeNull();
    expect(screen.getByRole('button', { name: copy.guide.useLocation })).toBeOnTheScreen();
    expect(L.permissionReads).toBe(0);
  });

  it('a route still loading refuses Live in the controller too (route_pending), so the disabled option is not the only guard', async () => {
    const f = deferredFinder();
    const L = simulatedLocation();
    const c = ctrl({ location: L, findRoute: f.findRoute });
    await mount(c);
    await planAnnexFromLobby();
    await act(async () => { await c.requestLive(); });
    expect(c.getState().liveAttempt).toMatchObject({ status: 'blocked', blocker: 'route_pending' });
    expect(await screen.findByText(copy.liveBlockers.route_pending)).toBeOnTheScreen();
    expect(L.permissionReads).toBe(0);
  });

  it('an unknown destination asked of the controller is reported on the directory, not swallowed', async () => {
    const c = ctrl();
    await mount(c);
    await act(async () => c.selectDestination('nowhere'));
    expect(screen.getByText(copy.trip.errors.unknown_place)).toBeOnTheScreen();
    expect(c.getState().phase).toBe('browsing');
  });

  it('is a view over the controller: it produces no state of its own to disagree with it', async () => {
    const c = ctrl();
    await mount(c);
    await press('Annex Wing');
    await act(async () => c.selectDestination('hall')); // the host (or a deep link) changes the trip behind the screen's back
    expect(screen.getByText(copy.trip.title('Grand Hall'))).toBeOnTheScreen();
    await act(async () => c.exit());
    expect(screen.getByText(copy.directory.destinationTitle)).toBeOnTheScreen();
  });
});

// The ready-made screen reviews the live route before going live unless the host opts out (reviewLiveRoute={false} everywhere above).
describe('NavigationScreen: review the live route, then start (C4.2-a)', () => {
  const liveOption = `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`;

  it('from the preview: shows the candidate route and goes live only after Start', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c, { reviewLiveRoute: true });
    await press('Annex Wing');
    await press(liveOption);
    expect(await screen.findByText(copy.upgrade.preview)).toBeOnTheScreen();
    expect(c.getState()).toMatchObject({ phase: 'preview', liveAttempt: { status: 'candidate' } });
    expect(L.watching).toBe(0);
    expect(screen.queryByRole('button', { name: liveOption })).toBeNull();
    await press(copy.upgrade.start);
    expect(await screen.findByText(copy.live.exit)).toBeOnTheScreen();
    expect(c.getState().phase).toBe('live');
    expect(L.watching).toBe(1);
  });

  it('from the guide: Not now drops the candidate and the guide carries on', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c, { reviewLiveRoute: true });
    await planAnnexFromLobby();
    await press(`${copy.trip.startGuide.title}. ${copy.trip.startGuide.subtitle}`);
    await press(copy.guide.nextStep);
    await press(copy.guide.useLocation);
    await press(copy.upgrade.continue);
    expect(await screen.findByText(copy.upgrade.preview)).toBeOnTheScreen();
    await press(copy.upgrade.cancel);
    expect(screen.queryByText(copy.upgrade.preview)).toBeNull();
    expect(c.getState()).toMatchObject({ phase: 'guide', stepIndex: 1, liveCandidate: null, liveAttempt: { status: 'idle' } });
    expect(L.watching).toBe(0);
    await press(copy.guide.nextStep);
    expect(c.getState().stepIndex).toBe(2);
  });

  it('a walker who has moved on is told to prepare the route again, and nothing goes live', async () => {
    const L = simulatedLocation();
    const c = ctrl({ location: L });
    await mount(c, { reviewLiveRoute: true });
    await press('Annex Wing');
    await press(liveOption);
    await screen.findByText(copy.upgrade.preview);
    L.currentFix = fixAt(offset(N1, 3 + 40, 0));
    await press(copy.upgrade.start);
    expect(await screen.findByText(copy.liveBlockers.route_outdated)).toBeOnTheScreen();
    expect(c.getState()).toMatchObject({ phase: 'preview', liveCandidate: null });
    expect(L.watching).toBe(0);
  });
});
