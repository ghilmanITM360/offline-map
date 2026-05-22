/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { SnapToRoadService } from '../services/SnapToRoadService';
import { RoutePointService } from '../services/RoutePointService';
import { VoiceService } from '../services/VoiceService';
import { RerouteService } from '../services/RerouteService';
import { GPSManagerService } from '../services/GPSManagerService';
import { getDistance } from 'geolib';
import { Coordinate, RoutePreview } from '../models/types';

const ARRIVAL_THRESHOLD_M = 20;
const OFF_ROUTE_PENDING_MS = 9000;
const OFF_ROUTE_CONSECUTIVE_REQUIRED = 3;
const REROUTE_COOLDOWN_MS = 25000;
const MIN_MOVEMENT_FOR_REROUTE_M = 12;
const WEAK_GPS_THRESHOLD_M = 50;

export function useNavigationViewModel() {
  const {
    destination,
    stopNavigation,
    currentLocation,
    routePlannerOrigin,
    activeRoute,
    routeInstructions,
    setReroutePending,
    reroutePending,
    settings,
    isMuted,
    setIsMuted,
  } = useAppStore();

  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [snappedLocation, setSnappedLocation] = useState<Coordinate | null>(currentLocation);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [isWeakGps, setIsWeakGps] = useState(false);
  const [rerouteStatusMessage, setRerouteStatusMessage] = useState<string | null>(null);

  // Refs to avoid stale closures inside the GPS callback
  const routeRef = useRef<RoutePreview | null>(null);
  const instructionsRef = useRef<Instruction[]>([]);
  const currentStepIndexRef = useRef(0);
  const destinationRef = useRef(destination);
  const arrivedRef = useRef(false);
  const rerouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRerouteAtRef = useRef(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const consecutiveOffRouteCountRef = useRef(0);
  const lastAcceptedLocationRef = useRef<Coordinate | null>(null);
  const progressMetersRef = useRef(0);
  const currentSegmentIndexRef = useRef(0);
  const settingsRef = useRef(settings);
  const latestGpsCoordRef = useRef<Coordinate | null>(null);
  const latestGpsAccuracyRef = useRef(0);

  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { instructionsRef.current = instructions; }, [instructions]);
  useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    destinationRef.current = destination;
    arrivedRef.current = false;
    setArrived(false);
    setCurrentStepIndex(0);
    currentStepIndexRef.current = 0;
    offRouteSinceRef.current = null;
    consecutiveOffRouteCountRef.current = 0;
    progressMetersRef.current = 0;
    currentSegmentIndexRef.current = 0;
    setRerouteStatusMessage(null);
  }, [destination]);

  // Capture the GPS location at the moment navigation starts so route generation
  // happens exactly once per destination change, never on every GPS tick.
  const initialLocationRef = useRef(currentLocation);
  useEffect(() => {
    initialLocationRef.current = currentLocation;
  }, [destination]); // update only when destination changes, not on every location update

  // Calculate route ONLY when destination changes (or on first mount if GPS is
  // already available). currentLocation is intentionally excluded from deps.
  useEffect(() => {
    if (!destination) return;

    if (activeRoute) {
      setRoute(activeRoute);
      routeRef.current = activeRoute;
      const generated = routeInstructions.length > 0
        ? routeInstructions
        : InstructionService.generateInstructions(activeRoute.nodes);
      setInstructions(generated);
      instructionsRef.current = generated;
      setRemainingDistance(activeRoute.totalDistance);
      progressMetersRef.current = 0;
      currentSegmentIndexRef.current = 0;
      if (settingsRef.current.voiceInstructions) {
        const isMutedNow = useAppStore.getState().isMuted;
        if (!isMutedNow && generated[0]) {
          VoiceService.speak(generated[0].text, settingsRef.current.language);
        }
      }
      return;
    }

    const loc = routePlannerOrigin?.coordinate ?? initialLocationRef.current;
    if (!loc) return;

    const walkingSpeedMs = settingsRef.current.walkingSpeed ?? 1.4;
    const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(destination, loc);
    const startNodeIdOverride = routePlannerOrigin?.routingNodeId;

    const routedWithSpeed = RoutingService.calculateRoute(
      loc,
      destNodeIds,
      startNodeIdOverride,
      walkingSpeedMs,
    );
    if (routedWithSpeed) {
      setRoute(routedWithSpeed);
      routeRef.current = routedWithSpeed;
      const generated = InstructionService.generateInstructions(routedWithSpeed.nodes);
      setInstructions(generated);
      instructionsRef.current = generated;
      setRemainingDistance(routedWithSpeed.totalDistance);
      progressMetersRef.current = 0;
      currentSegmentIndexRef.current = 0;
      // Speak the first instruction; mute state is checked via ref so this
      // effect never re-runs when the user toggles mute.
      if (!settingsRef.current.voiceInstructions) return;
      const isMutedNow = useAppStore.getState().isMuted;
      if (!isMutedNow && generated[0]) {
        VoiceService.speak(generated[0].text, settingsRef.current.language);
      }
    }
  }, [destination, routePlannerOrigin, activeRoute, routeInstructions]); // intentionally excludes current GPS ticks

  // GPS listener — registered once with the shared GPSManagerService
  const handleGPS = useCallback(
    (coord: Coordinate) => {
      latestGpsCoordRef.current = coord;

      const stepIdx = currentStepIndexRef.current;
      const steps = instructionsRef.current;
      const currentRoute = routeRef.current;
      const dest = destinationRef.current;
      const currentSettings = settingsRef.current;
      const gpsAccuracy = coord.accuracy ?? 0;
      const holdRouteForWeakGps = RerouteService.shouldHoldRouteForWeakGps(gpsAccuracy);
      latestGpsAccuracyRef.current = gpsAccuracy;
      setIsWeakGps(gpsAccuracy > WEAK_GPS_THRESHOLD_M);
      if (holdRouteForWeakGps) {
        setRerouteStatusMessage('GPS signal is weak. Route is being held stable.');
      } else if (rerouteStatusMessage === 'GPS signal is weak. Route is being held stable.') {
        setRerouteStatusMessage(null);
      }

      let snapped = SnapToRoadService.snapVisualToRoad(coord, 20);
      if (currentRoute && currentRoute.coordinates.length > 1) {
        const projected = RerouteService.projectProgressMetersOnRoute(coord, currentRoute);
        const clampedProgress = RerouteService.clampMonotonicProgress(progressMetersRef.current, projected.progressMeters);
        const routeDistance = currentRoute.totalDistance;
        progressMetersRef.current = Math.max(0, Math.min(routeDistance, clampedProgress));
        const projectionChanged = projected.distanceToRouteMeters <= RerouteService.getDynamicOffRouteThresholdMeters(gpsAccuracy);
        if (projectionChanged || holdRouteForWeakGps) {
          snapped = projected.snappedCoordinate;
        }
        const segmentCount = Math.max(1, currentRoute.segments.length);
        const segmentLengthApprox = routeDistance / segmentCount;
        currentSegmentIndexRef.current = Math.min(
          segmentCount - 1,
          Math.max(0, Math.floor(progressMetersRef.current / Math.max(1, segmentLengthApprox))),
        );
        setRemainingDistance(Math.max(0, routeDistance - progressMetersRef.current));
      } else {
        const remaining = steps.slice(currentStepIndexRef.current).reduce((sum, s) => sum + s.distance, 0);
        setRemainingDistance(remaining);
      }
      setSnappedLocation(snapped);

      // --- Step advancement ---
      if (steps.length > 0 && stepIdx < steps.length - 1) {
        const stepCoord = steps[stepIdx].coordinate;
        if (stepCoord) {
          const distToStep = getDistance(
            { latitude: snapped.latitude, longitude: snapped.longitude },
            { latitude: stepCoord.latitude, longitude: stepCoord.longitude }
          );
          if (distToStep < 15) {
            const next = stepIdx + 1;
            setCurrentStepIndex(next);
            currentStepIndexRef.current = next;
            if (!isMuted && currentSettings.voiceInstructions && steps[next]) { // fixed: respect voice settings for step advancement prompts
              VoiceService.speak(steps[next].text, currentSettings.language);
            }
          }
        }
      }

      // --- Arrival detection ---
      if (dest && !arrivedRef.current) {
        const destinationCoordinate = RoutePointService.getDestinationCoordinate(dest);
        if (!destinationCoordinate) return;
        const distToDest = getDistance(
          { latitude: snapped.latitude, longitude: snapped.longitude },
          { latitude: destinationCoordinate.latitude, longitude: destinationCoordinate.longitude }
        );
        if (distToDest < ARRIVAL_THRESHOLD_M) {
          arrivedRef.current = true;
          setArrived(true);
          if (!isMuted && currentSettings.voiceInstructions) { // fixed: respect voice settings for arrival prompts
            VoiceService.speak(
              currentSettings.language === 'ur'
                ? `${dest.name} پہنچ گئے۔`
                : `You have arrived at ${dest.name}.`,
              currentSettings.language
            );
          }
          return;
        }
      }

      // --- Off-route detection with hysteresis ---
      if (currentRoute && dest && currentSettings.autoReroute && !arrivedRef.current) {
        const now = Date.now();
        const cooldownRemainingMs = Math.max(0, REROUTE_COOLDOWN_MS - (now - lastRerouteAtRef.current));
        const movedDistanceSinceLastAcceptedM = lastAcceptedLocationRef.current
          ? getDistance(
              { latitude: lastAcceptedLocationRef.current.latitude, longitude: lastAcceptedLocationRef.current.longitude },
              { latitude: snapped.latitude, longitude: snapped.longitude },
            )
          : Number.POSITIVE_INFINITY;

        const offRoute = RerouteService.isOffRoute(coord, currentRoute, gpsAccuracy);
        const offRouteDurationMs = offRouteSinceRef.current ? now - offRouteSinceRef.current : 0;

        if (__DEV__) {
          console.log('[Navigation][Reroute]', {
            latitude: coord.latitude,
            longitude: coord.longitude,
            accuracy: gpsAccuracy,
            dynamicThreshold: RerouteService.getDynamicOffRouteThresholdMeters(gpsAccuracy),
            offRoute,
            consecutiveOffRouteCount: consecutiveOffRouteCountRef.current,
            offRouteDurationMs,
            cooldownRemainingMs,
            movedDistanceSinceLastAcceptedM,
            currentSegmentIndex: currentSegmentIndexRef.current,
            projectedProgressMeters: progressMetersRef.current,
            holdRouteForWeakGps,
          });
        }

        if (cooldownRemainingMs > 0 || holdRouteForWeakGps) {
          consecutiveOffRouteCountRef.current = 0;
          offRouteSinceRef.current = null;
          setReroutePending(false);
          return;
        }

        if (offRoute) {
          if (!offRouteSinceRef.current) {
            offRouteSinceRef.current = now;
          }
          consecutiveOffRouteCountRef.current += 1;

          const shouldTrigger = RerouteService.shouldTriggerReroute({
            consecutiveOffRouteCount: consecutiveOffRouteCountRef.current,
            offRouteDurationMs,
            cooldownRemainingMs,
            movedDistanceSinceLastAcceptedM,
          });
          if (
            movedDistanceSinceLastAcceptedM < MIN_MOVEMENT_FOR_REROUTE_M ||
            !shouldTrigger ||
            (offRouteDurationMs < OFF_ROUTE_PENDING_MS && consecutiveOffRouteCountRef.current < OFF_ROUTE_CONSECUTIVE_REQUIRED)
          ) {
            setRerouteStatusMessage('You may be off route. Keep moving or stop to recalculate.');
            return;
          }

          if (rerouteTimerRef.current) return;

          setReroutePending(true);
          setRerouteStatusMessage('Recalculating...');
          rerouteTimerRef.current = setTimeout(() => {
            rerouteTimerRef.current = null;
            const latestRoute = routeRef.current;
            const latestCoord = latestGpsCoordRef.current ?? coord;
            const latestAccuracy = latestGpsAccuracyRef.current;

            if (!latestRoute || !RerouteService.isOffRoute(latestCoord, latestRoute, latestAccuracy)) {
              setReroutePending(false);
              setRerouteStatusMessage(null);
              return;
            }

            const resolvedStart = SnapToRoadService.resolveRoutingNode(latestCoord);
            const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(dest, latestCoord);
            const newRoute = RoutingService.calculateRoute(
              resolvedStart.snappedCoordinate,
              destNodeIds,
              resolvedStart.nodeId,
              settingsRef.current.walkingSpeed ?? 1.4,
            );

            if (newRoute) {
              lastRerouteAtRef.current = Date.now();
              setRoute(newRoute);
              routeRef.current = newRoute;
              const newInstructions = InstructionService.generateInstructions(newRoute.nodes);
              setInstructions(newInstructions);
              instructionsRef.current = newInstructions;
              setCurrentStepIndex(0);
              currentStepIndexRef.current = 0;
              progressMetersRef.current = 0;
              currentSegmentIndexRef.current = 0;
              lastAcceptedLocationRef.current = resolvedStart.snappedCoordinate;
              if (!isMuted && settingsRef.current.voiceInstructions) {
                VoiceService.speak(
                  settingsRef.current.language === 'ur'
                    ? 'راستہ دوبارہ بن رہا ہے۔ چلتے رہیں۔'
                    : 'Recalculating. Please continue walking.',
                  settingsRef.current.language,
                );
              }
              setRerouteStatusMessage(null);
            } else {
              setRerouteStatusMessage('Could not find a better route. continuing current route.');
            }
            setReroutePending(false);
          }, 250);
        } else {
          lastAcceptedLocationRef.current = snapped;
          consecutiveOffRouteCountRef.current = 0;
          offRouteSinceRef.current = null;
          if (rerouteStatusMessage === 'You may be off route. Keep moving or stop to recalculate.') {
            setRerouteStatusMessage(null);
          }
          if (rerouteTimerRef.current) {
            clearTimeout(rerouteTimerRef.current);
            rerouteTimerRef.current = null;
            setReroutePending(false);
          }
        }
      }
    },
    [isMuted, rerouteStatusMessage, setReroutePending]
  );

  useEffect(() => {
    GPSManagerService.addListener(handleGPS);
    return () => {
      GPSManagerService.removeListener(handleGPS);
      VoiceService.stop();
      if (rerouteTimerRef.current) {
        clearTimeout(rerouteTimerRef.current);
      }
    };
  }, [handleGPS]);

  const setMuteState = (muted: boolean) => {
    if (muted) VoiceService.stop();
    setIsMuted(muted);
  };

  const handleExit = (navigation: any) => {
    VoiceService.stop();
    stopNavigation();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return {
    destination,
    currentLocation,
    snappedLocation,
    route,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted: setMuteState,
    remainingDistance,
    arrived,
    reroutePending,
    isWeakGps,
    rerouteStatusMessage,
    handleExit,
  };
}
