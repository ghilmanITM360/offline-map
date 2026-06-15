/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDistance } from 'geolib';
import * as Speech from 'expo-speech';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import {
  Coordinate,
  Place,
  V2ActiveRoute,
  V2NavigationInstruction,
} from '../models/types';
import { RootStackParamList } from '../navigation/RootNavigator';
import { RerouteService } from '../services/RerouteService';
import { GPSManagerService } from '../services/GPSManagerService';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
import { V2NavigationAdapter, isV2ActiveRoute } from '../services/V2NavigationAdapter';
import {
  buildV2RerouteRequest,
  calculateNavigationProgressV2,
  evaluateRerouteEvidenceV2,
  keepCurrentRouteAfterRerouteFailureV2,
  shouldIgnorePoorAccuracyMovementV2,
} from '../services/V2NavigationRuntimeService';

const ARRIVAL_THRESHOLD_METERS = 20;
const REROUTE_COOLDOWN_MS = 25_000;

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
  return {
    id: route.destination.blockId ?? route.destination.gateId ?? route.routeId,
    name: route.destination.label,
    category: route.destination.type === 'gate' ? 'Gate' : route.destination.type === 'rasta' ? 'Rasta' : 'Block',
    description: route.destination.label,
    coordinate: route.destination.coordinate,
    sourceVersion: 'v2',
  };
}

export function useNavigationViewModelV2() {
  const destinationFromStore = useAppStore((s) => s.destination);
  const activeRoute = useAppStore((s) => s.activeRoute);
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

  const route = isV2ActiveRoute(activeRoute) ? activeRoute : null;
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

  const progressRef = useRef(0);
  const lastAcceptedLocationRef = useRef<Coordinate | null>(route?.origin.coordinate ?? null);
  const offRouteStartRef = useRef<number | null>(null);
  const consecutiveOffRouteRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const lastSpokenInstructionIdRef = useRef<string | null>(null);
  const handleLiveLocation = useCallback(() => {
    // GPSManagerService updates currentLocation through the store updater wired in RootNavigator.
  }, []);

  useEffect(() => {
    if (!route) return;
    setRemainingDistance(route.totalDistanceM);
    setEtaMinutes(route.etaMinutes);
    setSnappedLocation(route.origin.coordinate);
    setCurrentStepIndex(0);
    progressRef.current = 0;
  }, [route?.routeId]);

  useEffect(() => {
    if (!route) return;
    GPSManagerService.addListener(handleLiveLocation, 'navigation');
    return () => {
      GPSManagerService.removeListener(handleLiveLocation);
    };
  }, [handleLiveLocation, route]);

  const attemptReroute = useCallback((coordinate: Coordinate) => {
    if (!route || !settings.autoReroute) return;
    setReroutePending(true);
    setRerouteStatusMessage(null);

    const rerouteRequest = buildV2RerouteRequest({
      route,
      coordinate,
      walkingSpeedMs: settings.walkingSpeed ?? 1.4,
    });
    const candidate = RoutingServiceV2.calculateRoute(rerouteRequest);
    if (!candidate) {
      lastRerouteAtRef.current = Date.now();
      const failure = keepCurrentRouteAfterRerouteFailureV2(route);
      setRerouteStatusMessage(failure.message);
      setReroutePending(false);
      return;
    }

    const activeCandidate = V2NavigationAdapter.fromPreview({
      previewRoute: candidate,
      destination: destination ?? placeFromV2Destination(route, null)!,
      currentLocation: coordinate,
    });
    setActiveRoute(activeCandidate);
    setRouteInstructions(activeCandidate.instructions);
    setRemainingDistance(activeCandidate.totalDistanceM);
    progressRef.current = 0;
    lastAcceptedLocationRef.current = coordinate;
    consecutiveOffRouteRef.current = 0;
    offRouteStartRef.current = null;
    lastRerouteAtRef.current = Date.now();
    setReroutePending(false);
  }, [destination, route, setActiveRoute, setReroutePending, setRouteInstructions, settings.autoReroute, settings.walkingSpeed]);

  useEffect(() => {
    if (!route || !currentLocation) return;

    const accuracyM = currentLocation.accuracy ?? 0;
    const movedDistanceM = lastAcceptedLocationRef.current
      ? getDistance(lastAcceptedLocationRef.current, currentLocation)
      : Infinity;
    if (shouldIgnorePoorAccuracyMovementV2({ movedDistanceM, accuracyM })) {
      setIsWeakGps(true);
      return;
    }

    const weakGps = RerouteService.shouldHoldRouteForWeakGps(accuracyM);
    setIsWeakGps(weakGps);
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
      Speech.speak(currentInstruction.spokenText ?? currentInstruction.text);
    }

    const thresholdM = RerouteService.getDynamicOffRouteThresholdMeters(accuracyM);
    const isOffRoute = progress.distanceToRouteMeters > thresholdM;
    if (!isOffRoute || weakGps) {
      consecutiveOffRouteRef.current = 0;
      offRouteStartRef.current = null;
      return;
    }

    consecutiveOffRouteRef.current += 1;
    offRouteStartRef.current = offRouteStartRef.current ?? Date.now();
    const evidence = evaluateRerouteEvidenceV2({
      gpsAccuracyM: accuracyM,
      consecutiveOffRouteCount: consecutiveOffRouteRef.current,
      offRouteDurationMs: Date.now() - offRouteStartRef.current,
      cooldownRemainingMs: Math.max(0, REROUTE_COOLDOWN_MS - (Date.now() - lastRerouteAtRef.current)),
      movedDistanceSinceLastAcceptedM: movedDistanceM,
    });

    if (evidence.shouldReroute) {
      attemptReroute(currentLocation);
    }
  }, [attemptReroute, currentLocation, currentStepIndex, etaMinutes, instructions, isMuted, route, settings.voiceInstructions, settings.walkingSpeed]);

  const handleExit = useCallback((navigation: NativeStackNavigationProp<RootStackParamList, 'Navigation'>) => {
    Speech.stop();
    stopNavigation();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
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
    rerouteStatusMessage,
    handleExit,
  };
}
