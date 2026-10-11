import { messages, type MessageKey } from '../i18n/messages';
import type { TParams } from '../i18n/translate';
import { localizeVenueName } from '../i18n/venueNames';
import { PublicDestinationsService } from '../services/PublicDestinationsService';
import { useI18n } from '../i18n/useI18n';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
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
import { isJourneyStartable, selectJourneyPresentationState } from '../services/JourneyPresentationState';
import { MapFeatureFlagsService } from '../services/MapFeatureFlagsService';
import {
  V2DirectionsService,
  destinationFromPlace,
  type V2DirectionsPreviewResult,
} from '../services/V2DirectionsService';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { useManualLiveUpgrade } from './useManualLiveUpgrade';
import { startPreviewNavigationV2 } from './NavigationViewModelV2';
import type { RoutePreviewV2 } from '../services/RoutingServiceV2';
import { EntryGateRoutingService } from '../services/EntryGateRoutingService';
import { RoutePointService } from '../services/RoutePointService';
import { getRoutableOfficialGates } from '../data/ijtema/entryPolicy';
import { createProductionOutsideRouteSource } from '../services/outsideRouting/ProductionOutsideRouteSource';
import { OutsideRouteRequestCoordinator } from '../services/outsideRouting/OutsideRouteRequestCoordinator';
import { formatLastKnownAge } from '../utils/formatLastKnownAge';
import { CHOOSE_DESTINATION, NAVIGATION_UNAVAILABLE, ROUTE_NOT_FOUND } from '../utils/routeCopy';

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
  const { t, locale } = useI18n();
  const directoryRequestSerial = useAppStore(s => s.directoryRequestSerial);
  const locationCanAskAgain = useAppStore(s => s.locationPermissionCanAskAgain);
  const [locationAcquiring, setLocationAcquiring] = useState(false);
  const locationAcquiringRef = useRef(false);
  const [locationAttempted, setLocationAttempted] = useState(false);
  const currentLocation = useAppStore((s) => s.currentLocation);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const lastKnownLocationUpdatedAt = useAppStore((s) => s.lastKnownLocationUpdatedAt);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const setHasLocationPermission = useAppStore((s) => s.setHasLocationPermission);
  const locationPermissionPrecision = useAppStore((s) => s.locationPermissionPrecision);
  const locationServicesState = useAppStore((s) => s.locationServicesState);
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
  const [errorCopy, setErrorCopy] = useState<{ key: MessageKey; params?: TParams } | { text: string } | null>(null);
  // Service copy is a compatibility boundary; recognize only exact existing catalog entries.
  // Generated/parameterized errors use typed keys below, rather than storing translated snapshots.
  const setErrorMessage = useCallback((copy: string | { key: MessageKey; params?: TParams } | null) => {
    if (typeof copy !== 'string') { setErrorCopy(copy); return; }
    const key = (Object.keys(messages.en) as MessageKey[]).find(candidate =>
      Object.values(messages).some(table => table[candidate] === copy));
    setErrorCopy(key ? { key } : { text: copy });
  }, []);
  const errorMessage = errorCopy ? 'key' in errorCopy ? t(errorCopy.key, errorCopy.key === 'directions.usingAge' ? { age: formatLastKnownAge(lastKnownLocationUpdatedAt) } : errorCopy.params ? Object.fromEntries(Object.entries(errorCopy.params).map(([key, value]) => [key, typeof value === 'string' ? localizeVenueName(value, locale) : value])) : undefined) : errorCopy.text : null;
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
  const destinationIntentId = useAppStore((s) => s.destinationJourneyIntent?.id ?? null);
  const ownedDestinationIntentRef = useRef<number | null>(null);
  const retireAutomaticIntent = () => {
    const id = ownedDestinationIntentRef.current;
    if (id !== null) useAppStore.getState().retireDestinationIntent(id);
    ownedDestinationIntentRef.current = null;
  };
  const routeRef = useRef<RoutePreview | null>(null);
  // What the route on screen was calculated for. A failed recalculation may keep it only for the same trip.
  const routeTripKeyRef = useRef<string | null>(null);
  const journeyGenerationRef = useRef(0);
  const locationRequestRef = useRef(0);
  const routeRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const hypotheticalSelectionRef = useRef<{ generation: number; journeyId: number; intentId: number | null; destinationId: string } | null>(null);
  const renderGeneration = journeyGenerationRef.current;
  const renderJourneyId = useAppStore.getState().directoryJourneySerial;
  const renderIntentId = useAppStore.getState().destinationJourneyIntent?.id ?? null;
  const hypotheticalSelection = hypotheticalSelectionRef.current;
  const invalidateJourneyWork = () => {
    hypotheticalSelectionRef.current = null;
    retireAutomaticIntent();
    locationAcquiringRef.current = false;
    if (mountedRef.current) { setLocationAcquiring(false); setStartAttempt('idle'); }
    journeyGenerationRef.current += 1;
    locationRequestRef.current += 1;
    routeRequestRef.current += 1;
    outsideRequestCoordinatorRef.current.cancelCurrent();
  };
  const outsideRequestCoordinatorRef = useRef(new OutsideRouteRequestCoordinator());
  routeRef.current = route;
  const manualGateOptions = getRoutableOfficialGates().map((gate) => ({ gateId: gate.id, label: gate.name.en }));
  const isV2Destination = Boolean(destination && destinationFromPlace(destination));
  const isPlaceStart = startSource === 'manual_place' || startSource === 'hypothetical_place';
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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; invalidateJourneyWork(); };
  }, []);

  useLayoutEffect(() => {
    invalidateJourneyWork();
    setManualGateId(null);
    setManualStart(null);
    const state = useAppStore.getState();
    const intent = state.destinationJourneyIntent;
    ownedDestinationIntentRef.current = intent && intent.destinationId === destination?.id ? intent.id : null;
    const live = usableLiveFix(state.currentLocation, state.currentLocationSource);
    setRouteOriginLocation(live);
    setStartSource(live ? 'live_gps' : 'manual_place');
    setStartAttempt('idle');
    setLocationAttempted(false);
    setRoute(null);
    routeRef.current = null;
    routeTripKeyRef.current = null;
    setRoutePlannerOrigin(null);
    setRoutePlannerDest(destination);
    if (!state.isNavigating) { setActiveRoute(null); setRouteInstructions([]); }
  }, [destination?.id, destinationIntentId]);

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

  const startSourceLabel = startSource === 'hypothetical_place'
    ? t('block2.fromPreview') :
    startSource === 'live_gps'
      ? (currentLocation ? t('directions.current') : t('directions.chooseOrigin'))
      : startSource === 'device_last_known'
      ? t('directions.earlier')
      : startSource === 'remembered_location'
      ? t('directions.earlierAge', { age: rememberedLocationAgeLabel })
      : (manualStart ? localizeVenueName(manualStart.name, locale) : t('directions.chooseOrigin'));
  const startSourceSupportingCopy = startSource === 'hypothetical_place'
    ? t('block2.notice') :
    startSource === 'live_gps'
      ? t('directions.usingCurrent')
      : startSource === 'device_last_known'
      ? t('directions.usingEarlier')
      : startSource === 'remembered_location'
      ? t('directions.usingAge', { age: rememberedLocationAgeLabel })
      : manualStart
      ? t('directions.startingAt', { name: localizeVenueName(manualStart.name, locale) })
      : t('directions.whereStart');
  const isCurrentLocationStartActive = startSource === 'live_gps';

  // A planned/manual start only previews; live guidance needs a fresh precise fix. This turns that rule into
  // one enabled primary action so the user is never left on a dead Start button.
  const liveFix = currentLocationSource === 'live' ? currentLocation : null;
  const startAction = resolveStartAction({
    startSource,
    liveFix,
    permission: { granted: hasLocationPermission, precision: locationPermissionPrecision },
  });

  // The one authoritative journey state; the sheet renders from it and a start is offered only for a ready route.
  const liveReady = locationServicesState === 'enabled' && hasLocationPermission && currentLocationSource === 'live' && navigationLocationCapability.canStart && !routeRefreshing;
  const journeyState = selectJourneyPresentationState({ loadState, startSource, liveReady, route: route as Parameters<typeof selectJourneyPresentationState>[0]['route'] });
  const startable = isJourneyStartable(journeyState);

  const clearRoute = () => {
    retireAutomaticIntent();
    setRoute(null);
    setAlternatives([]);
    setInstructions([]);
    setRouteAlternatives([]);
  };

  const calculateRoute = useCallback(async () => {
    const generation = journeyGenerationRef.current;
    const request = ++routeRequestRef.current;
    const intentId = ownedDestinationIntentRef.current;
    const canCommit = () => mountedRef.current && generation === journeyGenerationRef.current && request === routeRequestRef.current &&
      !useAppStore.getState().isNavigating && (intentId === null || useAppStore.getState().destinationJourneyIntent?.id === intentId);
    outsideRequestCoordinatorRef.current.cancelCurrent();
    if (!destination) {
      setLoadState('error');
      setErrorMessage(CHOOSE_DESTINATION());
      return;
    }

    const originCoord = resolveActiveOriginCoordinate();
    if (!originCoord && !(isV2Destination && isPlaceStart && manualStart)) {
      retireAutomaticIntent();
      setLoadState('needs_origin');
      setErrorMessage(null); // the FROM row already says "Choose where to start"
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (isPlaceStart && manualStart && manualStart.id === destination.id) {
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
        startPlace: isPlaceStart && !forceOutside ? manualStart : null,
        destination,
        currentLocation: isPlaceStart && !forceOutside ? null : originCoord ?? null,
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
          message: ROUTE_NOT_FOUND(),
        };
      }
      if (!canCommit() || (requestHandle && !requestHandle.canCommit())) return;

      if (preview.status === 'disabled' || !MapFeatureFlagsService.useIjtemaV2Routing()) {
        setLoadState('error');
        setErrorMessage(NAVIGATION_UNAVAILABLE());
        setRouteRefreshing(false);
        if (previousRoute) setLoadState('ready');
        else clearRoute();
        requestHandle?.finish();
        return;
      }

      if (preview.status !== 'ready' || !preview.route) {
        // A failed recalculation keeps the route on screen only for the same trip; a different start's route never stays "ready".
        setLoadState('error');
        setErrorMessage(preview.messageDescriptor ?? (preview.message || ROUTE_NOT_FOUND()));
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
        label: t('directions.walkingRoute'),
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
      setRoutePlannerOrigin(isPlaceStart ? manualStart : null);
      setLoadState('ready');
      setRouteRefreshing(false);
      requestHandle?.finish();
      // Selection eligibility is captured at the tap, not when GPS later becomes available.
      // Consume before the command so rerenders, retries and native echoes cannot repeat it.
      const state = useAppStore.getState();
      if (intentId !== null && state.destinationJourneyIntent?.destinationId === destination.id &&
        startSource === 'live_gps' && !manualStart && canCommit() && state.consumeDestinationIntent(intentId)) {
        const result = startPreviewNavigationV2({ route: preview.route, destination, startPlace: null, currentLocation: state.currentLocation });
        if (!result.canStart) setStartAttempt('failed');
      }
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
      setErrorMessage({ key: 'directions.insideStart' });
      setRoute(null);
      setAlternatives([]);
      setInstructions([]);
      setRouteAlternatives([]);
      return;
    }

    if (startSource !== 'live_gps' && !RoutingService.isInsideVenue(originCoord)) {
      setLoadState('needs_origin');
      setErrorMessage({ key: 'directions.insideStart' });
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
        const startNodeIdOverride = isPlaceStart ? manualStart?.routingNodeId : undefined;
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
      if (!canCommit()) return;
      const best = alts[0]?.route ?? null;

      if (!best) {
        const destNodeIds = RoutingService.resolveDestinationNodesFromPlace(destination, originCoord);
        const startNodeIdOverride = isPlaceStart ? manualStart?.routingNodeId : undefined;
        const nodePlan = RoutingService.explainRouteNodeResolution(originCoord, destNodeIds, startNodeIdOverride);
        const sameOnly =
          nodePlan.startNodeIds.length > 0 &&
          nodePlan.targetNodeIds.length > 0 &&
          nodePlan.startNodeIds.every((startNodeId) => nodePlan.targetNodeIds.every((destNodeId) => destNodeId === startNodeId));

        setLoadState('error');
        setErrorMessage(
          sameOnly
            ? { key: 'directions.differentStart' }
            : ROUTE_NOT_FOUND(),
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
        setErrorMessage(ROUTE_NOT_FOUND());
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
      setRoutePlannerOrigin(isPlaceStart ? manualStart : null);
      setLoadState('ready');
    } catch (error) {
      if (!canCommit()) return;
      if ((error as Error).message === 'timeout') {
        setLoadState('error');
        setErrorMessage({ key: 'directions.calculationFailed' });
        return;
      }
      setLoadState('error');
      setErrorMessage(ROUTE_NOT_FOUND());
    }
  }, [destination, destinationIntentId, isV2Destination, startSource === 'remembered_location' ? lastKnownLocation : null, manualGateId, manualStart, routeOriginLocation?.latitude, routeOriginLocation?.longitude, setActiveRoute, setRouteAlternatives, setRouteInstructions, setSelectedRouteIndex, settings.walkingSpeed, startSource]);

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
    if (manualStart === start && startSource === 'manual_place') { setIsEditingManualStart(false); return; }
    invalidateJourneyWork();
    setRoutePlannerOrigin(start);
    setStartSource('manual_place');
    setManualStart(start);
    setIsEditingManualStart(false);
  };

  const previewBlock2 = (): boolean => {
    const state = useAppStore.getState();
    const block2 = PublicDestinationsService.getByCategory('blocks').find((place) => place.id === 'B2');
    if (!mountedRef.current || renderGeneration !== journeyGenerationRef.current || renderJourneyId !== state.directoryJourneySerial ||
      renderIntentId !== (state.destinationJourneyIntent?.id ?? null) || !destination || !isV2Destination || state.routePlannerDest?.id !== destination.id ||
      state.isNavigating || state.routeGuide || state.directoryPurpose || !block2 || block2.isStartRoutable === false) return false;
    invalidateJourneyWork();
    hypotheticalSelectionRef.current = { generation: journeyGenerationRef.current, journeyId: state.directoryJourneySerial,
      intentId: state.destinationJourneyIntent?.id ?? null, destinationId: destination.id };
    setManualStart(block2);
    setRoutePlannerOrigin(block2);
    setStartSource('hypothetical_place');
    setIsEditingManualStart(false);
    setErrorMessage(null);
    return true;
  };
  const confirmBlock2 = (): boolean => {
    const state = useAppStore.getState();
    if (!mountedRef.current || !hypotheticalSelection || hypotheticalSelectionRef.current !== hypotheticalSelection ||
      startSource !== 'hypothetical_place' || !manualStart || (!route && loadState !== 'same_place') ||
      state.isNavigating || state.directoryPurpose || hypotheticalSelection.generation !== journeyGenerationRef.current ||
      hypotheticalSelection.journeyId !== state.directoryJourneySerial || hypotheticalSelection.destinationId !== state.routePlannerDest?.id ||
      hypotheticalSelection.intentId !== (state.destinationJourneyIntent?.id ?? null)) return false;
    setManualStartPlace(manualStart);
    return true;
  };

  type ResolvedLocation = Awaited<ReturnType<typeof LocationAccessService.resolveCurrentLocation>>;
  const chooseCurrentLocationWith = async (resolve: () => Promise<ResolvedLocation>): Promise<boolean> => {
    const generation = journeyGenerationRef.current;
    const chooserSerial = useAppStore.getState().directoryRequestSerial;
    const intentId = useAppStore.getState().destinationJourneyIntent?.id ?? null;
    const request = ++locationRequestRef.current;
    const canCommit = () => mountedRef.current && generation === journeyGenerationRef.current && request === locationRequestRef.current &&
      !useAppStore.getState().directoryPurpose && useAppStore.getState().directoryRequestSerial === chooserSerial &&
      (useAppStore.getState().destinationJourneyIntent?.id ?? null) === intentId && useAppStore.getState().routePlannerDest?.id === destination?.id;
    try {
      const resolved = await resolve();
      if (!canCommit()) return false;
      setHasLocationPermission(resolved.permissionState.granted);
      setLocationPermissionPrecision(resolved.permissionState.precision);
      useAppStore.getState().setLocationPermissionFacts(resolved.permissionState);

      if (!resolved.ok || !resolved.coordinate) {
        // Recovery is presented in context; Settings is opened only by an explicit action.
        setErrorMessage(resolved.message ?? { key: 'directions.locationChoose' });
        if (!manualStart) { setRouteOriginLocation(null); setStartSource('manual_place'); setIsEditingManualStart(true); setLoadState('needs_origin'); }
        return false;
      }

      hypotheticalSelectionRef.current = null;
      setCurrentLocation(resolved.coordinate, resolved.source ?? 'live');
      setRouteOriginLocation(resolved.coordinate);
      if (!isV2Destination && !RoutingService.isInsideVenue(resolved.coordinate)) {
        setStartSource('manual_place');
        setIsEditingManualStart(true);
        setLoadState('needs_origin');
        setErrorMessage({ key: 'directions.insideStart' });
        return false;
      }

      setStartSource(resolved.source === 'device_last_known' ? 'device_last_known' : 'live_gps');
      setIsEditingManualStart(false);
      setManualStart(null);
      setErrorMessage(
        isV2Destination && !EntryGateRoutingService.isInsideIjtemaArea(resolved.coordinate)
          ? { key: 'directions.outsideGate' }
          : null,
      );
      return true;
    } catch {
      if (!canCommit()) return false;
      if (!manualStart) { setRouteOriginLocation(null); setStartSource('manual_place'); setIsEditingManualStart(true); setLoadState('needs_origin'); }
      setErrorMessage({ key: 'directions.locationChoose' });
      return false;
    }
  };
  const chooseCurrentLocation = async (): Promise<boolean> => {
    retireAutomaticIntent();
    locationAcquiringRef.current = true;
    setLocationAcquiring(true);
    setLocationAttempted(true);
    const request = locationRequestRef.current + 1;
    try { return await chooseCurrentLocationWith(() => LocationAccessService.resolveCurrentLocation(true)); }
    finally {
      if (request === locationRequestRef.current) { locationAcquiringRef.current = false; if (mountedRef.current) setLocationAcquiring(false); }
    }
  };

  const chooseRememberedLocation = (): boolean => {
    invalidateJourneyWork();
    if (!lastKnownLocation || (!isV2Destination && !RoutingService.isInsideVenue(lastKnownLocation))) {
      setStartSource('manual_place');
      setIsEditingManualStart(true);
      setLoadState('needs_origin');
      setErrorMessage({ key: 'directions.noSaved' });
      return false;
    }

    setCurrentLocation(lastKnownLocation, 'remembered');
    setStartSource('remembered_location');
    setIsEditingManualStart(false);
    setManualStart(null);
    setErrorMessage(
      isInsideVenueForDestination(lastKnownLocation)
        ? { key: 'directions.usingAge', params: { age: formatLastKnownAge(lastKnownLocationUpdatedAt) } }
        : { key: 'directions.outsideGate' },
    );
    return true;
  };

  const chooseManualStart = () => {
    retireAutomaticIntent();
    // Opening a chooser cancels acquisition but preserves the current route until a new origin is selected.
    locationAcquiringRef.current = false;
    setLocationAcquiring(false);
    setStartAttempt('idle');
    locationRequestRef.current += 1;
    setIsEditingManualStart(true);
    setErrorMessage(null);
  };

  const selectManualGate = (gateId: string) => {
    if (manualGateId === gateId || !manualGateOptions.some((gate) => gate.gateId === gateId)) return;
    manualLiveUpgrade.cancelLiveUpgrade();
    invalidateJourneyWork();
    setManualGateId(gateId);
  };

  const clearManualGateSelection = () => { if (manualGateId === null) return; manualLiveUpgrade.cancelLiveUpgrade(); invalidateJourneyWork(); setManualGateId(null); };

  const manualLiveUpgrade = useManualLiveUpgrade(destination, route, manualStart, manualGateId);

  const recoveryCapability = evaluateLocationCapability({
    permission: { granted: hasLocationPermission, precision: locationPermissionPrecision, canAskAgain: locationCanAskAgain, servicesState: locationServicesState },
    liveFix: currentLocationSource === 'live' ? currentLocation : null,
  });
  const recoveryKind = recoveryCapability.liveBlocker === 'permission_blocked' ? 'app_settings'
    : recoveryCapability.liveBlocker === 'approximate_only' ? 'precise_location'
    : recoveryCapability.liveBlocker === 'services_off' ? 'location_settings' : 'use_location';
  const locationRecoveryAction = { kind: recoveryKind, label: recoveryKind === 'app_settings' ? t('recovery.settings')
    : recoveryKind === 'precise_location' ? t('recovery.precise')
    : recoveryKind === 'location_settings' ? t('recovery.services') : t(locationAttempted || startAttempt === 'failed' || startAttempt === 'settings' || startAttempt === 'services_off' ? 'recovery.tryAgain' : 'recovery.useLocation') };
  const cancelLocationRecovery = () => {
    locationRequestRef.current += 1;
    locationAcquiringRef.current = false;
    setLocationAcquiring(false);
    setStartAttempt('idle');
  };
  useLayoutEffect(() => {
    locationRequestRef.current += 1;
    locationAcquiringRef.current = false;
    setLocationAcquiring(false);
    setStartAttempt('idle');
  }, [directoryRequestSerial]);
  const runLocationRecovery = async () => {
    if (locationAcquiringRef.current) return;
    if (recoveryKind !== 'use_location') {
      const generation = journeyGenerationRef.current;
      const serial = useAppStore.getState().directoryRequestSerial;
      const opened = recoveryKind === 'location_settings' ? await LocationAccessService.openLocationSettings() : await LocationAccessService.openAppSettings();
      if (!opened && mountedRef.current && generation === journeyGenerationRef.current && serial === useAppStore.getState().directoryRequestSerial) setErrorMessage(t('recovery.settingsFailed'));
      return;
    }
    if (useAppStore.getState().routeGuide) {
      if (manualLiveUpgrade.upgrade.phase === 'failed') await manualLiveUpgrade.confirmLiveUpgrade();
      else manualLiveUpgrade.requestLiveUpgrade();
      return;
    }
    await chooseCurrentLocation();
  };

  /** Acquisition replaces the origin and previews the new route. Only another explicit Start may activate it. */
  const runStartAction = async (startNow: () => void) => {
    retireAutomaticIntent();
    const state = useAppStore.getState();
    if (state.routeGuide && manualStart) { manualLiveUpgrade.requestLiveUpgrade(); return; }
    if (startAction.kind === 'start') {
      const capability = evaluateLocationCapability({
        permission: { granted: state.hasLocationPermission, canAskAgain: false, precision: state.locationPermissionPrecision, servicesState: state.locationServicesState },
        liveFix: state.currentLocationSource === 'live' ? state.currentLocation : null,
      });
      if (capability.mode === 'live_navigation' && !manualStart && state.routePlannerDest?.id === destination?.id && state.activeRoute === route && !routeRefreshing) startNow();
      else setStartAttempt('failed');
      return;
    }
    const generation = journeyGenerationRef.current;
    const chooserSerial = useAppStore.getState().directoryRequestSerial;
    const intentId = useAppStore.getState().destinationJourneyIntent?.id ?? null;
    const request = ++locationRequestRef.current;
    const canCommit = () => mountedRef.current && generation === journeyGenerationRef.current && request === locationRequestRef.current &&
      !useAppStore.getState().directoryPurpose && useAppStore.getState().directoryRequestSerial === chooserSerial &&
      (useAppStore.getState().destinationJourneyIntent?.id ?? null) === intentId && useAppStore.getState().routePlannerDest?.id === destination?.id;
    setStartAttempt('working');
    try {
      const resolved = await LocationAccessService.resolveCurrentLocation(true);
      if (!canCommit()) return;
      setHasLocationPermission(resolved.permissionState.granted);
      setLocationPermissionPrecision(resolved.permissionState.precision);
      useAppStore.getState().setLocationPermissionFacts(resolved.permissionState);
      const capability = evaluateLocationCapability({ permission: resolved.permissionState, liveFix: resolved.source === 'live' ? resolved.coordinate : null });
      if (capability.liveBlocker === 'permission_blocked' || capability.liveBlocker === 'approximate_only' || capability.liveBlocker === 'precision_unknown') { setStartAttempt('settings'); return; }
      if (capability.liveBlocker === 'services_off') { setStartAttempt('services_off'); return; }
      if (!resolved.ok || capability.mode !== 'live_navigation') { setStartAttempt('failed'); return; }
      await chooseCurrentLocationWith(async () => resolved);
      if (mountedRef.current && generation === journeyGenerationRef.current) setStartAttempt('idle');
    } catch {
      if (canCommit()) setStartAttempt('failed');
    }
  };

  // Route guide (#307): follow the chosen FROM -> TO by reading steps. No session, no live position, no marker.
  // Steps come from the same adapter live navigation uses, so a later upgrade to live guidance reads the same text.
  const routeGuideRouteRef = useRef<RoutePreview | null>(null);
  const routeGuideActive = useAppStore((s) => s.routeGuide !== null);
  const startRouteGuide = () => {
    const state = useAppStore.getState();
    if (!mountedRef.current || renderGeneration !== journeyGenerationRef.current || hypotheticalSelectionRef.current ||
      startSource === 'hypothetical_place' || !startable || !destination || !route || state.directoryPurpose ||
      state.activeRoute !== route || state.routePlannerDest?.id !== destination.id) return;
    let steps: import('../store/useAppStore').RouteGuideStep[];
    try {
      steps = V2NavigationAdapter.fromPreview({
        previewRoute: route as unknown as RoutePreviewV2,
        destination,
        startPlace: manualStart,
        currentLocation: null,
      }).instructions.map((step) => ({ text: step.text, semantic: step.semantic, distanceM: step.distanceM }));
    } catch {
      steps = instructions.map((step) => ({ text: step.text, semantic: step.semantic, distanceM: step.distance }));
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
    ...manualLiveUpgrade,
    locationRecoveryAction, locationAcquiring, runLocationRecovery, cancelLocationRecovery,
    previewBlock2, confirmBlock2,
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
