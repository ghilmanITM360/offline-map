/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { getDistance } from 'geolib';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { RoutePointService } from '../services/RoutePointService';
import { Place, RouteAlternative, RoutePreview } from '../models/types';
import { RootStackParamList } from '../navigation/RootNavigator';
import { LocationAccessService } from '../services/LocationAccessService';
import { MapFeatureFlagsService } from '../services/MapFeatureFlagsService';
import { V2DirectionsService } from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';

const ROUTE_TIMEOUT_MS = 3500;
const DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M = 20;

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
    setRoutePlannerDest,
    setRoutePlannerOrigin,
  } = useAppStore.getState();

  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [alternatives, setAlternatives] = useState<RouteAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loadState, setLoadState] = useState<RouteLoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualStart, setManualStart] = useState<Place | null>(null);
  const [startSource, setStartSource] = useState<StartSource>(currentLocation ? 'live_gps' : 'manual_place');
  const [routeOriginLocation, setRouteOriginLocation] = useState(currentLocation);
  const [isEditingManualStart, setIsEditingManualStart] = useState(false);
  const isV2Destination = destination?.sourceVersion === 'v2';
  const v2NavigationStartCheck = isV2Destination
    ? V2NavigationAdapter.canStartActiveNavigation({ route: route as any, destination })
    : { canStart: Boolean(route), message: '' };

  useEffect(() => {
    if (!routeOriginLocation && startSource === 'live_gps') {
      setLoadState('needs_origin');
    }
  }, [routeOriginLocation, startSource]);

  useEffect(() => {
    if (startSource !== 'live_gps' || !currentLocation) return;
    setRouteOriginLocation((previous) => {
      if (!previous) return currentLocation;
      return getDistance(previous, currentLocation) >= DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M
        ? currentLocation
        : previous;
    });
  }, [currentLocation, startSource]);

  const rememberedLocationAgeLabel = formatLastKnownAge(lastKnownLocationUpdatedAt);
  const rememberedLocationAvailable = !!lastKnownLocation;
  const rememberedLocationInsideVenue = !!lastKnownLocation && RoutingService.isInsideVenue(lastKnownLocation);
  const currentRouteOriginInsideVenue = !!routeOriginLocation && RoutingService.isInsideVenue(routeOriginLocation);

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
        ? routeOriginLocation
        : startSource === 'remembered_location'
        ? lastKnownLocation
        : manualStart?.coordinate;
    if (!originCoord && !(destination?.sourceVersion === 'v2' && startSource === 'manual_place' && manualStart)) {
      setLoadState('needs_origin');
      setErrorMessage('Choose starting point to continue.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    const shouldUseV2Destination = destination.sourceVersion === 'v2';
    if (shouldUseV2Destination) {
      setLoadState('loading');
      setErrorMessage(null);
      const hasOriginCoord = originCoord != null;
      const forceOutside =
        startSource !== 'manual_place' &&
        hasOriginCoord &&
        !EntryGateRoutingService.isInsideIjtemaArea(originCoord);

      const preview = V2DirectionsService.calculatePreview({
        startPlace: startSource === 'manual_place' ? manualStart : null,
        destination,
        currentLocation: startSource === 'manual_place' ? null : originCoord ?? null,
        walkingSpeedMs: settings.walkingSpeed ?? 1.4,
        forceOutside,
      });

      if (preview.status === 'disabled' || !MapFeatureFlagsService.useIjtemaV2Routing()) {
        setLoadState('error');
        setErrorMessage('V2 route preview is disabled. Enable EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING to calculate this route.');
        setRoute(null);
        setAlternatives([]);
        setInstructions([]);
        setRouteAlternatives([]);
        return;
      }

      if (preview.status !== 'ready' || !preview.route) {
        setLoadState('error');
        setErrorMessage(preview.message || 'Could not calculate v2 route preview.');
        setRoute(null);
        setAlternatives([]);
        setInstructions([]);
        setRouteAlternatives([]);
        return;
      }

      const alt: RouteAlternative = {
        label: 'V2 Route',
        labelUr: 'وی ٹو راستہ',
        route: preview.route,
      };
      setAlternatives([alt]);
      setRouteAlternatives([alt]);
      setSelectedIndex(0);
      setSelectedRouteIndex(0);
      setRoute(preview.route);
      setInstructions(preview.instructions);
      setActiveRoute(preview.route);
      setRouteInstructions(preview.instructions);
      setRoutePlannerDest(destination);
      setRoutePlannerOrigin(startSource === 'manual_place' ? manualStart : null);
      setLoadState('ready');
      return;
    }

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
      setErrorMessage('Legacy route preview supports starts inside Ijtema only. Choose an inside start point.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource !== 'live_gps' && !RoutingService.isInsideVenue(originCoord)) {
      setLoadState('needs_origin');
      setErrorMessage('Legacy route preview supports starts inside Ijtema only. Choose an inside start point.');
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
      setRoutePlannerDest(destination);
      setRoutePlannerOrigin(startSource === 'manual_place' ? manualStart : null);
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
  }, [destination, lastKnownLocation, manualStart, routeOriginLocation, setActiveRoute, setRouteAlternatives, setRouteInstructions, setSelectedRouteIndex, settings.walkingSpeed, startSource]);

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
      setRouteOriginLocation(resolved.coordinate);
      if (destination?.sourceVersion !== 'v2' && !RoutingService.isInsideVenue(resolved.coordinate)) {
        setStartSource('manual_place');
        setIsEditingManualStart(true);
        setLoadState('needs_origin');
        setErrorMessage('Legacy route preview supports starts inside Ijtema only. Choose an inside start point.');
        return false;
      }

      setStartSource('live_gps');
      setIsEditingManualStart(false);
      setManualStart(null);
      setErrorMessage(
        destination?.sourceVersion === 'v2' && !RoutingService.isInsideVenue(resolved.coordinate)
          ? "You are outside Ijtema. We'll enter through nearest official gate."
          : null,
      );
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
    if (!lastKnownLocation || (destination?.sourceVersion !== 'v2' && !RoutingService.isInsideVenue(lastKnownLocation))) {
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
    setErrorMessage(
      RoutingService.isInsideVenue(lastKnownLocation)
        ? `Using last known location ${formatLastKnownAge(lastKnownLocationUpdatedAt)}.`
        : "You are outside Ijtema. We'll enter through nearest official gate.",
    );
    return true;
  };

  const chooseManualStart = () => {
    setStartSource('manual_place');
    setIsEditingManualStart(true);
    setErrorMessage(null);
  };

  const handleStartNavigation = (navigation: NativeStackNavigationProp<RootStackParamList, 'Directions'>) => {
    if (destination && route) {
      if (destination.sourceVersion === 'v2') {
        if (
          !MapFeatureFlagsService.useIjtemaV2Map() ||
          !MapFeatureFlagsService.useIjtemaV2Routing() ||
          !MapFeatureFlagsService.useIjtemaV2Navigation()
        ) {
          setErrorMessage('V2 active navigation requires v2 map, routing, and navigation feature flags.');
          return;
        }

        const startCheck = V2NavigationAdapter.canStartActiveNavigation({ route: route as any, destination });
        if (!startCheck.canStart) {
          setErrorMessage(startCheck.message);
          return;
        }
        const activeRoute = V2NavigationAdapter.fromPreview({
          previewRoute: route as any,
          destination,
          startPlace: startSource === 'manual_place' ? manualStart : null,
          currentLocation: startSource === 'manual_place' ? null : (
            startSource === 'remembered_location' ? lastKnownLocation : routeOriginLocation
          ),
        });
        startNavigation(destination, activeRoute, activeRoute.instructions);
        navigation.navigate('Navigation');
        return;
      }

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
    currentRouteOriginInsideVenue,
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
    canStartNavigation: destination?.sourceVersion === 'v2' ? v2NavigationStartCheck.canStart : Boolean(route),
    startNavigationDisabledReason: v2NavigationStartCheck.message,
    isV2PreviewOnly: destination?.sourceVersion === 'v2' && !MapFeatureFlagsService.useIjtemaV2Navigation(),
  };
}
