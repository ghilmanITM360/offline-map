/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getDistance } from 'geolib';
import { useAppStore } from '../store/useAppStore';
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
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter, isV2ActiveRoute } from '../services/V2NavigationAdapter';
import { OutsideRouteRequestCoordinator } from '../services/outsideRouting/OutsideRouteRequestCoordinator';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { getRoutableOfficialGates } from '../data/ijtema/entryPolicy';
import {
  buildV2RerouteRequest,
  calculateNavigationProgressV2,
  deriveGpsSignalStateV2,
  evaluateRerouteEvidenceV2,
  GPS_LOST_TIMEOUT_MS,
  GpsSignalStateV2,
  keepCurrentRouteAfterRerouteFailureV2,
  shouldIgnorePoorAccuracyMovementV2,
} from '../services/V2NavigationRuntimeService';
import { ARRIVAL_THRESHOLD_METERS } from '../constants/navigation';

const REROUTE_COOLDOWN_MS = 25_000;
const productionOutsideRouteSource = createProductionOutsideRouteSource();
const AVAILABLE_OUTSIDE_GATES = getRoutableOfficialGates().map((gate) => ({
  id: gate.id,
  label: gate.name.en,
}));

interface RerouteOptions {
  manualGateId?: string;
  explicit?: boolean;
  allowDirectGuide?: boolean;
}

function instructionIndexForProgress(route: V2ActiveRoute, progressMeters: number): number {
  let bestIndex = 0;
  route.instructions.forEach((instruction, index) => {
    const coord = route.coordinates[instruction.routeIndex] ?? instruction.coordinate;
    const projected = RerouteService.projectProgressMetersOnRoute(coord, route);
    if (projected.progressMeters <= progressMeters + 15) {
      bestIndex = index;
    }
  });
  return bestIndex;
}

