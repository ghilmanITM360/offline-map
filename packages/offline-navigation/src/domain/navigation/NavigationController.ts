/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Headless navigation controller: the one object a host (or the ready-made screen) drives to plan a trip, walk the
// Manual Guide, or navigate live. It owns no UI, no GPS driver and no clock: a location adapter and a clock are
// injected. It composes the existing pieces instead of restating them: NavigationSession decides which asynchronous
// result may commit, findBestVenuePath routes, evaluateLocationCapability gates live navigation,
// selectJourneyPresentationState names the journey, and RouteProgress holds the live geometry.
// One trip is one session: choosing a destination starts a new session, so anything still in flight for the
// previous trip can no longer commit; Exit and arrival cancel it. Live navigation starts ONLY from requestLive(),
// which is an explicit user action; nothing here ever starts, upgrades or retries live by itself.

import type { PlaceAvailability } from '../catalog/PlaceCatalog';
import { SpatialGrid } from '../geo/SpatialGrid';
import { isValidCoordinate } from '../geo/isValidCoordinate';
import {
  evaluateLocationCapability, type LiveBlocker, type LiveFixCoordinate, type LocationPermissionInput,
} from '../journey/LocationCapability';
import { selectJourneyPresentationState, isJourneyStartable, type JourneyPresentationState } from '../journey/JourneyPresentationState';
import type { NavigationStartSource } from '../journey/NavigationStartPolicy';
import { createNavigationSession, type NavigationSession, type NavigationSessionRequest } from '../session/NavigationSession';
import type { VenueCoordinate, VenueDataSource, VenueEdge, VenuePlace, VenueRoutingGraph } from '../venue/VenueDataSource';
import { findBestVenuePath, haversineM, type VenueRoute } from '../venue/VenueRouting';
import {
  advanceProgress, buildRouteLine, GPS_LOST_TIMEOUT_MS, isArrivedAtDestination, locateStep, offRouteThresholdM,
  REROUTE_COOLDOWN_MS, shouldTriggerReroute, STALE_FIX_CLOCK_TOLERANCE_MS, type RouteLine,
} from './RouteProgress';
import { buildRouteSteps, type RouteStep } from './RouteSteps';

/** browsing: no trip. preview: a destination is chosen. guide: Manual Guide stepping. live: GPS navigation. arrived: live finished. */
export type NavigationPhase = 'browsing' | 'preview' | 'guide' | 'live' | 'arrived';
/** The load states of JourneyPresentationInput, so the presentation policy is applied unchanged. */
export type NavigationLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'needs_origin' | 'same_place';
export type NavigationError = 'unknown_place' | 'no_route' | 'route_failed' | 'destination_unreachable' | 'destination_not_located';
/** The origin id of a route that starts from the walker's own position rather than a venue place. */
export const LIVE_ORIGIN_ID = 'live_location';

export interface NavigationRoute {
  readonly originId: string;
  readonly destinationId: string;
  readonly nodeIds: readonly string[];
  /** Walking length in metres (not the weighted search cost). */
  readonly distanceM: number;
  readonly steps: readonly RouteStep[];
  /** The route as a polyline for map drawing and live tracking; null when a node has no coordinates (live is then unavailable). */
  readonly line: RouteLine | null;
}

/** Why live navigation could not start. The first group is the SDK's LiveBlocker; the rest are specific to a venue trip. */
export type LiveStartBlocker =
  | Exclude<LiveBlocker, 'acquiring'>
  | 'unsupported'
  | 'route_pending'
  | 'outside_venue'
  | 'already_at_destination'
  | 'no_route'
  | 'route_outdated';

export interface LiveAttemptState {
  /** `candidate`: a live route is prepared and waiting for confirmLive(); nothing is live yet. */
  readonly status: 'idle' | 'requesting' | 'candidate' | 'blocked';
  readonly blocker: LiveStartBlocker | null;
}

/** The route Live would follow from the walker's current position, shown before the walker commits to it. */
export interface LiveCandidate {
  readonly route: NavigationRoute;
  readonly etaMinutes: number;
}

export type LiveSignal = 'good' | 'weak' | 'lost';
export interface LiveState {
  readonly progressM: number;
  readonly remainingM: number;
  readonly etaMinutes: number;
  /** Distance to the end of the active step. */
  readonly maneuverDistanceM: number;
  /** The fix snapped onto the route, or null before the first accepted fix. */
  readonly snapped: VenueCoordinate | null;
  readonly signal: LiveSignal;
  readonly rerouting: boolean;
  /** The last reroute outcome: a replacement route, or the old route kept because none could be found. */
  readonly notice: 'rerouted' | 'kept_route' | null;
}

export interface NavigationControllerState {
  readonly venueId: string;
  /** Null while browsing. A new trip always gets a new id. */
  readonly sessionId: string | null;
  readonly phase: NavigationPhase;
  readonly destinationId: string | null;
  readonly originId: string | null;
  readonly originSource: Extract<NavigationStartSource, 'manual_place' | 'live_gps'> | null;
  /** The entry gate chosen for outside routing, or null for the provider's own choice. Reset by a new destination. */
  readonly entryGateId: string | null;
  readonly loadState: NavigationLoadState;
  readonly error: NavigationError | null;
  readonly route: NavigationRoute | null;
  readonly stepIndex: number;
  readonly liveAttempt: LiveAttemptState;
  /** Non-null only while `liveAttempt.status` is `candidate`. */
  readonly liveCandidate: LiveCandidate | null;
  /** Non-null from the moment live starts until Exit. */
  readonly live: LiveState | null;
  /** The SDK's authoritative journey name; null while browsing. */
  readonly presentation: JourneyPresentationState | null;
  /** A ready route is waiting in the preview and the guide has not begun. */
  readonly canStartGuide: boolean;
}

