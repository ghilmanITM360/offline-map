/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { RoutePointService } from '../services/RoutePointService';
import { Place, RouteAlternative, RoutePreview } from '../models/types';
import { RootStackParamList } from '../navigation/RootNavigator';
import { LocationAccessService } from '../services/LocationAccessService';

const ROUTE_TIMEOUT_MS = 3500;

type RouteLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'needs_origin';
export type StartSource = 'live_gps' | 'remembered_location' | 'manual_place';

function formatLastKnownAge(timestamp: string | null): string {
  if (!timestamp) return 'from an earlier session';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'from an earlier session';
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) return `from ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `from ${hours} hour${hours === 1 ? '' : 's'} ago`;
}

export function useDirectionsViewModel(destination: Place | null) {
  const currentLocation = useAppStore((s) => s.currentLocation);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const lastKnownLocationUpdatedAt = useAppStore((s) => s.lastKnownLocationUpdatedAt);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const setHasLocationPermission = useAppStore((s) => s.setHasLocationPermission);
  const settings = useAppStore((s) => s.settings);
  const {
    startNavigation,
    setRouteAlternatives,
    setSelectedRouteIndex,
    setActiveRoute,
    setRouteInstructions,
  } = useAppStore.getState();

  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [alternatives, setAlternatives] = useState<RouteAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loadState, setLoadState] = useState<RouteLoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualStart, setManualStart] = useState<Place | null>(null);
  const [startSource, setStartSource] = useState<StartSource>(currentLocation ? 'live_gps' : 'manual_place');
  const [isEditingManualStart, setIsEditingManualStart] = useState(false);

  useEffect(() => {
    if (!currentLocation && startSource === 'live_gps') {
      setLoadState('needs_origin');
    }
  }, [currentLocation, startSource]);

  const rememberedLocationAgeLabel = formatLastKnownAge(lastKnownLocationUpdatedAt);
  const rememberedLocationAvailable = !!lastKnownLocation;
  const rememberedLocationInsideVenue = !!lastKnownLocation && RoutingService.isInsideVenue(lastKnownLocation);

  const startSourceLabel =
    startSource === 'live_gps'
      ? (currentLocation ? (currentLocationSource === 'remembered' ? 'Last known location' : 'My current location') : 'Choose starting point')
      : startSource === 'remembered_location'
      ? `Last known location (${rememberedLocationAgeLabel})`
      : (manualStart?.name ?? 'Choose starting point');

  const calculateRoute = useCallback(async () => {
    if (!destination) {
      setLoadState('error');
      setErrorMessage('Destination missing. Please go back and select a destination.');
      return;
    }

    const originCoord =
      startSource === 'live_gps'
        ? currentLocation
        : startSource === 'remembered_location'
        ? lastKnownLocation
        : manualStart?.coordinate;
    if (!originCoord) {
      setLoadState('needs_origin');
      setErrorMessage('Choose starting point to continue.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource === 'live_gps' && !RoutingService.isInsideVenue(originCoord)) {
      setLoadState('needs_origin');
      setErrorMessage('You are outside the Ijtema area. Choose a start point inside the ground or use the nearest gate.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource !== 'live_gps' && !RoutingService.isInsideVenue(originCoord)) {
      setLoadState('needs_origin');
      setErrorMessage('Selected start is outside the Ijtema area. Choose a start point inside the ground.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource === 'manual_place' && manualStart && destination && manualStart.id === destination.id) {
      setLoadState('error');
      setErrorMessage('Start and destination are the same. Choose a different starting point.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    setLoadState('loading');
    setErrorMessage(null);

    try {
      const routePromise = new Promise<RouteAlternative[]>((resolve) => {
        const walkingSpeedMs = settings.walkingSpeed ?? 1.4;
        const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(destination, originCoord);
        const startNodeIdOverride = startSource === 'manual_place' ? manualStart?.routingNodeId : undefined;
        const nodePlan = RoutingService.explainRouteNodeResolution(originCoord, destNodeIds, startNodeIdOverride);
        const hasNonSamePair = nodePlan.startNodeIds.some((startNodeId) =>
          nodePlan.targetNodeIds.some((destNodeId) => destNodeId !== startNodeId),
        );

        if (!hasNonSamePair) {
          resolve([]);
          return;
        }

        const alts = RoutingService.calculateRoutes(originCoord, destNodeIds, walkingSpeedMs, startNodeIdOverride);
        resolve(alts);
      });

      const timeoutPromise = new Promise<RouteAlternative[]>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), ROUTE_TIMEOUT_MS);
      });

      const alts = await Promise.race([routePromise, timeoutPromise]);
      const best = alts[0]?.route ?? null;

      if (!best) {
        const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(destination, originCoord);
        const startNodeIdOverride = startSource === 'manual_place' ? manualStart?.routingNodeId : undefined;
        const nodePlan = RoutingService.explainRouteNodeResolution(originCoord, destNodeIds, startNodeIdOverride);
        const sameOnly =
          nodePlan.startNodeIds.length > 0 &&
          nodePlan.targetNodeIds.length > 0 &&
          nodePlan.startNodeIds.every((startNodeId) => nodePlan.targetNodeIds.every((destNodeId) => destNodeId === startNodeId));

        setLoadState('error');
        setErrorMessage(
          sameOnly
            ? 'Start and destination are the same. Choose a different start point.'
            : 'Could not calculate route. Choose a different start point.',
        );
        setRoute(null);
        setAlternatives([]);
        setInstructions([]);
        setRouteAlternatives([]);
        return;
      }

      const generated = InstructionService.generateInstructions(best.nodes);
      if (generated.length === 0) {
        setLoadState('error');
        setErrorMessage('Could not generate route steps. Choose a different start point.');
        setRoute(null);
        setAlternatives([]);
        setInstructions([]);
        setRouteAlternatives([]);
        return;
      }

      setAlternatives(alts);
      setRouteAlternatives(alts);
      setSelectedIndex(0);
      setSelectedRouteIndex(0);
      setRoute(best);
      setInstructions(generated);
      setActiveRoute(best);
      setRouteInstructions(generated);
      setLoadState('ready');
    } catch (error) {
      if ((error as Error).message === 'timeout') {
        setLoadState('error');
        setErrorMessage('Could not calculate route. Choose a different start point.');
        return;
      }
      setLoadState('error');
      setErrorMessage('Route calculation failed. Please retry.');
    }
  }, [currentLocation, destination, lastKnownLocation, manualStart, setActiveRoute, setRouteAlternatives, setRouteInstructions, setSelectedRouteIndex, settings.walkingSpeed, startSource]);

  useEffect(() => {
    void calculateRoute();
  }, [calculateRoute]);

  const selectAlternative = (idx: number) => {
    const alt = alternatives[idx];
    if (!alt) return;
    setSelectedIndex(idx);
    setSelectedRouteIndex(idx);
    setRoute(alt.route);
    const generated = InstructionService.generateInstructions(alt.route.nodes);
    setInstructions(generated);
    setActiveRoute(alt.route);
    setRouteInstructions(generated);
  };

  const setManualStartPlace = (start: Place) => {
    setStartSource('manual_place');
    setManualStart(start);
    setIsEditingManualStart(false);
  };

  const chooseCurrentLocation = async (): Promise<boolean> => {
    try {
      const resolved = await LocationAccessService.resolveCurrentLocation(true);
      setHasLocationPermission(resolved.permissionState.granted);

      if (!resolved.ok || !resolved.coordinate) {
        let blockedMessage: string | null = null;
        if (!resolved.permissionState.granted && !resolved.permissionState.canAskAgain) {
          const opened = await LocationAccessService.openAppSettings();
          if (!opened) {
            blockedMessage = 'Location permission is blocked. Open app settings and allow location, then try again.';
          }
        }
        setStartSource('manual_place');
        setIsEditingManualStart(true);
        setLoadState('needs_origin');
        setErrorMessage(blockedMessage ?? resolved.message ?? 'Current location unavailable. Choose starting point manually.');
        return false;
      }

      setCurrentLocation(resolved.coordinate, resolved.source ?? 'live');
      if (!RoutingService.isInsideVenue(resolved.coordinate)) {
        setStartSource('manual_place');
        setIsEditingManualStart(true);
        setLoadState('needs_origin');
        setErrorMessage('You are outside the Ijtema area. Choose a start point inside the ground or use the nearest gate.');
        return false;
      }

      setStartSource('live_gps');
      setIsEditingManualStart(false);
      setManualStart(null);
      return true;
    } catch {
      setStartSource('manual_place');
      setIsEditingManualStart(true);
      setLoadState('needs_origin');
      setErrorMessage('Current location is temporarily unavailable. Choose start point manually.');
      return false;
    }
  };

  const chooseRememberedLocation = (): boolean => {
    if (!lastKnownLocation || !RoutingService.isInsideVenue(lastKnownLocation)) {
      setStartSource('manual_place');
      setIsEditingManualStart(true);
      setLoadState('needs_origin');
      setErrorMessage('No remembered location inside the Ijtema ground is available. Choose a start point manually.');
      return false;
    }

    setCurrentLocation(lastKnownLocation, 'remembered');
    setStartSource('remembered_location');
    setIsEditingManualStart(false);
    setManualStart(null);
    setErrorMessage(`Using last known location ${formatLastKnownAge(lastKnownLocationUpdatedAt)}.`);
    return true;
  };

  const chooseManualStart = () => {
    setStartSource('manual_place');
    setIsEditingManualStart(true);
    setErrorMessage(null);
  };

  const handleStartNavigation = (navigation: NativeStackNavigationProp<RootStackParamList, 'Directions'>) => {
    if (destination && route) {
      const endNodeId = route.nodes[route.nodes.length - 1];
      const resolvedDestination = endNodeId
        ? RoutePointService.enrichPlaceWithRoutingNode(destination, endNodeId)
        : destination;
      startNavigation(resolvedDestination, route, instructions);
      navigation.navigate('Navigation');
    }
  };

  return {
    route,
    alternatives,
    selectedIndex,
    selectAlternative,
    instructions,
    startSourceLabel,
    startSource,
    rememberedLocationAgeLabel,
    rememberedLocationAvailable,
    rememberedLocationInsideVenue,
    handleStartNavigation,
    loadState,
    errorMessage,
    manualStart,
    chooseManualStart,
    isEditingManualStart,
    setIsEditingManualStart,
    setManualStartPlace,
    chooseCurrentLocation,
    chooseRememberedLocation,
    calculateRoute,
    showRememberedStartAction: rememberedLocationAvailable,
    showManualStartSearch: isEditingManualStart || startSource === 'manual_place',
  };
}