function isArrived(route: V2ActiveRoute, coordinate: Coordinate | null): boolean {
  if (!coordinate) return false;
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

export function useNavigationViewModelV2() {
  const destinationFromStore = useAppStore((s) => s.destination);
  const activeRoute = useAppStore((s) => s.activeRoute);
  const isNavigating = useAppStore((s) => s.isNavigating);
  const routeInstructions = useAppStore((s) => s.routeInstructions);
  const currentLocation = useAppStore((s) => s.currentLocation);
  const settings = useAppStore((s) => s.settings);
  const isMuted = useAppStore((s) => s.isMuted);
  const setIsMuted = useAppStore((s) => s.setIsMuted);
  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const setActiveRoute = useAppStore((s) => s.setActiveRoute);
  const setRouteInstructions = useAppStore((s) => s.setRouteInstructions);
  const setReroutePending = useAppStore((s) => s.setReroutePending);
  const reroutePending = useAppStore((s) => s.reroutePending);

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
  const [remainingDistance, setRemainingDistance] = useState(route?.totalDistanceM ?? 0);
  const [etaMinutes, setEtaMinutes] = useState(route?.etaMinutes ?? 0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [isWeakGps, setIsWeakGps] = useState(false);
  const [rerouteStatusMessage, setRerouteStatusMessage] = useState<string | null>(null);
  const [gpsSignalState, setGpsSignalState] = useState<GpsSignalStateV2>('GPS_GOOD');
  const [manualGateId, setManualGateId] = useState<string | null>(null);

  const progressRef = useRef(0);
  const lastAcceptedLocationRef = useRef<Coordinate | null>(route?.origin.coordinate ?? null);
  // Wall-clock time (Date.now()) of the last accepted GPS fix while navigating — read by the
  // GPS_LOST polling effect below. Display-state only: nothing reroute/arrival-related reads
  // this ref, so GPS_LOST detection can never itself trigger a reroute or arrival.
  const lastFixAtRef = useRef<number | null>(null);
  const offRouteStartRef = useRef<number | null>(null);
  // Coordinate captured the moment off-route evidence starts accumulating (first fix of the
  // current off-route streak). Reroute evidence is distance walked away from THIS point, not
  // distance between consecutive fixes — consecutive-fix distance is capped near zero by
  // GPSManagerService's own navigation-mode distanceInterval (2m), so gating reroute on it
  // made the count/duration criteria below unreachable for realistic pedestrian GPS cadence.
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
    setCurrentStepIndex(0);
    progressRef.current = 0;
  }, [route?.routeId]);

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
      void GPSManagerService.forceFix();
    });
    return () => subscription.remove();
  }, [route]);

  const attemptReroute = useCallback(async (coordinate: Coordinate, options: RerouteOptions = {}) => {
    if (!route || (!settings.autoReroute && !options.explicit)) return;
    if (!options.explicit && rerouteRequestInFlightRef.current) return;
    const requestMarker = {};
    rerouteRequestInFlightRef.current = requestMarker;
    try {
      const routeAtRequest = route;
      setReroutePending(true);
      setRerouteStatusMessage(null);

      let candidate = null;
      let outsideHandle: ReturnType<OutsideRouteRequestCoordinator['begin']> | null = null;
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
          !useAppStore.getState().isNavigating
        ) {
          return;
        }
        if (
          candidate?.outsideRoute?.provider === 'direct-guide' &&
          routeAtRequest.outsideRoute?.roadFollowing &&
          !options.allowDirectGuide
        ) {
          candidate = null;
        }
      } else {
        outsideRequestCoordinatorRef.current.cancelCurrent();
        const rerouteRequest = buildV2RerouteRequest({
          route: routeAtRequest,
          coordinate,
          walkingSpeedMs: settings.walkingSpeed ?? 1.4,
        });
        candidate = RoutingServiceV2.calculateRoute(rerouteRequest);
      }

      if (!candidate) {
        lastRerouteAtRef.current = Date.now();
        const failure = keepCurrentRouteAfterRerouteFailureV2(routeAtRequest);
        setRerouteStatusMessage(failure.message);
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
      consecutiveOffRouteRef.current = 0;
      offRouteStartRef.current = null;
      offRouteAnchorRef.current = null;
      lastRerouteAtRef.current = Date.now();
      setReroutePending(false);
      outsideHandle?.finish();
    } finally {
      if (rerouteRequestInFlightRef.current === requestMarker) {
        rerouteRequestInFlightRef.current = null;
      }
    }
  }, [destination, route, setActiveRoute, setReroutePending, setRouteInstructions, settings.autoReroute, settings.walkingSpeed]);

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
      allowDirectGuide: true,
    });
  }, [attemptReroute, currentLocation, snappedLocation]);

  useEffect(() => {
    if (!route || !currentLocation) return;

    const accuracyM = currentLocation.accuracy ?? 0;
    // A fix arrived (regardless of how it's ultimately treated below) — record it so the
    // GPS_LOST polling effect knows the signal is alive, and immediately resolve the
    // good/weak display state for it via the same pure derivation the poll uses.
    const fixAtMs = Date.now();
    lastFixAtRef.current = fixAtMs;
    const movedDistanceM = lastAcceptedLocationRef.current
      ? getDistance(lastAcceptedLocationRef.current, currentLocation)
      : Infinity;
    if (shouldIgnorePoorAccuracyMovementV2({ movedDistanceM, accuracyM })) {
      setIsWeakGps(true);
      setGpsSignalState(deriveGpsSignalStateV2({ isWeakGps: true, lastFixAtMs: fixAtMs, nowMs: fixAtMs }));
      return;
    }

    const weakGps = RerouteService.shouldHoldRouteForWeakGps(accuracyM);
    setIsWeakGps(weakGps);
    setGpsSignalState(deriveGpsSignalStateV2({ isWeakGps: weakGps, lastFixAtMs: fixAtMs, nowMs: fixAtMs }));
    const progress = calculateNavigationProgressV2({
      route,
      coordinate: currentLocation,
      previousProgressMeters: progressRef.current,
      previousEtaMinutes: etaMinutes,
      walkingSpeedMs: settings.walkingSpeed ?? 1.4,
    });

    progressRef.current = progress.progressMeters;
    lastAcceptedLocationRef.current = currentLocation;
    setSnappedLocation(progress.snappedCoordinate);
    setRemainingDistance(progress.remainingDistanceM);
    setEtaMinutes(progress.etaMinutes);
    setArrived(isArrived(route, currentLocation));

    const nextIndex = Math.max(currentStepIndex, instructionIndexForProgress(route, progress.progressMeters));
    if (nextIndex !== currentStepIndex) {
      setCurrentStepIndex(nextIndex);
    }

    const currentInstruction = instructions[nextIndex];
    if (settings.voiceInstructions && !isMuted && currentInstruction && currentInstruction.id !== lastSpokenInstructionIdRef.current) {
      lastSpokenInstructionIdRef.current = currentInstruction.id;
      VoiceService.speakInstruction(currentInstruction.spokenText ?? currentInstruction.text, settings.language);
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

    consecutiveOffRouteRef.current += 1;
    offRouteStartRef.current = offRouteStartRef.current ?? Date.now();
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
      void attemptReroute(currentLocation);
    }
  }, [attemptReroute, currentLocation, currentStepIndex, etaMinutes, instructions, isMuted, route, settings.voiceInstructions, settings.walkingSpeed]);

  const handleExit = useCallback(() => {
    VoiceService.stopSpeaking();
    stopNavigation();
  }, [stopNavigation]);

  return {
    destination,
    currentLocation,
    snappedLocation,
    route,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted,
    remainingDistance,
    etaMinutes,
    arrived,
    reroutePending,
    isWeakGps,
    gpsSignalState,
    rerouteStatusMessage,
    manualGateId,
    availableOutsideGates: AVAILABLE_OUTSIDE_GATES,
    retryOutsideRoute,
    selectOutsideGate,
    handleExit,
  };
}
