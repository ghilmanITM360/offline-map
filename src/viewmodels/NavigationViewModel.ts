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
const REROUTE_GRACE_MS = 3000; // 3 s grace period before rerouting
const REROUTE_COOLDOWN_MS = 15000;
const WEAK_GPS_THRESHOLD_M = 40;

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

  // Refs to avoid stale closures inside the GPS callback
  const routeRef = useRef<RoutePreview | null>(null);
  const instructionsRef = useRef<Instruction[]>([]);
  const currentStepIndexRef = useRef(0);
  const destinationRef = useRef(destination);
  const arrivedRef = useRef(false);
  const rerouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRerouteAtRef = useRef(0);
  const settingsRef = useRef(settings);

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
      const snapped = SnapToRoadService.snapVisualToRoad(coord, 20);
      setSnappedLocation(snapped);

      const stepIdx = currentStepIndexRef.current;
      const steps = instructionsRef.current;
      const currentRoute = routeRef.current;
      const dest = destinationRef.current;
      const currentSettings = settingsRef.current;
      const gpsAccuracy = coord.accuracy ?? 0;
      setIsWeakGps(gpsAccuracy > WEAK_GPS_THRESHOLD_M);

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

      // --- Remaining distance ---
      const remaining = steps.slice(currentStepIndexRef.current).reduce((sum, s) => sum + s.distance, 0);
      setRemainingDistance(remaining);

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

      // --- Off-route detection with grace period ---
      if (currentRoute && dest && currentSettings.autoReroute && !arrivedRef.current) {
        // Accuracy-aware threshold: wider tolerance when GPS is weak
        const offRoute = RerouteService.isOffRoute(coord, currentRoute, gpsAccuracy);
        const inCooldown = Date.now() - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS;
        if (inCooldown) {
          return;
        }

        if (offRoute) {
          if (!rerouteTimerRef.current) {
            // Start grace period
            setReroutePending(true);
            rerouteTimerRef.current = setTimeout(() => {
              rerouteTimerRef.current = null;
              // Re-check still off-route after grace period
              const latestRoute = routeRef.current;
              if (latestRoute && RerouteService.isOffRoute(coord, latestRoute, gpsAccuracy)) {
                const resolvedStart = SnapToRoadService.resolveRoutingNode(coord);
                const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(dest, coord);
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
                  if (!isMuted && settingsRef.current.voiceInstructions) { // fixed: respect voice settings for reroute prompts
                    VoiceService.speak(
                      settingsRef.current.language === 'ur'
                        ? 'راستہ دوبارہ بن رہا ہے۔ چلتے رہیں۔'
                        : 'Recalculating. Please continue walking.',
                      settingsRef.current.language
                    );
                  }
                }
                setReroutePending(false);
              } else {
                setReroutePending(false);
              }
            }, REROUTE_GRACE_MS);
          }
        } else {
          // Back on route — cancel pending reroute
          if (rerouteTimerRef.current) {
            clearTimeout(rerouteTimerRef.current);
            rerouteTimerRef.current = null;
            setReroutePending(false);
          }
        }
      }
    },
    [isMuted, setReroutePending]
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
    handleExit,
  };
}
