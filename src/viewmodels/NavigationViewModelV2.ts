/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { localizeInstruction } from '../i18n/instructions';
import { getLocale, useLocaleStore } from '../i18n/localeStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getDistance } from 'geolib';
import { useAppStore } from '../store/useAppStore';
import { resolveNavigationStatus, useRouteUpdatedNotice } from './useRouteUpdatedNotice';
import type { NavigationStatusCopy } from './useRouteUpdatedNotice';
import { VoiceService } from '../services/VoiceService';
import {
  Coordinate,
  Place,
  V2ActiveRoute,
  V2NavigationInstruction,
} from '../models/types';
import { RerouteService } from '../services/RerouteService';
import { GPSManagerService } from '../services/GPSManagerService';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
import type { RoutePreviewV2 } from '../services/RoutingServiceV2';
import { destinationFromPlace } from '../services/V2DirectionsService';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { evaluateLocationCapability } from '../services/LocationCapability';
import { t } from '../i18n/translate';
import { isValidCoordinate } from '../utils/isValidCoordinate';
import { V2NavigationAdapter, isV2ActiveRoute } from '../services/V2NavigationAdapter';
import { OutsideRouteRequestCoordinator } from '../services/outsideRouting/OutsideRouteRequestCoordinator';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { getRoutableOfficialGates } from '../data/ijtema/entryPolicy';
import {
  buildV2RerouteRequest,
  calculateLiveManeuverDistanceV2,
  calculateNavigationProgressV2,
  deriveGpsSignalStateV2,
  evaluateRerouteEvidenceV2,
  GPS_LOST_TIMEOUT_MS,
  GpsSignalStateV2,
  shouldIgnorePoorAccuracyMovementV2,
} from '../services/V2NavigationRuntimeService';
import { ARRIVAL_THRESHOLD_METERS } from '../constants/navigation';
import { STALE_FIX_CLOCK_TOLERANCE_MS } from '../constants/navigation';

function currentLiveCapability() {
  const state = useAppStore.getState();
  const capability = evaluateLocationCapability({ permission: { granted: state.hasLocationPermission, canAskAgain: state.locationPermissionCanAskAgain, precision: state.locationPermissionPrecision, servicesState: state.locationServicesState }, liveFix: state.currentLocationSource === 'live' ? state.currentLocation : null });
  return state.locationServicesState === 'enabled' ? capability : { ...capability, mode: 'route_guide' as const };
}

const REROUTE_COOLDOWN_MS = 25_000;
const productionOutsideRouteSource = createProductionOutsideRouteSource();
const AVAILABLE_OUTSIDE_GATES = getRoutableOfficialGates().map((gate) => ({
  id: gate.id,
  label: gate.name.en,
}));

interface RerouteOptions {
  manualGateId?: string;
  explicit?: boolean;
}

function isArrived(route: V2ActiveRoute, coordinate: Coordinate | null, stepIndex: number): boolean {
  if (!coordinate || route.instructions.length === 0) return false;
  const lastIndex = route.instructions.length - 1;
  const lastInstruction = route.instructions[lastIndex];
  // Production appends an arrival marker at the final walking instruction's
  // endpoint. The walking segment already qualifies for proximity-based arrival.
  const finalSegmentIndex = lastInstruction.type === 'arrival' && lastIndex > 0 &&
    route.instructions[lastIndex - 1].routeIndex === lastInstruction.routeIndex
    ? lastIndex - 1
    : lastIndex;
  if (stepIndex < finalSegmentIndex) return false;
  return getDistance(coordinate, route.destination.coordinate) <= ARRIVAL_THRESHOLD_METERS;
}

function placeFromV2Destination(route: V2ActiveRoute, existingDestination: Place | null): Place | null {
  if (existingDestination) return existingDestination;
  const destination = route.destination;
  if (destination.type === 'facility') {
    return {
      id: destination.facilityId ?? route.routeId,
      name: destination.label,
      category: 'Landmark',
      description: destination.label,
      coordinate: destination.coordinate,
      sourceVersion: 'v1',
    };
  }
  return {
    id: destination.blockId ?? destination.gateId ?? route.routeId,
    name: destination.label,
    category: destination.type === 'gate' ? 'Gate' : destination.type === 'rasta' ? 'Rasta' : 'Block',
    description: destination.label,
    coordinate: destination.coordinate,
    sourceVersion: 'v2',
    sourceKind: destination.type,
  };
}

