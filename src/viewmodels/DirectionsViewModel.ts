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
import { classifyLiveFix, evaluateLocationCapability } from '../services/LocationCapability';
import { LocationAccessService } from '../services/LocationAccessService';
import {
  evaluateNavigationLocationCapability,
  resolveStartAction,
  type NavigationStartSource,
} from '../services/LocationNavigationCapability';
import {
  isJourneyStartable,
  outsideGuideSummary,
  selectJourneyPresentationState,
} from '../services/JourneyPresentationState';
import { MapFeatureFlagsService } from '../services/MapFeatureFlagsService';
import {
  V2DirectionsService,
  destinationFromPlace,
  type V2DirectionsPreviewResult,
} from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import type { RoutePreviewV2 } from '../services/RoutingServiceV2';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { RoutePointService } from '../services/RoutePointService';
import { getRoutableOfficialGates } from '../data/ijtema/entryPolicy';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { OutsideRouteRequestCoordinator } from '../services/outsideRouting/OutsideRouteRequestCoordinator';
import { formatLastKnownAge } from '../utils/formatLastKnownAge';
import { CHOOSE_DESTINATION, CHOOSE_START, LOCATION_UNAVAILABLE, NAVIGATION_UNAVAILABLE, ROUTE_NOT_FOUND } from '../utils/routeCopy';

const ROUTE_TIMEOUT_MS = 3500;
const DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M = 20;
const productionOutsideRouteSource = createProductionOutsideRouteSource();

// 'same_place': start and destination resolve to the same place, so there is nothing to walk (never 'ready').
type RouteLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'needs_origin' | 'same_place';
export type StartSource = NavigationStartSource;

// A journey starts silently only from a LIVE fix: genuinely live, fresh and accurate. A remembered, earlier-known,
// map-fallback or stale position is never a start until the user picks it; without one the journey asks (needs_origin).
function usableLiveFix(
  coordinate: ReturnType<typeof useAppStore.getState>['currentLocation'],
  source: ReturnType<typeof useAppStore.getState>['currentLocationSource'],
) {
  return source === 'live' && classifyLiveFix(coordinate, Date.now()) === 'usable' ? coordinate : null;
}