export interface RouteFinderInput {
  readonly graph: VenueRoutingGraph;
  readonly startIds: readonly string[];
  readonly goalIds: readonly string[];
  /** Aborted when the request is superseded or the trip ends; a finder that can stop early should. */
  readonly signal: AbortSignal;
}
export type RouteFinder = (input: RouteFinderInput) => VenueRoute<VenueEdge> | undefined | Promise<VenueRoute<VenueEdge> | undefined>;

/**
 * The host's location capability, injected. The SDK never reads GPS or permission state itself.
 * Precision must be mapped honestly: 'fine' only for full precision (Android fine / iOS full accuracy).
 */
export interface NavigationLocationAdapter {
  /** Current permission, precision and services state. Never prompts. */
  getPermission(): Promise<LocationPermissionInput>;
  /** Shows the system prompt. Called only from requestLive(), i.e. because the user asked. */
  requestPermission(): Promise<LocationPermissionInput>;
  /** One fresh live fix, or null. Never a remembered or last-known position. */
  getCurrentFix(signal: AbortSignal): Promise<LiveFixCoordinate | null>;
  /** Continuous live fixes while navigating; returns the stop function. */
  watch(onFix: (fix: LiveFixCoordinate) => void): () => void;
}

/**
 * A walking route from outside the venue, composed by the host (street geometry, the chosen entry gate and the venue part). The controller
 * validates it and tracks it like any other route; it never builds street routes itself.
 */
export interface OutsideRoute {
  /** From the walker to the destination, in order. */
  readonly points: readonly VenueCoordinate[];
  /** Copy-free steps ending in `arrive`; their distances must add up to the polyline's length. */
  readonly steps: readonly RouteStep[];
  /** A straight-line guide with no walkable street route: it can inform the walker but can never start Live. */
  readonly directGuide?: boolean;
}
export interface OutsideRouteRequest {
  readonly from: VenueCoordinate;
  readonly destination: VenuePlace;
  /** The entry gate the walker chose with selectEntryGate(), or null to let the provider choose. */
  readonly entryGateId: string | null;
  /** Aborted when the request is superseded or the trip ends. */
  readonly signal: AbortSignal;
}
export interface OutsideRouteProvider {
  /** The gates the walker may choose between; the controller ignores any other id. */
  readonly entryGates?: readonly { readonly id: string; readonly label: string }[];
  /** Null means there is no route. Throwing or rejecting is treated the same way. */
  route(request: OutsideRouteRequest): OutsideRoute | null | Promise<OutsideRoute | null>;
}

export interface NavigationControllerOptions {
  readonly venue: VenueDataSource;
  /** Replaces the default synchronous offline A*, e.g. to route over a pack that loads asynchronously. */
  readonly findRoute?: RouteFinder;
  /** Host-supplied trip ids (the SDK reads no clock or randomness). Defaults to `<venueId>#<n>`. */
  readonly createSessionId?: () => string;
  /** Required with `location`: epoch milliseconds, the only source of "now" for fix freshness and cooldowns. */
  readonly now?: () => number;
  readonly location?: NavigationLocationAdapter;
  /** Routes for a walker outside the venue. Without it a fix outside the venue is refused (`outside_venue`). */
  readonly outside?: OutsideRouteProvider;
  /**
   * Whether a place may be routed to at all (a PlaceCatalog's `availability`). A destination it reports as `canRoute: false` (a known place with
   * no verified connection, or one with no location yet) is refused with a specific error: no route is searched or drawn, and neither Guide
   * nor Live is offered. A place it does not know is judged by the venue as before.
   */
  readonly availability?: (placeId: string) => PlaceAvailability | undefined;
  /** Walking speed for ETA. Default 1.4 m/s. */
  readonly walkingSpeedMps?: number;
  /** Reroute automatically when the walker leaves the route. Default true. */
  readonly autoReroute?: boolean;
  /** How far a fix may be from the nearest venue node and still count as inside the venue. Default 100 m. */
  readonly maxLiveSnapDistanceM?: number;
}