export type { RoutePreviewV2 } from '../services/RoutingServiceV2';

export interface NavigationPreviewStartInput {
  route: RoutePreviewV2 | null;
  destination: Place | null;
  startPlace?: Place | null;
  currentLocation?: Coordinate | null;
}

/** Compose and start the existing preview without mounting a second navigation watcher. */
export function startPreviewNavigationV2(input: NavigationPreviewStartInput) {
  const check = V2NavigationAdapter.canStartActiveNavigation(input);
  if (!check.canStart || !input.route || !input.destination) return check;
  const state = useAppStore.getState();
  const capability = evaluateLocationCapability({
    permission: { granted: state.hasLocationPermission, canAskAgain: false, precision: state.locationPermissionPrecision, servicesState: state.locationServicesState },
    liveFix: state.currentLocationSource === 'live' ? state.currentLocation : null,
  });
  // Only the currently published preview may authorize a live session. Manual and direct guides have no live authority.
  if (input.startPlace || state.routePlannerOrigin || capability.mode !== 'live_navigation' ||
    state.activeRoute !== input.route || state.routePlannerDest?.id !== input.destination.id ||
    input.route.outsideRoute?.provider === 'direct-guide') {
    return { canStart: false, message: t('directions.livePrerequisites') };
  }
  // Composed outside geometry starts at the attendee; startResolution may identify the entry gate.
  const plannedOrigin = input.route.coordinates[0];
  if (!state.currentLocation || getDistance(plannedOrigin, state.currentLocation) > 20) {
    return { canStart: false, message: t('directions.refreshRoute') };
  }
  const route = V2NavigationAdapter.fromPreview({
    previewRoute: input.route,
    destination: input.destination,
    startPlace: input.startPlace,
    currentLocation: state.currentLocation,
  });
  const activated = useAppStore.getState().startNavigation(input.destination, route, route.instructions, input.route);
  return activated ? check : { canStart: false, message: t('directions.livePrerequisites') };
}

export function recommendPreviewEntryGate(coordinate: Coordinate, place: Place | null) {
  return RoutingServiceV2.recommendOutsideEntryGate(coordinate, place ? destinationFromPlace(place) : null);
}

