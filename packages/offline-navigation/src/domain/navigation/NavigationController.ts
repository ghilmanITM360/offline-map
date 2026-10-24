/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Headless navigation controller: the one object a host (or the ready-made screen) drives to plan a trip and walk
// the Manual Guide. It owns no UI, no GPS and no clock. It composes the existing pieces instead of restating them:
// NavigationSession decides which asynchronous result may commit, findBestVenuePath routes, and
// selectJourneyPresentationState names the journey. One trip is one session: choosing a destination starts a new
// session, so anything still in flight for the previous trip can no longer commit; Exit cancels it.

import { selectJourneyPresentationState, isJourneyStartable, type JourneyPresentationState } from '../journey/JourneyPresentationState';
import { createNavigationSession, type NavigationSession } from '../session/NavigationSession';
import type { VenueDataSource, VenueEdge, VenuePlace, VenueRoutingGraph } from '../venue/VenueDataSource';
import { findBestVenuePath, type VenueRoute } from '../venue/VenueRouting';
import { buildRouteSteps, type RouteStep } from './RouteSteps';

/** browsing: no trip. preview: a destination is chosen (route ready or pending a start). guide: Manual Guide stepping. */
export type NavigationPhase = 'browsing' | 'preview' | 'guide';
/** The load states of JourneyPresentationInput, so the presentation policy is applied unchanged. */
export type NavigationLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'needs_origin' | 'same_place';
export type NavigationError = 'unknown_place' | 'no_route' | 'route_failed';

export interface NavigationRoute {
  readonly originId: string;
  readonly destinationId: string;
  readonly nodeIds: readonly string[];
  /** Walking length in metres (not the weighted search cost). */
  readonly distanceM: number;
  readonly steps: readonly RouteStep[];
}