export function useDirectionsViewModel(destination: Place | null) {
  const currentLocation = useAppStore((s) => s.currentLocation);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const lastKnownLocationUpdatedAt = useAppStore((s) => s.lastKnownLocationUpdatedAt);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const setHasLocationPermission = useAppStore((s) => s.setHasLocationPermission);
  const locationPermissionPrecision = useAppStore((s) => s.locationPermissionPrecision);
  const hasLocationPermission = useAppStore((s) => s.hasLocationPermission);
  const setLocationPermissionPrecision = useAppStore((s) => s.setLocationPermissionPrecision);
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
  const [initialLiveFix] = useState(() => usableLiveFix(currentLocation, currentLocationSource));
  const [startSource, setStartSource] = useState<StartSource>(initialLiveFix ? 'live_gps' : 'manual_place');
  const [routeOriginLocation, setRouteOriginLocation] = useState(initialLiveFix);
  const [isEditingManualStart, setIsEditingManualStart] = useState(false);
  const [manualGateId, setManualGateId] = useState<string | null>(null);
  const [routeRefreshing, setRouteRefreshing] = useState(false);
  // Outcome of the last "Use my location & start" press: 'failed' = no usable fix, 'settings' = the user must
  // allow (precise) location in system settings. Shown as one plain sentence under the primary action.
  const [startAttempt, setStartAttempt] = useState<'idle' | 'working' | 'failed' | 'settings' | 'services_off'>('idle');
  const routeRef = useRef<RoutePreview | null>(null);
  // What the route on screen was calculated for. A failed recalculation may keep it only for the same trip.
  const routeTripKeyRef = useRef<string | null>(null);
  const outsideRequestCoordinatorRef = useRef(new OutsideRouteRequestCoordinator());
  routeRef.current = route;
  const manualGateOptions = getRoutableOfficialGates().map((gate) => ({ gateId: gate.id, label: gate.name.en }));
  const isV2Destination = Boolean(destination && destinationFromPlace(destination));
  const v2NavigationStartCheck = isV2Destination
    ? V2NavigationAdapter.canStartActiveNavigation({ route: route as any, destination })
    : { canStart: Boolean(route), message: '' };
  const navigationLocationCapability = evaluateNavigationLocationCapability({
    startSource,
    coordinate: startSource === 'live_gps' ? routeOriginLocation : null,
    precision: startSource === 'live_gps' ? locationPermissionPrecision : undefined,
  });

  useEffect(() => {
    if (!routeOriginLocation && startSource === 'live_gps') {
      setLoadState('needs_origin');
    }
  }, [routeOriginLocation, startSource]);

  useEffect(() => () => outsideRequestCoordinatorRef.current.cancelCurrent(), []);

  useEffect(() => {
    setManualGateId(null);
    // This journey starts from nothing but what it chooses itself: a start left in the store by an earlier trip is gone.
    setRoutePlannerOrigin(null);
  }, [destination?.id]);

  useEffect(() => {
    if (startSource !== 'live_gps' || !currentLocation || currentLocationSource !== 'live') return;
    setRouteOriginLocation((previous) => {
      if (!previous) return currentLocation;
      if (getDistance(previous, currentLocation) >= DIRECTIONS_RECALCULATE_ORIGIN_MOVEMENT_M) return currentLocation;
      // Issue #109: below the recompute threshold we deliberately keep the committed
      // lat/lng (route stability), but freshness (observedAtMs/accuracy) is a purely
      // time-based question independent of that distance gate — a stationary user's
      // live GPS keeps delivering fresh fixes and must keep the staleness check current.
      return {
        ...previous,
        accuracy: currentLocation.accuracy,
        observedAtMs: currentLocation.observedAtMs,
        heading: currentLocation.heading,
      };
    });
  }, [currentLocation, currentLocationSource, startSource]);

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
      ? (currentLocation ? 'My current location' : 'Choose where to start')
      : startSource === 'device_last_known'
      ? 'Earlier location'
      : startSource === 'remembered_location'
      ? `Earlier location (${rememberedLocationAgeLabel})`
      : (manualStart?.name ?? 'Choose where to start');
  const startSourceSupportingCopy =
    startSource === 'live_gps'
      ? 'Using your current location.'
      : startSource === 'device_last_known'
      ? "We can't find you right now. Showing where you were earlier."
      : startSource === 'remembered_location'
      ? `Using your location ${rememberedLocationAgeLabel}.`
      : manualStart
      ? `Starting from ${manualStart.name}.`
      : 'Where are you starting from?';
  const isCurrentLocationStartActive = startSource === 'live_gps';

  // A planned/manual start only previews; live guidance needs a fresh precise fix. This turns that rule into
  // one enabled primary action so the user is never left on a dead Start button.
  const liveFix = currentLocationSource === 'live' ? currentLocation : null;
  const startAction = resolveStartAction({
    startSource,
    liveFix,
    permission: { granted: hasLocationPermission || liveFix !== null, precision: locationPermissionPrecision },
  });

  // The one authoritative journey state; the sheet renders from it and a start is offered only for a ready route.
  const previewState = selectJourneyPresentationState({ loadState, startSource, route: route as Parameters<typeof selectJourneyPresentationState>[0]['route'] });
  const journeyState = useAppStore((s) => s.isNavigating) ? 'ACTIVE_NAVIGATION' as const : previewState;
  const startable = isJourneyStartable(previewState);
  const outsideGuide = outsideGuideSummary(route as Parameters<typeof outsideGuideSummary>[0]);

  const clearRoute = () => {
    setRoute(null);
    setAlternatives([]);
    setInstructions([]);
    setRouteAlternatives([]);
  };

  const calculateRoute = useCallback(async () => {
    if (!destination) {
      setLoadState('error');
      setErrorMessage(CHOOSE_DESTINATION);
      return;
    }

    const originCoord = resolveActiveOriginCoordinate();
    if (!originCoord && !(isV2Destination && startSource === 'manual_place' && manualStart)) {
      setLoadState('needs_origin');
      setErrorMessage(null); // the FROM row already says "Choose where to start"
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource === 'manual_place' && manualStart && manualStart.id === destination.id) {
      setLoadState('same_place');
      setErrorMessage(null);
      setRouteRefreshing(false);
      clearRoute();
      return;
    }

    const shouldUseV2Destination = isV2Destination;
    if (shouldUseV2Destination) {
      const tripKey = `${destination.id}:${startSource}:${manualStart?.id ?? ''}:${manualGateId ?? ''}`;
      const previousRoute = routeTripKeyRef.current === tripKey ? routeRef.current : null;
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
          message: ROUTE_NOT_FOUND,
        };
      }
      if (requestHandle && !requestHandle.canCommit()) return;

      if (preview.status === 'disabled' || !MapFeatureFlagsService.useIjtemaV2Routing()) {
        setLoadState('error');
        setErrorMessage(NAVIGATION_UNAVAILABLE);
        setRouteRefreshing(false);
        if (previousRoute) setLoadState('ready');
        else clearRoute();
        requestHandle?.finish();
        return;
      }

      if (preview.status !== 'ready' || !preview.route) {
        // A failed recalculation keeps the route on screen only for the same trip; a different start's route never stays "ready".
        setLoadState('error');
        setErrorMessage(preview.message || ROUTE_NOT_FOUND);
        setRouteRefreshing(false);
        if (previousRoute) setLoadState('ready');
        else clearRoute();
        requestHandle?.finish();
        return;
      }

      if (preview.route.coordinates.length < 2 || preview.route.totalDistance <= 0) {
        setLoadState('same_place');
        setErrorMessage(null);
        setRouteRefreshing(false);
        clearRoute();
        requestHandle?.finish();
        return;
      }

      const alt: RouteAlternative = {
        label: 'Walking route',
        labelUr: 'پیدل راستہ',
        route: preview.route,
      };
      setAlternatives([alt]);
      setRouteAlternatives([alt]);
      setSelectedIndex(0);
      setSelectedRouteIndex(0);
      setRoute(preview.route);
      routeTripKeyRef.current = tripKey;
      setInstructions(preview.instructions);
      // #301: once Start has run, the navigation session owns activeRoute/routeInstructions. A recompute that
      // finishes later (live fix still moving while the sheet unmounts) must not swap in a preview without `origin`.
      if (!useAppStore.getState().isNavigating) {
        setActiveRoute(preview.route);
        setRouteInstructions(preview.instructions);
      }
      setRoutePlannerDest(destination);
      setRoutePlannerOrigin(startSource === 'manual_place' ? manualStart : null);
      setLoadState('ready');
      setRouteRefreshing(false);
      requestHandle?.finish();
      return;
    }

    if (!originCoord) {
      setLoadState('needs_origin');
      setErrorMessage(null); // the FROM row already says "Choose where to start"
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource === 'live_gps' && !RoutingService.isInsideVenue(originCoord)) {
      setLoadState('needs_origin');
      setErrorMessage('Choose a place inside Ijtema to start from.');
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource !== 'live_gps' && !RoutingService.isInsideVenue(originCoord)) {
      setLoadState('needs_origin');
      setErrorMessage('Choose a place inside Ijtema to start from.');
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
            : ROUTE_NOT_FOUND,
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
        setErrorMessage(ROUTE_NOT_FOUND);
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
      if (!useAppStore.getState().isNavigating) { // #301, see the v2 branch above
        setActiveRoute(best);
        setRouteInstructions(generated);
      }
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
      setErrorMessage(ROUTE_NOT_FOUND);
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

  type ResolvedLocation = Awaited<ReturnType<typeof LocationAccessService.resolveCurrentLocation>>;
  const chooseCurrentLocationWith = async (resolve: () => Promise<ResolvedLocation>): Promise<boolean> => {
    try {
      const resolved = await resolve();
      setHasLocationPermission(resolved.permissionState.granted);
      setLocationPermissionPrecision(resolved.permissionState.precision);

      if (!resolved.ok || !resolved.coordinate) {
        let blockedMessage: string | null = null;
        if (!resolved.permissionState.granted && !resolved.permissionState.canAskAgain) {
          const opened = await LocationAccessService.openAppSettings();
          if (!opened) {
            blockedMessage = 'Location is off for this app. Turn it on in Settings, then try again.';
          }
        }
        setStartSource('manual_place');
        setIsEditingManualStart(true);
        setLoadState('needs_origin');
        setErrorMessage(blockedMessage ?? resolved.message ?? `${LOCATION_UNAVAILABLE} ${CHOOSE_START}`);
        return false;
      }

      setCurrentLocation(resolved.coordinate, resolved.source ?? 'live');
      setRouteOriginLocation(resolved.coordinate);
      if (!isV2Destination && !RoutingService.isInsideVenue(resolved.coordinate)) {
        setStartSource('manual_place');
        setIsEditingManualStart(true);
        setLoadState('needs_origin');
        setErrorMessage('Choose a place inside Ijtema to start from.');
        return false;
      }

      setStartSource(resolved.source === 'device_last_known' ? 'device_last_known' : 'live_gps');
      setIsEditingManualStart(false);
      setManualStart(null);
      setErrorMessage(
        isV2Destination && !EntryGateRoutingService.isInsideIjtemaArea(resolved.coordinate)
          ? "You're outside Ijtema. We'll guide you to the nearest gate."
          : null,
      );
      return true;
    } catch {
      setStartSource('manual_place');
      setIsEditingManualStart(true);
      setLoadState('needs_origin');
      setErrorMessage(`${LOCATION_UNAVAILABLE} ${CHOOSE_START}`);
      return false;
    }
  };
  const chooseCurrentLocation = async (): Promise<boolean> =>
    chooseCurrentLocationWith(() => LocationAccessService.resolveCurrentLocation(true));

  const chooseRememberedLocation = (): boolean => {
    if (!lastKnownLocation || (!isV2Destination && !RoutingService.isInsideVenue(lastKnownLocation))) {
      setStartSource('manual_place');
      setIsEditingManualStart(true);
      setLoadState('needs_origin');
      setErrorMessage(`We don't have a saved location. ${CHOOSE_START}`);
      return false;
    }

    setCurrentLocation(lastKnownLocation, 'remembered');
    setStartSource('remembered_location');
    setIsEditingManualStart(false);
    setManualStart(null);
    setErrorMessage(
      isInsideVenueForDestination(lastKnownLocation)
        ? `Using your location ${formatLastKnownAge(lastKnownLocationUpdatedAt)}.`
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

  /**
   * Navigation start the user asked for that is waiting on a route recomputed from their live fix: `route` is the
   * stale route at press time, so only a different (recomputed) route may release it. Held in a ref: no render needed.
   */
  const pendingStartRef = useRef<{ go: () => void; staleRoute: unknown } | null>(null);
  useEffect(() => {
    const pending = pendingStartRef.current;
    if (!pending) return;
    if (loadState === 'error' || loadState === 'needs_origin') {
      pendingStartRef.current = null;
    } else if (loadState === 'ready' && route !== pending.staleRoute && startAction?.kind === 'start') {
      pendingStartRef.current = null;
      pending.go();
    }
  }, [loadState, route, startAction?.kind]);

  /**
   * Primary footer action. `startNow` begins navigation. A planned/manual start only previews, so every other state
   * first gets a fresh live fix; a manual or saved start then switches to that fix (the FROM row says so) and
   * navigation begins from the recomputed route.
   */
  const runStartAction = async (startNow: () => void) => {
    if (startAction.kind === 'start') return startNow();
    setStartAttempt('working');
    try {
      const resolved = await LocationAccessService.resolveCurrentLocation(true);
      setHasLocationPermission(resolved.permissionState.granted);
      setLocationPermissionPrecision(resolved.permissionState.precision);
      const { permissionState } = resolved;
      const blocker = evaluateLocationCapability({
        permission: { granted: permissionState.granted, canAskAgain: permissionState.canAskAgain, precision: permissionState.precision, servicesState: permissionState.servicesState },
        liveFix: resolved.source === 'live' ? resolved.coordinate : null,
      }).liveBlocker;
      if (blocker === 'permission_blocked' || blocker === 'approximate_only') {
        await LocationAccessService.openAppSettings();
        setStartAttempt('settings');
        return;
      }
      if (blocker === 'services_off') {
        await LocationAccessService.openLocationSettings();
        setStartAttempt('services_off');
        return;
      }
      if (!resolved.ok || resolved.source !== 'live' || !resolved.coordinate) {
        setStartAttempt('failed');
        return;
      }
      setStartAttempt('idle');
      if (startSource !== 'live_gps') {
        pendingStartRef.current = { go: startNow, staleRoute: route };
        await chooseCurrentLocationWith(async () => resolved);
        return;
      }
      setCurrentLocation(resolved.coordinate, 'live');
      const next = resolveStartAction({
        startSource,
        liveFix: resolved.coordinate,
        permission: { granted: true, precision: resolved.permissionState.precision },
      });
      if (next.kind === 'start') startNow();
    } catch {
      setStartAttempt('failed');
    }
  };

  // Route guide (#307): follow the chosen FROM -> TO by reading steps. No session, no live position, no marker.
  // Steps come from the same adapter live navigation uses, so a later upgrade to live guidance reads the same text.
  const routeGuideRouteRef = useRef<RoutePreview | null>(null);
  const routeGuideActive = useAppStore((s) => s.routeGuide !== null);
  const startRouteGuide = () => {
    if (!destination || !route) return;
    let steps: { text: string; distanceM: number }[];
    try {
      steps = V2NavigationAdapter.fromPreview({
        previewRoute: route as unknown as RoutePreviewV2,
        destination,
        startPlace: manualStart,
        currentLocation: null,
      }).instructions.map((step) => ({ text: step.text, distanceM: step.distanceM }));
    } catch {
      steps = instructions.map((step) => ({ text: step.text, distanceM: step.distance }));
    }
    routeGuideRouteRef.current = route;
    useAppStore.getState().startRouteGuide(steps);
  };
  // A guide belongs to the route it started from: a changed start, destination or recomputed route ends it.
  useEffect(() => {
    // A guide this view model never started (left over from an earlier trip) belongs to no route here either.
    if (routeGuideActive && (routeGuideRouteRef.current === null || route !== routeGuideRouteRef.current)) {
      useAppStore.getState().endRouteGuide();
    }
  }, [route, routeGuideActive]);

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
    journeyState,
    outsideGuide,
    startAction: v2NavigationStartCheck.canStart && startable ? startAction : null,
    startAttempt,
    runStartAction,
    startRouteGuide,
    showRememberedStartAction: rememberedLocationAvailable,
    // Editing mode only. `startSource === 'manual_place'` records where the start came from; it
    // must not keep the picker open after a place is chosen (#222 / #131).
    showManualStartSearch: isEditingManualStart,
    canStartNavigation: startable && (isV2Destination
      ? v2NavigationStartCheck.canStart && navigationLocationCapability.canStart
      : Boolean(route) && navigationLocationCapability.canStart),
    startNavigationDisabledReason: v2NavigationStartCheck.canStart
      ? navigationLocationCapability.message
      : v2NavigationStartCheck.message,
    isV2PreviewOnly: isV2Destination && !MapFeatureFlagsService.useIjtemaV2Navigation(),
  };
}
