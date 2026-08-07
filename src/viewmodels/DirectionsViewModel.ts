/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDistance } from 'geolib';
import { useAppStore } from '../store/useAppStore';
import { RoutingService } from '../services/RoutingService';
import { InstructionService, Instruction } from '../services/InstructionService';
import { Place, RouteAlternative, RoutePreview } from '../models/types';
import { LocationAccessService } from '../services/LocationAccessService';
import { MapFeatureFlagsService } from '../services/MapFeatureFlagsService';
import {
  V2DirectionsService,
  destinationFromPlace,
  type V2DirectionsPreviewResult,
} from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { RoutePointService } from '../services/RoutePointService';
import { getRoutableOfficialGates } from '../data/ijtema/entryPolicy';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { OutsideRouteRequestCoordinator } from '../services/outsideRouting/OutsideRouteRequestCoordinator';
import { formatLastKnownAge } from '../utils/formatLastKnownAge';

const ROUTE_TIMEOUT_MS = 3500;
const DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M = 20;
const productionOutsideRouteSource = createProductionOutsideRouteSource();

type RouteLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'needs_origin';
export type StartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place';

function resolveInitialStartSource(
  hasLocation: boolean,
  source: ReturnType<typeof useAppStore.getState>['currentLocationSource'],
): StartSource {
  if (!hasLocation || source === 'manual') return 'manual_place';
  if (source === 'device_last_known') return 'device_last_known';
  if (source === 'remembered') return 'remembered_location';
  return 'live_gps';
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
    setRouteAlternatives,
    setSelectedRouteIndex,
    setActiveRoute,
    setRouteInstructions,
    setRoutePlannerDest,
    setRoutePlannerOrigin,
    startNavigation,
  } = useAppStore.getState();

  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [alternatives, setAlternatives] = useState<RouteAlternative[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loadState, setLoadState] = useState<RouteLoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualStart, setManualStart] = useState<Place | null>(null);
  const [startSource, setStartSource] = useState<StartSource>(
    resolveInitialStartSource(Boolean(currentLocation), currentLocationSource),
  );
  const [routeOriginLocation, setRouteOriginLocation] = useState(currentLocation);
  const [isEditingManualStart, setIsEditingManualStart] = useState(false);
  const [manualGateId, setManualGateId] = useState<string | null>(null);
  const [routeRefreshing, setRouteRefreshing] = useState(false);
  const routeRef = useRef<RoutePreview | null>(null);
  const routeDestinationIdRef = useRef<string | null>(null);
  const outsideRequestCoordinatorRef = useRef(new OutsideRouteRequestCoordinator());
  routeRef.current = route;
  const manualGateOptions = getRoutableOfficialGates().map((gate) => ({ gateId: gate.id, label: gate.name.en }));
  const isV2Destination = Boolean(destination && destinationFromPlace(destination));
  const v2NavigationStartCheck = isV2Destination
    ? V2NavigationAdapter.canStartActiveNavigation({ route: route as any, destination })
    : { canStart: Boolean(route), message: '' };

  useEffect(() => {
    if (!routeOriginLocation && startSource === 'live_gps') {
      setLoadState('needs_origin');
    }
  }, [routeOriginLocation, startSource]);

  useEffect(() => () => outsideRequestCoordinatorRef.current.cancelCurrent(), []);

  useEffect(() => {
    setManualGateId(null);
  }, [destination?.id]);

  useEffect(() => {
    if (startSource !== 'live_gps' || !currentLocation) return;
    setRouteOriginLocation((previous) => {
      if (!previous) return currentLocation;
      return getDistance(previous, currentLocation) >= DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M
        ? currentLocation
        : previous;
    });
  }, [currentLocation, startSource]);

  // v2 destinations use precise venue polygon/polyline geometry everywhere in
  // this flow, matching the routing decision itself (EntryGateRoutingService);
  // legacy (v1) destinations keep the coarse rectangle, which is what the v1
  // graph's own coverage is actually defined by.
  const isInsideVenueForDestination = (coordinate: NonNullable<typeof currentLocation>): boolean =>
    isV2Destination
      ? EntryGateRoutingService.isInsideIjtemaArea(coordinate)
      : RoutingService.isInsideVenue(coordinate);

  const rememberedLocationAgeLabel = formatLastKnownAge(lastKnownLocationUpdatedAt);
  const rememberedLocationAvailable = !!lastKnownLocation;
  const rememberedLocationInsideVenue = !!lastKnownLocation && isInsideVenueForDestination(lastKnownLocation);
  const currentRouteOriginInsideVenue = !!routeOriginLocation && isInsideVenueForDestination(routeOriginLocation);

  // The single authoritative origin coordinate for this destination — inside/outside
  // presentation (isOutsideStart below, and everything LocationSheet derives from it: loading
  // copy, provider status text, gate-entry wording) and the actual route calculation
  // (calculateRoute's originCoord) must always agree, so both read through this one function
  // rather than keeping two independently-drifting computations.
  //
  // For live_gps this is deliberately `routeOriginLocation` (the thresholded, already-committed
  // origin a route was last calculated from — see the recalculate-movement effect above), not
  // the raw `currentLocation` GPS sample. Near the Ijtema boundary, a newer GPS fix can read
  // outside while still under DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M and therefore hasn't
  // committed into routeOriginLocation yet — reading raw currentLocation here would flip the
  // UI to "outside" a beat before the active route/provider actually follows, showing the user
  // gate-entry copy for a route that hasn't changed. Once the movement threshold is crossed,
  // routeOriginLocation updates and both presentation and routing move together.
  const resolveActiveOriginCoordinate = () =>
    startSource === 'live_gps' || startSource === 'device_last_known'
      ? routeOriginLocation
      : startSource === 'remembered_location'
      ? lastKnownLocation
      : manualStart?.coordinate ?? null;

  // Presentation-only "is the active start point outside the venue" check. The routing
  // coordinate determines outside/inside presentation, not the source label — a manually
  // searched or map-selected place whose coordinate is genuinely outside the venue must show
  // the same "Outside Ijtema" status as GPS/remembered starts, matching calculateRoute's own
  // forceOutside below (which already applies uniformly to every startSource). Previously
  // manual_place was excluded here, so the routing layer would silently run the outside/gate
  // flow while the UI still claimed the start was inside.
  const startCoordinateForOutsideCheck = resolveActiveOriginCoordinate();
  const isOutsideStart =
    isV2Destination &&
    !!startCoordinateForOutsideCheck &&
    !EntryGateRoutingService.isInsideIjtemaArea(startCoordinateForOutsideCheck);

  const startSourceLabel =
    startSource === 'live_gps'
      ? (currentLocation ? 'My current location' : 'Choose starting point')
      : startSource === 'device_last_known'
      ? 'Device last known location'
      : startSource === 'remembered_location'
      ? `Last known location (${rememberedLocationAgeLabel})`
      : (manualStart?.name ?? 'Choose starting point');
  const startSourceSupportingCopy =
    startSource === 'live_gps'
      ? 'Using live GPS location now.'
      : startSource === 'device_last_known'
      ? 'Using device last known location because live GPS is unavailable.'
      : startSource === 'remembered_location'
      ? `Using last known location ${rememberedLocationAgeLabel}.`
      : manualStart
      ? `Starting from ${manualStart.name}.`
      : 'Choose a start point to continue.';
  const isCurrentLocationStartActive = startSource === 'live_gps';

  const calculateRoute = useCallback(async () => {
    if (!destination) {
      setLoadState('error');
      setErrorMessage('Destination missing. Please go back and select a destination.');
      return;
    }

    const originCoord = resolveActiveOriginCoordinate();
    if (!originCoord && !(isV2Destination && startSource === 'manual_place' && manualStart)) {
      setLoadState('needs_origin');
      setErrorMessage('Choose starting point to continue.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    const shouldUseV2Destination = isV2Destination;
    if (shouldUseV2Destination) {
      const previousRoute = routeDestinationIdRef.current === destination.id ? routeRef.current : null;
      const replacingCurrentRoute = Boolean(previousRoute);
      if (!replacingCurrentRoute) {
        setLoadState('loading');
        setRoute(null);
      }
      setRouteRefreshing(replacingCurrentRoute);
      setErrorMessage(null);
      const hasOriginCoord = originCoord != null;
      const forceOutside =
        hasOriginCoord &&
        !EntryGateRoutingService.isInsideIjtemaArea(originCoord);

      const previewRequest = {
        startPlace: startSource === 'manual_place' && !forceOutside ? manualStart : null,
        destination,
        currentLocation: startSource === 'manual_place' && !forceOutside ? null : originCoord ?? null,
        walkingSpeedMs: settings.walkingSpeed ?? 1.4,
        forceOutside,
        manualGateId: manualGateId ?? undefined,
      };
      const requestHandle = forceOutside
        ? outsideRequestCoordinatorRef.current.begin(`${destination.id}:${startSource}:${manualGateId ?? 'automatic'}`)
        : null;
      if (!forceOutside) outsideRequestCoordinatorRef.current.cancelCurrent();
      let preview: V2DirectionsPreviewResult;
      try {
        preview = requestHandle
          ? await V2DirectionsService.calculateHybridPreview({
              request: previewRequest,
              token: requestHandle.token,
              signal: requestHandle.signal,
              outsideProvider: productionOutsideRouteSource,
            })
          : V2DirectionsService.calculatePreview(previewRequest);
      } catch {
        preview = {
          status: 'unavailable',
          route: null,
          instructions: [],
          message: 'Outside routing is temporarily unavailable.',
        };
      }
      if (requestHandle && !requestHandle.canCommit()) return;

      if (preview.status === 'disabled' || !MapFeatureFlagsService.useIjtemaV2Routing()) {
        setLoadState('error');
        setErrorMessage('V2 route preview is disabled. Enable EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING to calculate this route.');
        setRouteRefreshing(false);
        if (!previousRoute) {
          setRoute(null);
          setAlternatives([]);
          setInstructions([]);
          setRouteAlternatives([]);
        } else {
          setLoadState('ready');
        }
        requestHandle?.finish();
        return;
      }

      if (preview.status !== 'ready' || !preview.route) {
        setLoadState('error');
        setErrorMessage(preview.message || 'Could not calculate v2 route preview.');
        setRouteRefreshing(false);
        if (!previousRoute) {
          setRoute(null);
          setAlternatives([]);
          setInstructions([]);
          setRouteAlternatives([]);
        } else {
          setLoadState('ready');
        }
        requestHandle?.finish();
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
      routeDestinationIdRef.current = destination.id;
      setInstructions(preview.instructions);
      setActiveRoute(preview.route);
      setRouteInstructions(preview.instructions);
      setRoutePlannerDest(destination);
      setRoutePlannerOrigin(startSource === 'manual_place' ? manualStart : null);
      setLoadState('ready');
      setRouteRefreshing(false);
      requestHandle?.finish();
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
  }, [destination, isV2Destination, lastKnownLocation, manualGateId, manualStart, routeOriginLocation, setActiveRoute, setRouteAlternatives, setRouteInstructions, setSelectedRouteIndex, settings.walkingSpeed, startSource]);

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
      if (!isV2Destination && !RoutingService.isInsideVenue(resolved.coordinate)) {
        setStartSource('manual_place');
        setIsEditingManualStart(true);
        setLoadState('needs_origin');
        setErrorMessage('Legacy route preview supports starts inside Ijtema only. Choose an inside start point.');
        return false;
      }

      setStartSource(resolved.source === 'device_last_known' ? 'device_last_known' : 'live_gps');
      setIsEditingManualStart(false);
      setManualStart(null);
      setErrorMessage(
        isV2Destination && !EntryGateRoutingService.isInsideIjtemaArea(resolved.coordinate)
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
    if (!lastKnownLocation || (!isV2Destination && !RoutingService.isInsideVenue(lastKnownLocation))) {
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
      isInsideVenueForDestination(lastKnownLocation)
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

  const selectManualGate = (gateId: string) => {
    if (!manualGateOptions.some((gate) => gate.gateId === gateId)) return;
    setManualGateId(gateId);
  };

  const clearManualGateSelection = () => setManualGateId(null);

  // Legacy (v1) destinations only — v2 destinations start navigation through
  // HomeScreen's route-preview card (handleStartPreviewNavigation), which
  // reuses this same store action for the v2-shaped route instead.
  const handleStartNavigation = () => {
    if (!destination || !route || isV2Destination) return;
    const endNodeId = route.nodes[route.nodes.length - 1];
    const resolvedDestination = endNodeId
      ? RoutePointService.enrichPlaceWithRoutingNode(destination, endNodeId)
      : destination;
    startNavigation(resolvedDestination, route, instructions);
  };

  return {
    route,
    alternatives,
    selectedIndex,
    selectAlternative,
    instructions,
    startSourceLabel,
    startSourceSupportingCopy,
    isCurrentLocationStartActive,
    activeOriginCoordinate: startCoordinateForOutsideCheck,
    startSource,
    rememberedLocationAgeLabel,
    rememberedLocationAvailable,
    rememberedLocationInsideVenue,
    currentRouteOriginInsideVenue,
    isOutsideStart,
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
    retryOutsideRoute: calculateRoute,
    manualGateId,
    manualGateOptions,
    selectManualGate,
    clearManualGateSelection,
    routeRefreshing,
    handleStartNavigation,
    showRememberedStartAction: rememberedLocationAvailable,
    showManualStartSearch: isEditingManualStart || startSource === 'manual_place',
    canStartNavigation: isV2Destination ? v2NavigationStartCheck.canStart : Boolean(route),
    startNavigationDisabledReason: v2NavigationStartCheck.message,
    isV2PreviewOnly: isV2Destination && !MapFeatureFlagsService.useIjtemaV2Navigation(),
  };
}