export interface NavigationControllerState {
  readonly venueId: string;
  /** Null while browsing. A new trip always gets a new id. */
  readonly sessionId: string | null;
  readonly phase: NavigationPhase;
  readonly destinationId: string | null;
  readonly originId: string | null;
  readonly loadState: NavigationLoadState;
  readonly error: NavigationError | null;
  readonly route: NavigationRoute | null;
  readonly stepIndex: number;
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

export interface NavigationControllerOptions {
  readonly venue: VenueDataSource;
  /** Replaces the default synchronous offline A*, e.g. to route over a pack that loads asynchronously. */
  readonly findRoute?: RouteFinder;
  /** Host-supplied trip ids (the SDK reads no clock or randomness). Defaults to `<venueId>#<n>`. */
  readonly createSessionId?: () => string;
}

export interface NavigationController {
  /** Referentially stable until something changes, so it is safe as a useSyncExternalStore snapshot. */
  getState(): NavigationControllerState;
  subscribe(listener: () => void): () => void;
  /** Begins a new trip. A chosen origin is kept and the route recalculated. Unknown ids are reported in state. */
  selectDestination(placeId: string): void;
  /** Manual start for the current trip; ignored until a destination is chosen. */
  selectOrigin(placeId: string): void;
  startGuide(): boolean;
  nextStep(): boolean;
  previousStep(): boolean;
  /** Ends the trip and cancels anything still in flight. Idempotent. */
  exit(): void;
  dispose(): void;
}

type Core = Omit<NavigationControllerState, 'venueId' | 'presentation' | 'canStartGuide'>;

const isThenable = <T>(value: T | Promise<T>): value is Promise<T> => typeof (value as Promise<T> | null)?.then === 'function';

export function createNavigationController(options: NavigationControllerOptions): NavigationController {
  const { venue } = options;
  const findRoute: RouteFinder = options.findRoute ?? (({ graph, startIds, goalIds }) => findBestVenuePath(graph, startIds, goalIds));
  let trips = 0;
  const createSessionId = options.createSessionId ?? (() => `${venue.venueId}#${(trips += 1)}`);

  const derive = (core: Core): NavigationControllerState => {
    const presentation = core.destinationId === null
      ? null
      : selectJourneyPresentationState({ loadState: core.loadState, startSource: 'manual_place', route: core.route ? {} : null });
    return { ...core, venueId: venue.venueId, presentation, canStartGuide: core.phase === 'preview' && presentation !== null && isJourneyStartable(presentation) };
  };
  const IDLE = derive({ sessionId: null, phase: 'browsing', destinationId: null, originId: null, loadState: 'idle', error: null, route: null, stepIndex: 0 });

  let state = IDLE;
  let session: NavigationSession | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  const publish = (next: NavigationControllerState) => {
    state = next;
    for (const listener of [...listeners]) if (listeners.has(listener)) listener();
  };
  const update = (patch: Partial<Core>) => publish(derive({ ...state, ...patch }));

  // A malformed place (no nodes) is as unknown as a missing one.
  const resolvePlace = (id: string): VenuePlace | undefined => {
    const place = venue.getPlace(id);
    return place && Array.isArray(place.nodeIds) && place.nodeIds.length > 0 ? place : undefined;
  };

  const calculate = (destination: VenuePlace, originId: string | null): void => {
    const active = session!;
    // Every recalculation retires whatever was in flight, including when it ends without routing.
    const request = active.beginRequest();
    const core = (patch: Partial<Core>): Core => ({
      sessionId: active.id, phase: 'preview', destinationId: destination.id, originId,
      loadState: 'idle', error: null, route: null, stepIndex: 0, ...patch,
    });
    if (originId === null) return publish(derive(core({ loadState: 'needs_origin' })));
    const origin = resolvePlace(originId);
    if (!origin) return publish(derive(core({ originId: null, loadState: 'error', error: 'unknown_place' })));
    if (origin.id === destination.id) return publish(derive(core({ loadState: 'same_place' })));

    const settle = (patch: Partial<Core>) => request.commit(() => publish(derive(core(patch))));
    const finish = (found: VenueRoute<VenueEdge> | undefined) => {
      try {
        if (!found) return settle({ loadState: 'error', error: 'no_route' });
        if (found.nodes.length === 0) return settle({ loadState: 'error', error: 'route_failed' });
        if (found.edges.length === 0) return settle({ loadState: 'same_place' }); // different places on one node
        const route: NavigationRoute = {
          originId: origin.id, destinationId: destination.id, nodeIds: [...found.nodes],
          distanceM: found.distanceM, steps: buildRouteSteps(found, venue.graph),
        };
        settle({ loadState: 'ready', route });
      } catch {
        settle({ loadState: 'error', error: 'route_failed' });
      }
    };

    let result: ReturnType<RouteFinder>;
    try {
      result = findRoute({ graph: venue.graph, startIds: origin.nodeIds, goalIds: destination.nodeIds, signal: request.signal });
    } catch {
      return void settle({ loadState: 'error', error: 'route_failed' });
    }
    if (isThenable(result)) {
      publish(derive(core({ loadState: 'loading' })));
      result.then(finish, () => void settle({ loadState: 'error', error: 'route_failed' }));
    } else {
      finish(result); // synchronous: one publish, no transient loading state
    }
  };

  const endTrip = () => {
    session?.cancel();
    session?.dispose();
    session = null;
  };

  const inGuide = () => state.phase === 'guide' && state.route !== null;
  const stepTo = (index: number): boolean => {
    if (!inGuide() || index < 0 || index >= state.route!.steps.length || index === state.stepIndex) return false;
    update({ stepIndex: index });
    return true;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    selectDestination(placeId) {
      if (disposed) return;
      const destination = resolvePlace(placeId);
      if (!destination) {
        if (state.error !== 'unknown_place') update({ error: 'unknown_place' });
        return;
      }
      const keptOriginId = state.originId;
      endTrip();
      session = createNavigationSession(createSessionId());
      session.start();
      calculate(destination, keptOriginId);
    },
    selectOrigin(placeId) {
      if (disposed || !session || state.destinationId === null) return;
      const destination = resolvePlace(state.destinationId);
      if (destination) calculate(destination, placeId);
    },
    startGuide() {
      if (disposed || !state.canStartGuide) return false;
      update({ phase: 'guide', stepIndex: 0 });
      return true;
    },
    nextStep: () => stepTo(state.stepIndex + 1),
    previousStep: () => stepTo(state.stepIndex - 1),
    exit() {
      endTrip();
      if (!disposed && state !== IDLE) publish(IDLE);
    },
    dispose() {
      if (disposed) return;
      endTrip();
      disposed = true;
      listeners.clear();
    },
  };
}