export function useNavigationViewModelV2() {
  const locale = useLocaleStore((state) => state.locale);
  const destinationFromStore = useAppStore((s) => s.destination);
  const activeRoute = useAppStore((s) => s.activeRoute);
  const isNavigating = useAppStore((s) => s.isNavigating);
  const routeInstructions = useAppStore((s) => s.routeInstructions);
  const currentLocation = useAppStore((s) => s.currentLocation);
  const hasLocationPermission = useAppStore((s) => s.hasLocationPermission);
  const locationPermissionPrecision = useAppStore((s) => s.locationPermissionPrecision);
  const locationServicesState = useAppStore((s) => s.locationServicesState);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const settings = useAppStore((s) => s.settings);
  const isMuted = useAppStore((s) => s.isMuted);
  const setIsMuted = useAppStore((s) => s.setIsMuted);
  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const setActiveRoute = useAppStore((s) => s.setActiveRoute);
  const setRouteInstructions = useAppStore((s) => s.setRouteInstructions);
  const setReroutePending = useAppStore((s) => s.setReroutePending);
  const reroutePending = useAppStore((s) => s.reroutePending);
  const navigationSessionId = useAppStore((s) => s.navigationSessionId);

  // activeRoute is 'v2'-shaped for both directions previews and live navigation — isNavigating
  // (true only between startNavigation()/stopNavigation()) gates this hook's GPS/reroute/speech
  // side effects so they don't run while the user is merely previewing a route.
  // This is also where MapMode's NAVIGATION/ARRIVAL derivation bottoms out for v2: this `route`
  // feeds useNavigationOverlayV2's `active`, which HomeScreen ANDs with the
  // useIjtemaV2Navigation() flag into `showNavOverlay`, the sole input by which isNavigating
  // enters deriveMapMode(). See the `isNavigating` doc comment in useAppStore.ts.
  const route = isNavigating && isV2ActiveRoute(activeRoute) ? activeRoute : null;
  const instructions = useMemo(
    () => (routeInstructions.length > 0 ? routeInstructions : route?.instructions ?? []) as V2NavigationInstruction[],
    [route?.instructions, routeInstructions],
  );
  const destination = route ? placeFromV2Destination(route, destinationFromStore) : destinationFromStore;
  const [snappedLocation, setSnappedLocation] = useState<Coordinate | null>(route?.origin.coordinate ?? null);
  const previousSnapCoordinateRef = useRef(snappedLocation);
  useEffect(() => { previousSnapCoordinateRef.current = snappedLocation; }, [snappedLocation]);
  const [remainingDistance, setRemainingDistance] = useState(route?.totalDistanceM ?? 0);
  const [maneuverDistance, setManeuverDistance] = useState(route?.instructions[0]?.distanceM ?? 0);
  const [etaMinutes, setEtaMinutes] = useState(route?.etaMinutes ?? 0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [isWeakGps, setIsWeakGps] = useState(false);
  const [rerouteStatusCopy, setRerouteStatusMessage] = useState<NavigationStatusCopy>(null);
  const routeUpdatedNotice = useRouteUpdatedNotice(setRerouteStatusMessage);
  const [gpsSignalState, setGpsSignalState] = useState<GpsSignalStateV2>('GPS_GOOD');
  const [manualGateId, setManualGateId] = useState<string | null>(null);

  const progressRef = useRef(0);
  const lastAcceptedLocationRef = useRef<Coordinate | null>(route?.origin.coordinate ?? null);
  // NAV-P0-001: native observation timestamp (Coordinate.observedAtMs) paired with
  // lastAcceptedLocationRef, reset together everywhere that ref resets. Feeds
  // calculateNavigationProgressV2's forward-jump plausibility cap.
  const lastAcceptedObservedAtMsRef = useRef<number | null>(null);
  // NAV-P0-001: instant this navigation "watcher generation" began — bumped at trip start and
  // at every foreground resume (see the two effects below that set it). A fix whose OWN
  // observation timestamp predates this boundary is a historical/cached fix (Android commonly
  // delivers one as the first update after a location subscription (re)starts) and must not be
  // consumed as this generation's live position — see isHistoricalFix in the location effect.
  const watcherGenerationBoundaryAtMsRef = useRef<number>(Date.now());
  // Wall-clock time (Date.now()) of the last accepted GPS fix while navigating — read by the
  // GPS_LOST polling effect below. Display-state only: nothing reroute/arrival-related reads
  // this ref, so GPS_LOST detection can never itself trigger a reroute or arrival.
  const lastFixAtRef = useRef<number | null>(null);
  // AUD-05: the location effect below lists isMuted/settings.voiceInstructions/etaMinutes/
  // currentStepIndex in its dependency array (none of them GPS-related), so it can re-run
  // against the exact same stale currentLocation for a reason that has nothing to do with a new
  // fix arriving. Without this guard, that re-run unconditionally re-stamps lastFixAtRef to
  // "now" and recomputes gpsSignalState as fresh — silently reviving a genuine GPS_LOST back to
  // GOOD/WEAK just because the user toggled mute or some other unrelated UI state changed.
  const lastFreshnessFixLocationRef = useRef<Coordinate | null>(null);
  // Same-observation check for lastFreshnessFixLocationRef: prefer native GPS timestamp
  // identity (observedAtMs, set by GPSManagerService from Expo's LocationObject.timestamp) when
  // both sides have one — this is what actually identifies "the same physical sensor sample".
  // Falls back to object identity when either side lacks it (e.g. tests that construct fixes
  // without observedAtMs).
  const isSameGpsObservation = (a: Coordinate, b: Coordinate | null): boolean => {
    if (!b) return false;
    if (a.observedAtMs != null && b.observedAtMs != null) return a.observedAtMs === b.observedAtMs;
    return a === b;
  };
  const offRouteStartRef = useRef<number | null>(null);
  // Coordinate captured the moment off-route evidence starts accumulating (first fix of the
  // current off-route streak). Reroute evidence is distance walked away from THIS point, not
  // distance between consecutive fixes — consecutive-fix distance is capped near zero by
  // GPSManagerService's own navigation-mode distanceInterval (2m), so gating reroute on it made
  // the count/duration criteria below unreachable for realistic pedestrian GPS cadence. Reset
  // together with offRouteStartRef/consecutiveOffRouteRef everywhere those reset.
  const offRouteAnchorRef = useRef<Coordinate | null>(null);
  const consecutiveOffRouteRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const lastSpokenInstructionIdRef = useRef<string | null>(null);
  const outsideRequestCoordinatorRef = useRef(new OutsideRouteRequestCoordinator());
  const rerouteRequestInFlightRef = useRef<object | null>(null);
  const handleLiveLocation = useCallback(() => {
    // GPSManagerService updates currentLocation through the store updater wired in RootNavigator.
  }, []);

  useEffect(() => {
    // Reset arrival first (and unconditionally) — this hook now runs unconditionally inside
    // HomeScreen for the app's lifetime, so without this a stale `arrived: true` from a
    // previous trip would survive exit and immediately re-trigger MapMode.ARRIVAL the next
    // time navigation starts, before any GPS update has run to correct it.
    setArrived(false);
    if (!route) return;
    setRemainingDistance(route.totalDistanceM);
    setEtaMinutes(route.etaMinutes);
    setSnappedLocation(route.origin.coordinate);
    const initialGuidance = calculateLiveManeuverDistanceV2({ route, currentStepIndex: 0, progressMeters: 0 });
    setCurrentStepIndex(initialGuidance.stepIndex);
    setManeuverDistance(initialGuidance.maneuverDistanceM);
    progressRef.current = 0;
    // NAV-P0-001: a new trip is a new watcher generation — any fix whose native timestamp
    // predates this instant (e.g. a stale value still sitting in GPSManagerService/the store
    // from before Start) must be rejected as historical, not fed into route progress.
    watcherGenerationBoundaryAtMsRef.current = Date.now();
    lastAcceptedObservedAtMsRef.current = null;
    lastAcceptedLocationRef.current = route.origin.coordinate;
    // #60: off-route evidence is scoped to a single trip's off-route episodes — a new trip must
    // start clean, not carry over a near-threshold streak from the one that just ended.
    consecutiveOffRouteRef.current = 0;
    offRouteStartRef.current = null;
    offRouteAnchorRef.current = null;
    // #113: the reroute cooldown timestamp is the same kind of per-trip evidence as the three
    // refs above — a reroute fired near the end of one trip must not suppress a genuinely-needed
    // reroute at the start of the next.
    lastRerouteAtRef.current = 0;
    // #60: keyed on navigationSessionId (bumped by startNavigation on every trip, even a
    // restart onto the identical route/destination — see useAppStore.startNavigation), not
    // route?.routeId, which is stable for that same-route-restart case and would silently skip
    // this reset.
    setManualGateId(route?.origin.manuallySelectedGate ? route.origin.gateId ?? null : null);
  }, [navigationSessionId]);

  useEffect(() => () => outsideRequestCoordinatorRef.current.cancelCurrent(), []);

  useEffect(() => {
    if (!route) return;
    GPSManagerService.addListener(handleLiveLocation, 'navigation');
    return () => {
      GPSManagerService.removeListener(handleLiveLocation);
    };
    // Keyed on isNavigating (not `route`) so a mid-navigation reroute — which
    // replaces `route` via setActiveRoute — doesn't tear down and re-add the
    // shared GPSManagerService listener. That remove+add cycle can race the
    // singleton's async reconcile loop and leave watchPositionAsync stopped
    // for the rest of the session (GPS updates silently stop propagating).
  }, [handleLiveLocation, isNavigating]);

  // GPS_LOST detection: the location effect below only reacts to fixes as they arrive, so it
  // has no way to notice fixes that stop arriving entirely. This ticks independently of GPS
  // updates to catch that case — a plain timeout layered on top of the existing fix-handling,
  // not a replacement for it. Torn down (and lastFixAtRef/gpsSignalState reset) whenever
  // navigation isn't active, so a stale timestamp from a previous trip can never leak into a
  // new one.
  useEffect(() => {
    if (!route) {
      lastFixAtRef.current = null;
      setGpsSignalState('GPS_GOOD');
      return;
    }
    const intervalId = setInterval(() => {
      const state = deriveGpsSignalStateV2({
        isWeakGps: false, // irrelevant once timed out — see GPS_LOST branch below
        lastFixAtMs: lastFixAtRef.current,
        nowMs: Date.now(),
      });
      if (state === 'GPS_LOST') {
        setGpsSignalState('GPS_LOST');
        // Suppress the separate weak-GPS banner while truly lost — it reflects the accuracy
        // of a fix that is now stale, and NavigationChromeV2 would otherwise show both
        // banners stacked. Cleared automatically the moment a fresh fix arrives below.
        setIsWeakGps(false);
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [route]);

  // Background-resume handling: user locks the phone mid-navigation, walks for a
  // while, unlocks. GPSManagerService already tears down/restarts the watch
  // subscription on its own AppState listener, but that leaves the UI waiting on
  // watchPositionAsync's natural cadence for the first post-resume fix, which can
  // take a while (device has to reacquire GPS lock) — long enough that route
  // progress/ETA would sit on a stale, minutes-old position with no indication it's
  // stale. On resume: mark GPS_LOST immediately if the last fix is already stale
  // (skips the 8s polling wait — no ambiguity to protect against here, the gap is
  // known), and force an immediate fresh fix rather than waiting for the ambient
  // subscription's next callback.
  useEffect(() => {
    if (!route) return;
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const stale = lastFixAtRef.current == null || Date.now() - lastFixAtRef.current >= GPS_LOST_TIMEOUT_MS;
      if (stale) {
        setGpsSignalState('GPS_LOST');
        setIsWeakGps(false);
      }
      // NAV-P0-001: resume is a new watcher generation — any fix (backlog from the ambient
      // watch subscription, or the forceFix below) whose native timestamp predates this instant
      // is historical and must be rejected, not reconciled as the resumed position.
      watcherGenerationBoundaryAtMsRef.current = Date.now();
      void GPSManagerService.forceFix();
    });
    return () => subscription.remove();
  }, [route]);

  const attemptReroute = useCallback(async (coordinate: Coordinate, options: RerouteOptions = {}) => {
    if (!route || currentLiveCapability().mode !== 'live_navigation' || (!settings.autoReroute && !options.explicit)) return;
    if (!options.explicit && rerouteRequestInFlightRef.current) return;
    const sessionAtRequest = useAppStore.getState().navigationSessionId;
    const ownsSession = () => useAppStore.getState().navigationSessionId === sessionAtRequest && useAppStore.getState().isNavigating;
    const requestMarker = {};
    rerouteRequestInFlightRef.current = requestMarker;
    let outsideHandle: ReturnType<OutsideRouteRequestCoordinator['begin']> | null = null;
    try {
      const routeAtRequest = route;
      setReroutePending(true);
      routeUpdatedNotice.cancel();
      setRerouteStatusMessage(null);

      let candidate = null;
      if (!EntryGateRoutingService.isInsideIjtemaArea(coordinate) && destination) {
        outsideHandle = outsideRequestCoordinatorRef.current.begin(
          `${destination.id}:${options.manualGateId ?? 'automatic'}`,
        );
        try {
          const result = await V2DirectionsService.calculateHybridPreview({
            request: {
              startPlace: null,
              destination,
              currentLocation: coordinate,
              forceOutside: true,
              walkingSpeedMs: settings.walkingSpeed ?? 1.4,
              manualGateId: options.manualGateId,
            },
            token: outsideHandle.token,
            signal: outsideHandle.signal,
            outsideProvider: productionOutsideRouteSource,
          });
          candidate = result.status === 'ready' ? result.route : null;
        } catch {
          candidate = null;
        }
        if (
          !outsideHandle.canCommit() ||
          useAppStore.getState().activeRoute !== routeAtRequest ||
          !ownsSession() || currentLiveCapability().mode !== 'live_navigation'
        ) {
          return;
        }
        // A direct guide cannot replace a live walking route, including explicit gate changes.
        if (candidate?.outsideRoute?.provider === 'direct-guide') {
          candidate = null;
        }
      } else {
        outsideRequestCoordinatorRef.current.cancelCurrent();
        const rerouteRequest = buildV2RerouteRequest({
          route: routeAtRequest,
          coordinate,
          previousSnapCoordinate: previousSnapCoordinateRef.current,
          walkingSpeedMs: settings.walkingSpeed ?? 1.4,
        });
        candidate = RoutingServiceV2.calculateRoute(rerouteRequest);
      }

      if (currentLiveCapability().mode !== 'live_navigation' || !ownsSession() || useAppStore.getState().activeRoute !== routeAtRequest) return;

      if (!candidate) {
        lastRerouteAtRef.current = Date.now();
        setRerouteStatusMessage({ key: 'navigation.keepRoute' });
        setReroutePending(false);
        outsideHandle?.finish();
        return;
      }

      const activeCandidate = V2NavigationAdapter.fromPreview({
        previewRoute: candidate,
        destination: destination ?? placeFromV2Destination(routeAtRequest, null)!,
        currentLocation: coordinate,
      });
      setActiveRoute(activeCandidate);
      setRouteInstructions(activeCandidate.instructions);
      setRemainingDistance(activeCandidate.totalDistanceM);
      progressRef.current = 0;
      lastAcceptedLocationRef.current = coordinate;
      lastAcceptedObservedAtMsRef.current = coordinate.observedAtMs ?? null;
      consecutiveOffRouteRef.current = 0;
      offRouteStartRef.current = null;
      offRouteAnchorRef.current = null;
      lastRerouteAtRef.current = Date.now();
      setReroutePending(false);
      routeUpdatedNotice.announce();
      outsideHandle?.finish();
    } catch {
      // #143: any throw in the reroute path must not leave "Rerouting…" stuck; keep the current route.
      if (rerouteRequestInFlightRef.current === requestMarker && ownsSession() && currentLiveCapability().mode === 'live_navigation') {
        lastRerouteAtRef.current = Date.now();
        setRerouteStatusMessage({ key: 'navigation.keepRoute' });
        setReroutePending(false);
      }
      outsideHandle?.finish();
    } finally {
      if (rerouteRequestInFlightRef.current === requestMarker) {
        if (ownsSession()) setReroutePending(false);
        rerouteRequestInFlightRef.current = null;
      }
    }
  }, [destination, route, routeUpdatedNotice, setActiveRoute, setReroutePending, setRouteInstructions, settings.autoReroute, settings.walkingSpeed]);

  const retryOutsideRoute = useCallback(async () => {
    const coordinate = currentLocation ?? snappedLocation;
    if (!coordinate) return;
    await attemptReroute(coordinate, {
      manualGateId: manualGateId ?? undefined,
      explicit: true,
    });
  }, [attemptReroute, currentLocation, manualGateId, snappedLocation]);

  const selectOutsideGate = useCallback(async (gateId: string) => {
    if (!AVAILABLE_OUTSIDE_GATES.some((gate) => gate.id === gateId)) return;
    setManualGateId(gateId);
    const coordinate = currentLocation ?? snappedLocation;
    if (!coordinate) return;
    await attemptReroute(coordinate, {
      manualGateId: gateId,
      explicit: true,
    });
  }, [attemptReroute, currentLocation, snappedLocation]);

  useEffect(() => {
    if (!route) return;
    if (!currentLocation) {
      setGpsSignalState('GPS_LOST');
      setIsWeakGps(false);
      outsideRequestCoordinatorRef.current.cancelCurrent();
      return;
    }

    const capability = currentLiveCapability();
    if (capability.mode !== 'live_navigation') {
      // Loss of authority freezes movement/arrival/reroute evidence while retaining the journey.
      consecutiveOffRouteRef.current = 0;
      offRouteStartRef.current = null;
      offRouteAnchorRef.current = null;
      outsideRequestCoordinatorRef.current.cancelCurrent();
      const trustworthyWeakFix = capability.liveBlocker === 'weak_fix' && isValidCoordinate(currentLocation) &&
        Number.isFinite(currentLocation.accuracy) && currentLocation.accuracy! >= 0 &&
        currentLocation.observedAtMs! >= watcherGenerationBoundaryAtMsRef.current - STALE_FIX_CLOCK_TOLERANCE_MS;
      setIsWeakGps(trustworthyWeakFix);
      setGpsSignalState(trustworthyWeakFix ? 'GPS_WEAK' : 'GPS_LOST');
      if (trustworthyWeakFix && !isSameGpsObservation(currentLocation, lastFreshnessFixLocationRef.current)) {
        lastFreshnessFixLocationRef.current = currentLocation;
        lastFixAtRef.current = Date.now();
      }
      return;
    }
    const accuracyM = currentLocation.accuracy!;
    // AUD-05: only a genuinely new GPS observation may advance freshness state — this effect can
    // re-run for unrelated reasons (see lastFreshnessFixLocationRef above) against the same
    // currentLocation, and that must be a no-op here, not a revival.
    const isNewFix = !isSameGpsObservation(currentLocation, lastFreshnessFixLocationRef.current);

    // NAV-P0-001: reject a fix whose OWN observation timestamp clearly predates this watcher
    // generation's boundary (trip start / foreground resume — see watcherGenerationBoundaryAtMsRef).
    // This is the actual runtime trigger for the confirmed progress/ETA/instruction corruption
    // defect: Android/Play Services can deliver a cached "last known location" as the very first
    // update after a location subscription (re)starts, and that fix was previously consumed
    // immediately as this generation's live position. Missing observation timestamps are rejected by capability validation above. A
    // genuinely fresh first fix must be accepted immediately, not delayed to "hide" the bug).
    const isHistoricalFix =
      isNewFix &&
      currentLocation.observedAtMs != null &&
      currentLocation.observedAtMs < watcherGenerationBoundaryAtMsRef.current - STALE_FIX_CLOCK_TOLERANCE_MS;
    if (isHistoricalFix) {
      // Ignored entirely: must not advance progress/ETA/instructions, must not feed arrival
      // evidence, and must not mark GPS freshness as restored (lastFreshnessFixLocationRef/
      // lastFixAtRef are deliberately left untouched here).
      return;
    }

    // A fix arrived (regardless of how it's ultimately treated below) — record it so the
    // GPS_LOST polling effect knows the signal is alive, and immediately resolve the
    // good/weak display state for it via the same pure derivation the poll uses.
    // Falls back to lastFixAtRef.current (not Date.now()) purely to keep this a plain `number` —
    // that value is never actually read unless isNewFix is true (see the `if (isNewFix)` guards
    // below), where it's always the freshly computed Date.now() from the branch above anyway.
    const fixAtMs = isNewFix ? Date.now() : (lastFixAtRef.current ?? Date.now());
    if (isNewFix) {
      lastFreshnessFixLocationRef.current = currentLocation;
      lastFixAtRef.current = fixAtMs;
    }
    const movedDistanceM = lastAcceptedLocationRef.current
      ? getDistance(lastAcceptedLocationRef.current, currentLocation)
      : Infinity;
    if (shouldIgnorePoorAccuracyMovementV2({ movedDistanceM, accuracyM })) {
      if (isNewFix) {
        setIsWeakGps(true);
        setGpsSignalState(deriveGpsSignalStateV2({ isWeakGps: true, lastFixAtMs: fixAtMs, nowMs: fixAtMs }));
      }
      return;
    }

    const weakGps = RerouteService.shouldHoldRouteForWeakGps(accuracyM);
    if (isNewFix) {
      setIsWeakGps(weakGps);
      setGpsSignalState(deriveGpsSignalStateV2({ isWeakGps: weakGps, lastFixAtMs: fixAtMs, nowMs: fixAtMs }));
    }
    const progress = calculateNavigationProgressV2({
      route,
      coordinate: currentLocation,
      previousProgressMeters: progressRef.current,
      previousEtaMinutes: etaMinutes,
      walkingSpeedMs: settings.walkingSpeed ?? 1.4,
      previousObservedAtMs: lastAcceptedObservedAtMsRef.current,
    });

    progressRef.current = progress.progressMeters;
    lastAcceptedLocationRef.current = currentLocation;
    lastAcceptedObservedAtMsRef.current = currentLocation.observedAtMs ?? null;
    setSnappedLocation(progress.snappedCoordinate);
    setRemainingDistance(progress.remainingDistanceM);
    setEtaMinutes(progress.etaMinutes);

    const guidance = calculateLiveManeuverDistanceV2({ route, currentStepIndex, progressMeters: progress.progressMeters });
    const nextIndex = guidance.stepIndex;
    // #95: latched for the session (reset on trip start/exit) — a later noisy fix just outside the
    // threshold must not un-report arrival and flip the UI back out of the completion overlay.
    if (isArrived(route, currentLocation, nextIndex)) setArrived(true);
    if (nextIndex !== currentStepIndex) {
      setCurrentStepIndex(nextIndex);
    }
    setManeuverDistance(guidance.maneuverDistanceM);

    const currentInstruction = instructions[nextIndex];
    if (settings.voiceInstructions && !isMuted && currentInstruction && currentInstruction.id !== lastSpokenInstructionIdRef.current) {
      lastSpokenInstructionIdRef.current = currentInstruction.id;
      VoiceService.speakInstruction(localizeInstruction(currentInstruction), getLocale() === "ur" ? "ur" : "en");
    }

    const thresholdM = RerouteService.getDynamicOffRouteThresholdMeters(accuracyM);
    if (route.outsideRoute?.provider === 'direct-guide' && !EntryGateRoutingService.isInsideIjtemaArea(currentLocation)) {
      return;
    }
    const isOffRoute = progress.distanceToRouteMeters > thresholdM;
    if (!isOffRoute || weakGps) {
      consecutiveOffRouteRef.current = 0;
      offRouteStartRef.current = null;
      offRouteAnchorRef.current = null;
      return;
    }

    // #60: this effect can re-run against the exact same currentLocation for reasons unrelated
    // to a new GPS fix (see the AUD-05 isNewFix note above — e.g. this same effect's own
    // setCurrentStepIndex/setEtaMinutes calls are themselves in its dependency array). Without
    // gating on isNewFix, each such re-run would double/triple-count one physical fix as
    // several "consecutive off-route fixes", inflating evidence out of proportion to real
    // GPS cadence — a false-positive risk equivalent to jitter.
    if (isNewFix) {
      consecutiveOffRouteRef.current += 1;
      offRouteStartRef.current = offRouteStartRef.current ?? Date.now();
      // Evidence is cumulative displacement from the start of this off-route episode, not
      // fix-to-fix displacement — see offRouteAnchorRef above.
      const movedDistanceSinceOffRouteAnchorM = offRouteAnchorRef.current
        ? getDistance(offRouteAnchorRef.current, currentLocation)
        : 0;
      offRouteAnchorRef.current = offRouteAnchorRef.current ?? currentLocation;
      const evidence = evaluateRerouteEvidenceV2({
        gpsAccuracyM: accuracyM,
        consecutiveOffRouteCount: consecutiveOffRouteRef.current,
        offRouteDurationMs: Date.now() - offRouteStartRef.current,
        cooldownRemainingMs: Math.max(0, REROUTE_COOLDOWN_MS - (Date.now() - lastRerouteAtRef.current)),
        movedDistanceSinceLastAcceptedM: movedDistanceSinceOffRouteAnchorM,
      });

      if (evidence.shouldReroute) {
        void attemptReroute(currentLocation, { manualGateId: manualGateId ?? undefined });
      }
    }
  }, [attemptReroute, currentLocation, currentLocationSource, hasLocationPermission, locationPermissionPrecision, locationServicesState, currentStepIndex, etaMinutes, instructions, isMuted, manualGateId, route, settings.voiceInstructions, settings.walkingSpeed]);

  // #139 Option B: a journey that reached its destination is finished, not "unfinished".
  useEffect(() => {
    if (arrived) useAppStore.getState().clearUnfinishedJourney();
  }, [arrived]);

  const handleExit = useCallback(() => {
    VoiceService.stopSpeaking();
    stopNavigation();
    // #111: the navigationSessionId-keyed effect above only clears `arrived` at the START of
    // the NEXT trip, leaving it stale `true` (and deriveMapMode forcing ARRIVAL mode over
    // Directory) for the whole gap between this Done/Exit and that next Start Navigation.
    setArrived(false);
  }, [stopNavigation]);

  const previousSpeechLocaleRef = useRef(locale);
  useEffect(() => {
    if (previousSpeechLocaleRef.current === locale) return;
    previousSpeechLocaleRef.current = locale;
    const owner = useAppStore.getState();
    if (!owner.isNavigating || owner.navigationSessionId !== navigationSessionId ||
      !route || owner.activeRoute !== route || !isV2ActiveRoute(owner.activeRoute)) return;
    VoiceService.stop();
    const step = instructions[currentStepIndex];
    if (route && step && !isMuted && settings.voiceInstructions) {
      VoiceService.speakInstruction(localizeInstruction(step, locale), locale === 'ur' ? 'ur' : 'en');
    }
  }, [locale, instructions, currentStepIndex, isMuted, settings.voiceInstructions, route, navigationSessionId]);

  return {
    destination,
    currentLocation,
    snappedLocation,
    route,
    instructions: instructions.map((step) => ({ ...step, text: localizeInstruction(step, locale) })),
    currentStepIndex,
    isMuted,
    setIsMuted,
    remainingDistance,
    maneuverDistance,
    etaMinutes,
    arrived,
    reroutePending,
    isWeakGps,
    gpsSignalState,
    rerouteStatusMessage: resolveNavigationStatus(rerouteStatusCopy, locale),
    manualGateId,
    availableOutsideGates: AVAILABLE_OUTSIDE_GATES,
    retryOutsideRoute,
    selectOutsideGate,
    handleExit,
  };
}