export interface NavigationController {
  /** Referentially stable until something changes, so it is safe as a useSyncExternalStore snapshot. */
  getState(): NavigationControllerState;
  subscribe(listener: () => void): () => void;
  /** Every venue place this controller can route to or from, in venue order. The same array each call. */
  listPlaces(): readonly VenuePlace[];
  /** Begins a new trip. A manually chosen origin is kept and the route recalculated. Unknown ids are reported in state. */
  selectDestination(placeId: string): void;
  /** Manual start for the current trip; ignored until a destination is chosen and while live. */
  selectOrigin(placeId: string): void;
  /** The gates the outside-routing provider offers; empty without a provider. */
  listEntryGates(): readonly { readonly id: string; readonly label: string }[];
  /** Chooses the entry gate for outside routing. Unknown ids are ignored; a prepared live route is retired; while live it reroutes now. */
  selectEntryGate(gateId: string | null): void;
  startGuide(): boolean;
  nextStep(): boolean;
  previousStep(): boolean;
  /**
   * The explicit user action that may start live navigation from the walker's real position. Resolves true when
   * live began. Every refusal is reported in `state.liveAttempt` and leaves the journey as it was.
   */
  requestLive(): Promise<boolean>;
  /**
   * The two-step start the Ijtema host uses: acquire a fresh precise fix and route from it, then stop at `state.liveCandidate` so the
   * walker can see the route. Resolves true when a candidate is ready. Nothing goes live and no watcher starts; the Manual Guide is untouched.
   */
  prepareLive(): Promise<boolean>;
  /**
   * The second explicit action: re-reads permission (never prompts), takes a fresh fix and starts Live on the candidate only if the walker is
   * still within 20 m of where it was prepared. Every refusal is reported in `state.liveAttempt` and drops the candidate.
   */
  confirmLive(): Promise<boolean>;
  /** Drops a candidate or an acquisition still in flight. A late fix cannot revive it. */
  cancelLive(): void;
  /** Feeds one live fix. Wired to the adapter's watch on live start; also callable by hosts that run their own watcher. */
  ingestFix(fix: LiveFixCoordinate): void;
  /** Re-evaluates GPS loss against the clock. Call about once a second while live. */
  tick(): void;
  /** Foreground resume while live: re-reads permission, restarts the watcher and rejects fixes cached while backgrounded. */
  resume(): Promise<void>;
  /**
   * Asks for a new live route from the last accepted position now: no autoReroute setting, no cooldown, and it supersedes a reroute in
   * flight. False when not live. Use it for "try again" after a failed outside route.
   */
  requestReroute(): boolean;
  /** Ends the trip and cancels anything still in flight. Idempotent. */
  exit(): void;
  dispose(): void;
}

type Core = Omit<NavigationControllerState, 'venueId' | 'presentation' | 'canStartGuide'>;
const FAILED = Symbol('route finder failed');
type Found = VenueRoute<VenueEdge> | undefined | typeof FAILED;

interface Track {
  boundaryMs: number;
  permission: LocationPermissionInput;
  lastFixAtMs: number | null;
  /** High-water mark of every observation time this trip has seen: time only moves forward, so a replay of an older fix is no news. */
  lastObservedAtMs: number | null;
  /** Identifies the one watcher whose fixes the trip accepts; null when none is owned. */
  watchOwner: object | null;
  lastAcceptedObservedAtMs: number | null;
  previousProgressM: number;
  previousEtaMinutes: number | undefined;
  consecutiveOffRoute: number;
  offRouteStartMs: number | null;
  offRouteAnchor: VenueCoordinate | null;
  lastRerouteAtMs: number | null;
  stopWatch: (() => void) | null;
  lastAcceptedPoint: VenueCoordinate | null;
  /** Aborts the fresh-fix request made on resume. */
  fixAbort: AbortController | null;
}

const isThenable = <T>(value: T | Promise<T>): value is Promise<T> => typeof (value as Promise<T> | null)?.then === 'function';
const IDLE_ATTEMPT: LiveAttemptState = { status: 'idle', blocker: null };
const NO_GATES: readonly { readonly id: string; readonly label: string }[] = [];
/** The host's refresh-route rule: a prepared route is only good while the walker is still near where it was prepared. */
const CANDIDATE_MAX_DRIFT_M = 20;

interface PendingLive {
  readonly request: NavigationSessionRequest;
  readonly route: NavigationRoute;
  readonly permission: LocationPermissionInput;
  readonly fix: LiveFixCoordinate;
  /** The clock when the fix was taken: how long the route search has been keeping the walker waiting. */
  readonly fixedAtMs: number;
}
/** A one-step Live start that waited longer than this for its route re-reads permission and takes a new fix before it commits. */
const REVALIDATE_AFTER_MS = 5_000;
/** An outside route must begin near the walker and end at the chosen destination; the provider is not trusted for either. */
const OUTSIDE_START_TOLERANCE_M = 100;
const OUTSIDE_END_TOLERANCE_M = 25;

export function createNavigationController(options: NavigationControllerOptions): NavigationController {
  const { venue, location } = options;
  if (location && !options.now) throw new Error('a location adapter needs an injected clock (options.now)');
  const now = options.now ?? (() => 0);
  const speedMps = options.walkingSpeedMps ?? 1.4;
  const autoReroute = options.autoReroute ?? true;
  const maxSnapM = options.maxLiveSnapDistanceM ?? 100;
  const findRoute: RouteFinder = options.findRoute ?? (({ graph, startIds, goalIds }) => findBestVenuePath(graph, startIds, goalIds));
  let trips = 0;
  const createSessionId = options.createSessionId ?? (() => `${venue.venueId}#${(trips += 1)}`);

  const derive = (core: Core): NavigationControllerState => {
    const presentation = core.destinationId === null
      ? null
      : selectJourneyPresentationState({
        navigation: core.phase === 'live' ? 'active' : core.phase === 'arrived' ? 'arrived' : 'none',
        loadState: core.loadState,
        startSource: core.originSource ?? 'manual_place',
        liveReady: core.phase === 'live',
        route: core.route ? {} : null,
      });
    return { ...core, venueId: venue.venueId, presentation, canStartGuide: core.phase === 'preview' && presentation !== null && isJourneyStartable(presentation) };
  };
  const IDLE = derive({
    sessionId: null, phase: 'browsing', destinationId: null, originId: null, originSource: null, entryGateId: null, loadState: 'idle',
    error: null, route: null, stepIndex: 0, liveAttempt: IDLE_ATTEMPT, liveCandidate: null, live: null,
  });

  let state = IDLE;
  let session: NavigationSession | null = null;
  let track: Track | null = null;
  let pending: PendingLive | null = null;
  let disposed = false;
  let grid: SpatialGrid | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: NavigationControllerState) => {
    state = next;
    for (const listener of [...listeners]) if (listeners.has(listener)) listener();
  };
  const update = (patch: Partial<Core>) => publish(derive({ ...state, ...patch }));
  const updateLive = (patch: Partial<LiveState>, core: Partial<Core> = {}) => {
    if (state.live) update({ ...core, live: { ...state.live, ...patch } });
  };

  // A malformed place (no nodes) is as unknown as a missing one.
  const resolvePlace = (id: string): VenuePlace | undefined => {
    const place = venue.getPlace(id);
    return place && Array.isArray(place.nodeIds) && place.nodeIds.length > 0 ? place : undefined;
  };

  let places: readonly VenuePlace[] | null = null;

  const makeRoute = (originId: string, destinationId: string, found: VenueRoute<VenueEdge>): NavigationRoute => ({
    originId, destinationId, nodeIds: [...found.nodes], distanceM: found.distanceM,
    steps: buildRouteSteps(found, venue.graph), line: buildRouteLine(found.nodes, found.edges, venue.graph) ?? null,
  });

  // Runs the finder once. `done` is called exactly once: synchronously for a synchronous finder, later otherwise.
  const runFinder = (startIds: readonly string[], goalIds: readonly string[], signal: AbortSignal, done: (found: Found) => void, onPending?: () => void) => {
    let result: ReturnType<RouteFinder>;
    try {
      result = findRoute({ graph: venue.graph, startIds, goalIds, signal });
    } catch {
      return done(FAILED);
    }
    if (isThenable(result)) {
      onPending?.();
      result.then(done, () => done(FAILED));
    } else {
      done(result);
    }
  };

  const calculate = (destination: VenuePlace, originId: string | null, entryGateId: string | null): void => {
    const active = session!;
    // Every recalculation retires whatever was in flight, including when it ends without routing.
    const request = active.beginRequest();
    const core = (patch: Partial<Core>): Core => ({
      sessionId: active.id, phase: 'preview', destinationId: destination.id, originId,
      originSource: originId === null ? null : 'manual_place', entryGateId, loadState: 'idle', error: null, route: null,
      stepIndex: 0, liveAttempt: IDLE_ATTEMPT, liveCandidate: null, live: null, ...patch,
    });
    const availability = options.availability?.(destination.id);
    if (availability && !availability.canRoute) return publish(derive(core({ loadState: 'error', error: availability.status === 'unreachable' ? 'destination_unreachable' : 'destination_not_located' })));
    if (originId === null) return publish(derive(core({ loadState: 'needs_origin' })));
    const origin = resolvePlace(originId);
    if (!origin) return publish(derive(core({ originId: null, originSource: null, loadState: 'error', error: 'unknown_place' })));
    if (origin.id === destination.id) return publish(derive(core({ loadState: 'same_place' })));

    const settle = (patch: Partial<Core>) => request.commit(() => publish(derive(core(patch))));
    runFinder(origin.nodeIds, destination.nodeIds, request.signal, (found) => {
      try {
        if (found === FAILED) return void settle({ loadState: 'error', error: 'route_failed' });
        if (!found) return void settle({ loadState: 'error', error: 'no_route' });
        if (found.nodes.length === 0) return void settle({ loadState: 'error', error: 'route_failed' });
        if (found.edges.length === 0) return void settle({ loadState: 'same_place' }); // different places on one node
        settle({ loadState: 'ready', route: makeRoute(origin.id, destination.id, found) });
      } catch {
        settle({ loadState: 'error', error: 'route_failed' });
      }
    }, () => publish(derive(core({ loadState: 'loading' }))));
  };

  // ---- live ----

  const nearestNode = (point: VenueCoordinate): { id: string; distanceM: number } | undefined => {
    grid ??= new SpatialGrid(venue.graph.nodeIds().flatMap((id) => {
      const node = venue.graph.getNode(id);
      return node ? [{ id, lat: node.coordinate.lat, lng: node.coordinate.lng }] : [];
    }));
    const near = grid.nearest(point.lat, point.lng, maxSnapM);
    return near ? { id: near.point.id, distanceM: near.distanceM } : undefined;
  };

  const stopWatch = () => {
    const stop = track?.stopWatch;
    if (track) {
      track.stopWatch = null;
      track.watchOwner = null;
      track.fixAbort?.abort();
      track.fixAbort = null;
    }
    stop?.();
  };
  const endTrip = () => {
    stopWatch();
    track = null;
    pending = null;
    session?.cancel();
    session?.dispose();
    session = null;
  };
  const resetEvidence = (tr: Track) => {
    tr.consecutiveOffRoute = 0;
    tr.offRouteStartMs = null;
    tr.offRouteAnchor = null;
  };
  const setSignal = (signal: LiveSignal) => {
    if (state.live && state.live.signal !== signal) updateLive({ signal });
  };

  const beginLive = (route: NavigationRoute, permission: LocationPermissionInput, firstFix: LiveFixCoordinate) => {
    const line = route.line!;
    const tr: Track = {
      // The start fix was validated as live, so it is the oldest fix this watcher generation may accept.
      boundaryMs: firstFix.observedAtMs ?? now(), permission, lastFixAtMs: now(), lastObservedAtMs: null, watchOwner: null,
      lastAcceptedObservedAtMs: null, previousProgressM: 0, previousEtaMinutes: undefined, consecutiveOffRoute: 0,
      offRouteStartMs: null, offRouteAnchor: null, lastRerouteAtMs: null, stopWatch: null, lastAcceptedPoint: null, fixAbort: null,
    };
    track = tr;
    update({
      phase: 'live', originId: LIVE_ORIGIN_ID, originSource: 'live_gps', loadState: 'ready', error: null, route, stepIndex: 0,
      liveAttempt: IDLE_ATTEMPT, liveCandidate: null,
      live: {
        progressM: 0, remainingM: line.totalM, etaMinutes: Math.ceil(line.totalM / speedMps / 60),
        maneuverDistanceM: route.steps[0].distanceM, snapped: null, signal: 'good', rerouting: false, notice: null,
      },
    });
    // A subscriber may have exited, disposed or changed the destination while Live was published: then there is no trip to watch.
    if (track !== tr) return;
    startWatch(tr);
    if (track !== tr) return;
    ingestFix(firstFix);
  };

  // A watcher delivers fixes only while it is the one the trip owns, so a stopped or superseded watcher that still calls back is deaf,
  // and a watcher the adapter hands back after the trip moved on is stopped at once.
  const startWatch = (tr: Track) => {
    const owner = {};
    tr.watchOwner = owner;
    const stop = location!.watch((fix) => { if (track === tr && tr.watchOwner === owner) ingestFix(fix); });
    if (track !== tr || tr.watchOwner !== owner) return stop();
    tr.stopWatch = stop;
  };
  const stillLive = (tr: Track): boolean => track === tr && state.phase === 'live' && state.live !== null;

  const validPoint = (p: VenueCoordinate): boolean =>
    p != null && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

  // The provider is a trust boundary: its route is only used if it is a finite polyline with steps that agree with it.
  const toOutsideRoute = (from: VenueCoordinate, destination: VenuePlace, out: OutsideRoute | null | undefined): NavigationRoute | 'direct' | null => {
    if (!out) return null;
    if (out.directGuide) return 'direct';
    const { points, steps } = out;
    if (!Array.isArray(points) || points.length < 2 || !points.every(validPoint)) return null;
    if (!Array.isArray(steps) || steps.length === 0 || steps[steps.length - 1].kind !== 'arrive') return null;
    if (!steps.every((st) => Number.isFinite(st.distanceM) && st.distanceM >= 0)) return null;
    const cumulativeM = [0];
    for (let i = 1; i < points.length; i += 1) cumulativeM.push(cumulativeM[i - 1] + haversineM(points[i - 1], points[i]));
    const totalM = cumulativeM[cumulativeM.length - 1];
    const stepsM = steps.reduce((sum, st) => sum + st.distanceM, 0);
    if (!(totalM > 0) || Math.abs(stepsM - totalM) > Math.max(5, totalM * 0.02)) return null;
    // Bind the geometry to the journey that was asked for: it starts at the walker and finishes at the chosen destination.
    if (haversineM(points[0], from) > OUTSIDE_START_TOLERANCE_M) return null;
    const end = points[points.length - 1];
    const reachesDestination = destination.nodeIds.some((id) => {
      const node = venue.graph.getNode(id);
      return node !== undefined && haversineM(end, node.coordinate) <= OUTSIDE_END_TOLERANCE_M;
    });
    if (!reachesDestination) return null;
    return { originId: LIVE_ORIGIN_ID, destinationId: destination.id, nodeIds: [], distanceM: totalM, steps: [...steps], line: { points: [...points], cumulativeM, totalM } };
  };
  const askOutside = async (point: VenueCoordinate, destination: VenuePlace, signal: AbortSignal): Promise<NavigationRoute | 'direct' | null> => {
    try {
      const out = await options.outside!.route({ from: point, destination, entryGateId: state.entryGateId, signal });
      return toOutsideRoute(point, destination, out);
    } catch {
      return null;
    }
  };

  const reroute = (point: VenueCoordinate, tr: Track) => {
    const active = session;
    const destination = state.destinationId === null ? undefined : resolvePlace(state.destinationId);
    const near = nearestNode(point);
    const keep = () => {
      tr.lastRerouteAtMs = now();
      resetEvidence(tr);
      if (state.phase === 'live') updateLive({ rerouting: false, notice: 'kept_route' });
    };
    // Outside the venue only the host's provider can offer a walking route; without one the current route stays.
    if (!active || !destination || (!near && !options.outside)) return keep();
    const request = active.beginRequest();
    updateLive({ rerouting: true });
    if (session !== active || !stillLive(tr)) return; // a subscriber ended or replaced the trip while this was published
    const land = (route: NavigationRoute | null) => request.commit(() => {
      try {
        if (!route || !route.line) return keep();
        tr.previousProgressM = 0;
        tr.lastAcceptedObservedAtMs = null;
        tr.previousEtaMinutes = undefined;
        tr.lastRerouteAtMs = now();
        resetEvidence(tr);
        update({
          route, stepIndex: 0,
          live: {
            ...state.live!, progressM: 0, remainingM: route.line.totalM, maneuverDistanceM: route.steps[0].distanceM,
            rerouting: false, notice: 'rerouted',
          },
        });
      } catch {
        keep();
      }
    });
    if (near) {
      runFinder([near.id], destination.nodeIds, request.signal, (found) => {
        let route: NavigationRoute | null = null;
        try {
          if (found !== FAILED && found && found.edges.length > 0) route = makeRoute(LIVE_ORIGIN_ID, destination.id, found);
        } catch {
          route = null;
        }
        land(route);
      });
    } else {
      void askOutside(point, destination, request.signal).then((out) => land(out === 'direct' ? null : out));
    }
  };

  const ingestFix = (fix: LiveFixCoordinate) => {
    const tr = track;
    const route = state.route;
    if (disposed || state.phase !== 'live' || !tr || !route?.line || !state.live) return;
    const nowMs = now();
    const observedAt = fix.observedAtMs;
    // Android/Play Services can deliver a cached last-known fix first after a (re)subscribe: it must not become progress.
    if (observedAt != null && observedAt < tr.boundaryMs - STALE_FIX_CLOCK_TOLERANCE_MS) return;
    // One physical observation counts once, and time only moves forward: a duplicate, an out-of-order or a replayed older fix is no news,
    // whether the watcher or a one-shot request delivered it. A time from the future cannot move the mark (it is stale anyway).
    if (observedAt != null && tr.lastObservedAtMs !== null && observedAt <= tr.lastObservedAtMs) return;
    if (observedAt != null && Number.isFinite(observedAt) && observedAt <= nowMs + STALE_FIX_CLOCK_TOLERANCE_MS) tr.lastObservedAtMs = observedAt;

    const capability = evaluateLocationCapability({ permission: tr.permission, liveFix: fix, nowMs });
    if (capability.liveBlocker !== null) {
      // Loss of authority or fix quality freezes movement, arrival and reroute evidence while the journey is kept.
      resetEvidence(tr);
      const trustworthyWeak = capability.liveBlocker === 'weak_fix' && observedAt != null && isValidCoordinate(fix) &&
        fix.accuracy != null && Number.isFinite(fix.accuracy) && fix.accuracy >= 0;
      if (trustworthyWeak) tr.lastFixAtMs = nowMs;
      return setSignal(trustworthyWeak ? 'weak' : 'lost');
    }

    tr.lastFixAtMs = nowMs;
    const point: VenueCoordinate = { lat: fix.latitude, lng: fix.longitude };
    tr.lastAcceptedPoint = point;
    const progress = advanceProgress({
      line: route.line, point, previousProgressM: tr.previousProgressM, observedAtMs: observedAt,
      previousObservedAtMs: tr.lastAcceptedObservedAtMs, accuracyM: fix.accuracy, speedMps, previousEtaMinutes: tr.previousEtaMinutes,
    });
    tr.previousProgressM = progress.progressM;
    tr.lastAcceptedObservedAtMs = observedAt ?? null;
    tr.previousEtaMinutes = progress.etaMinutes;
    const located = locateStep(route.steps, state.stepIndex, progress.progressM);
    const liveUpdate: Partial<LiveState> = {
      progressM: progress.progressM, remainingM: progress.remainingM, etaMinutes: progress.etaMinutes,
      maneuverDistanceM: located.maneuverDistanceM, snapped: progress.snapped, signal: 'good',
    };

    // Arrival is latched and is the engine's authority boundary: nothing may reroute or replace the route afterwards.
    if (isArrivedAtDestination({
      stepIndex: located.stepIndex, stepCount: route.steps.length, point, destination: route.line.points[route.line.points.length - 1],
    })) {
      stopWatch();
      session?.cancel();
      return updateLive({ ...liveUpdate, rerouting: false }, { phase: 'arrived', stepIndex: located.stepIndex });
    }
    updateLive(liveUpdate, { stepIndex: located.stepIndex });
    if (!stillLive(tr)) return; // a subscriber exited, disposed or changed the destination while this was published

    if (progress.distanceToRouteM <= offRouteThresholdM(fix.accuracy ?? 0)) return resetEvidence(tr);
    if (state.live!.rerouting) return; // one reroute at a time
    tr.consecutiveOffRoute += 1;
    tr.offRouteStartMs ??= nowMs;
    tr.offRouteAnchor ??= point;
    if (autoReroute && shouldTriggerReroute({
      consecutiveOffRouteCount: tr.consecutiveOffRoute,
      offRouteDurationMs: nowMs - tr.offRouteStartMs,
      cooldownRemainingMs: tr.lastRerouteAtMs === null ? 0 : Math.max(0, REROUTE_COOLDOWN_MS - (nowMs - tr.lastRerouteAtMs)),
      movedDistanceM: haversineM(tr.offRouteAnchor, point),
    })) reroute(point, tr);
  };

  const blocked = (blocker: LiveStartBlocker) => update({ liveAttempt: { status: 'blocked', blocker }, liveCandidate: null });

  // Acquires everything a live start needs and stops one step short of committing it: permission, a fresh precise fix inside the venue,
  // and a route from where the walker stands. The returned request has just been checked to still own the trip.
  const acquireLive = async (): Promise<PendingLive | null> => {
    if (disposed || !session || state.destinationId === null) return null;
    if (state.phase !== 'preview' && state.phase !== 'guide') return null;
    if (!location) return blocked('unsupported'), null;
    // Superseding a route still being calculated would strand the preview, so wait for it.
    if (state.loadState === 'loading') return blocked('route_pending'), null;

    const request = session.beginRequest();
    pending = null;
    update({ liveAttempt: { status: 'requesting', blocker: null }, liveCandidate: null });
    const block = (blocker: LiveStartBlocker): null => {
      request.commit(() => blocked(blocker));
      return null;
    };

    let permission: LocationPermissionInput;
    try {
      permission = await location.getPermission();
      if (!request.canCommit()) return null;
      if (!permission.granted) {
        permission = await location.requestPermission(); // the user pressed the button: this is the only prompt
        if (!request.canCommit()) return null;
      }
    } catch {
      return block('permission_needed');
    }
    if (!permission.granted) return block(permission.canAskAgain ? 'permission_needed' : 'permission_blocked');

    let fix: LiveFixCoordinate | null;
    try {
      fix = await location.getCurrentFix(request.signal);
    } catch {
      return block('no_fix');
    }
    if (!request.canCommit()) return null;
    const capability = evaluateLocationCapability({ permission, liveFix: fix, nowMs: now() });
    if (capability.liveBlocker !== null || fix === null) return block((capability.liveBlocker ?? 'no_fix') as LiveStartBlocker);
    const fixedAtMs = now();

    const point: VenueCoordinate = { lat: fix.latitude, lng: fix.longitude };
    const near = nearestNode(point);
    if (!near && !options.outside) return block('outside_venue');
    const destination = resolvePlace(state.destinationId);
    if (!destination) return block('no_route');

    let route: NavigationRoute;
    if (near) {
      if (destination.nodeIds.includes(near.id)) return block('already_at_destination');
      const found = await new Promise<Found>((resolve) => runFinder([near.id], destination.nodeIds, request.signal, resolve));
      if (!request.canCommit()) return null;
      if (found === FAILED || !found || found.edges.length === 0) return block('no_route');
      route = makeRoute(LIVE_ORIGIN_ID, destination.id, found);
    } else {
      const outside = await askOutside(point, destination, request.signal);
      if (!request.canCommit()) return null;
      if (outside === 'direct') return block('outside_venue');
      if (outside === null) return block('no_route');
      route = outside;
    }
    if (!route.line) return block('no_route');
    return { request, route, permission, fix, fixedAtMs };
  };

  // What a live start learned before its last await can be out of date when it commits (a slow route search, a revoked permission, a walker who
  // moved on). Re-reads permission (never prompts) and, when asked or when the fix is no longer live, takes a new fix that must still be near
  // where the route was made. Resolves the permission and fix to start with, a blocker, or null when the request was superseded.
  const revalidate = async (live: PendingLive, reacquire: boolean): Promise<{ permission: LocationPermissionInput; fix: LiveFixCoordinate } | LiveStartBlocker | null> => {
    const { request } = live;
    let permission: LocationPermissionInput;
    try {
      permission = await location!.getPermission();
    } catch {
      permission = { granted: false, canAskAgain: true };
    }
    if (!request.canCommit()) return null;
    if (!permission.granted) return permission.canAskAgain ? 'permission_needed' : 'permission_blocked';
    if (!reacquire && evaluateLocationCapability({ permission, liveFix: live.fix, nowMs: now() }).liveBlocker === null) return { permission, fix: live.fix };

    let fix: LiveFixCoordinate | null;
    try {
      fix = await location!.getCurrentFix(request.signal);
    } catch {
      return 'no_fix';
    }
    if (!request.canCommit()) return null;
    const capability = evaluateLocationCapability({ permission, liveFix: fix, nowMs: now() });
    if (capability.liveBlocker !== null || fix === null) return (capability.liveBlocker ?? 'no_fix') as LiveStartBlocker;
    if (haversineM({ lat: fix.latitude, lng: fix.longitude }, { lat: live.fix.latitude, lng: live.fix.longitude }) > CANDIDATE_MAX_DRIFT_M) return 'route_outdated';
    return { permission, fix };
  };

  const requestLive = async (): Promise<boolean> => {
    if (!disposed && state.phase === 'live') return true;
    const live = await acquireLive();
    if (live === null) return false;
    const settled = await revalidate(live, now() - live.fixedAtMs > REVALIDATE_AFTER_MS);
    if (settled === null) return false;
    if (typeof settled === 'string') {
      live.request.commit(() => blocked(settled));
      return false;
    }
    return live.request.commit(() => beginLive(live.route, settled.permission, settled.fix));
  };

  const prepareLive = async (): Promise<boolean> => {
    const live = await acquireLive();
    if (live === null) return false;
    return live.request.commit(() => {
      // Committing retires the acquisition request; the candidate holds a new one so anything that supersedes it also retires the candidate.
      pending = { ...live, request: session!.beginRequest() };
      update({
        liveAttempt: { status: 'candidate', blocker: null },
        liveCandidate: { route: live.route, etaMinutes: Math.ceil(live.route.line!.totalM / speedMps / 60) },
      });
    });
  };

  const confirmLive = async (): Promise<boolean> => {
    const candidate = pending;
    if (disposed || !candidate || !location || state.phase === 'live' || !candidate.request.canCommit()) return false;
    pending = null; // a second tap while this one is in flight must not start a second live
    const { request } = candidate;
    const settled = await revalidate(candidate, true);
    if (settled === null) return false;
    if (typeof settled === 'string') {
      request.commit(() => blocked(settled));
      return false;
    }
    return request.commit(() => beginLive(candidate.route, settled.permission, settled.fix));
  };

  const cancelLive = () => {
    if (disposed || !session || (state.liveAttempt.status !== 'requesting' && state.liveAttempt.status !== 'candidate')) return;
    pending = null;
    session.beginRequest(); // retires the acquisition or candidate; anything late can no longer commit
    update({ liveAttempt: IDLE_ATTEMPT, liveCandidate: null });
  };

  let resumes = 0;
  const resume = async (): Promise<void> => {
    const tr = track;
    if (disposed || state.phase !== 'live' || !tr || !location) return;
    const mine = (resumes += 1);
    tr.boundaryMs = now();
    stopWatch();
    resetEvidence(tr);
    let permission: LocationPermissionInput;
    try {
      permission = await location.getPermission(); // never prompts on resume
    } catch {
      permission = { granted: false, canAskAgain: true };
    }
    // Only the newest resume may decide: an older one that finishes late must not replace what the newer one saw, start a second watcher
    // or outlive an Exit.
    if (disposed || track !== tr || state.phase !== 'live' || mine !== resumes) return;
    tr.permission = permission;
    if (permission.granted) {
      startWatch(tr);
      if (track !== tr) return;
      // The watcher may take a while to reacquire after a long background gap; ask for one fresh fix now, as the host does.
      const request = new AbortController();
      tr.fixAbort = request;
      void Promise.resolve().then(() => location.getCurrentFix(request.signal)).then(
        (fix) => { if (fix && !request.signal.aborted && track === tr) ingestFix(fix); },
        () => {},
      );
    }
    const stale = !permission.granted || tr.lastFixAtMs === null || now() - tr.lastFixAtMs >= GPS_LOST_TIMEOUT_MS;
    if (stale) setSignal('lost');
  };

  const requestReroute = (): boolean => {
    const tr = track;
    if (disposed || state.phase !== 'live' || !tr || !tr.lastAcceptedPoint || !state.live) return false;
    reroute(tr.lastAcceptedPoint, tr);
    return true;
  };

  const inGuide = () => state.phase === 'guide' && state.route !== null;
  const stepTo = (index: number): boolean => {
    if (!inGuide() || index < 0 || index >= state.route!.steps.length || index === state.stepIndex) return false;
    update({ stepIndex: index });
    return true;
  };

  return {
    getState: () => state,
    listPlaces: () => (places ??= venue.placeIds().flatMap((id) => resolvePlace(id) ?? [])),
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    selectDestination(placeId) {
      if (disposed) return;
      // A place the catalog lists but cannot route to (no node at all) still gets a trip, so the walker is told why instead of "not found".
      const known = options.availability?.(placeId);
      const destination = resolvePlace(placeId) ?? (known && !known.canRoute ? { id: placeId, kind: 'unavailable', nodeIds: [] } : undefined);
      if (!destination) {
        if (state.error !== 'unknown_place') update({ error: 'unknown_place' });
        return;
      }
      // Only a manual origin survives a change of destination; the walker's own position is asked for again.
      const keptOriginId = state.originSource === 'manual_place' ? state.originId : null;
      endTrip();
      session = createNavigationSession(createSessionId());
      session.start();
      calculate(destination, keptOriginId, null);
    },
    selectOrigin(placeId) {
      if (disposed || !session || state.destinationId === null) return;
      if (state.phase !== 'preview' && state.phase !== 'guide') return;
      const destination = resolvePlace(state.destinationId);
      if (destination) calculate(destination, placeId, state.entryGateId);
    },
    listEntryGates: () => options.outside?.entryGates ?? NO_GATES,
    selectEntryGate(gateId) {
      if (disposed || state.destinationId === null || gateId === state.entryGateId) return;
      if (gateId !== null && !options.outside?.entryGates?.some((gate) => gate.id === gateId)) return;
      cancelLive(); // a prepared route belongs to the gate it was prepared for
      update({ entryGateId: gateId });
      if (state.phase === 'live') requestReroute();
    },
    startGuide() {
      if (disposed || !state.canStartGuide) return false;
      update({ phase: 'guide', stepIndex: 0 });
      return true;
    },
    nextStep: () => stepTo(state.stepIndex + 1),
    previousStep: () => stepTo(state.stepIndex - 1),
    requestLive,
    prepareLive,
    confirmLive,
    cancelLive,
    ingestFix,
    tick() {
      if (disposed || state.phase !== 'live' || !track || !state.live) return;
      if (track.lastFixAtMs === null || now() - track.lastFixAtMs >= GPS_LOST_TIMEOUT_MS) {
        resetEvidence(track);
        setSignal('lost');
      }
    },
    resume,
    requestReroute,
    exit() {
      endTrip();
      if (!disposed && state !== IDLE) publish(IDLE);
    },
    dispose() {
      if (disposed) return;
      endTrip();
      disposed = true;
      listeners.clear();
      state = IDLE; // nobody is listening, but a late getState() must not describe a live trip that no longer exists
    },
  };
}
