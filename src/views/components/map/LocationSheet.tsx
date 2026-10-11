/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageKey } from '../../../i18n/messages';
import { useI18n } from '../../../i18n/useI18n';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Share,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Star,
  Share2,
  X,
} from 'lucide-react-native';

import { useDirectionsViewModel, type StartSource } from '../../../viewmodels/DirectionsViewModel';
import { useReducedMotion } from '../../../viewmodels/useReducedMotion';
import {
  isJourneyStartable,
  outsideGuideSummary,
  selectJourneyPresentationState,
} from '../../../services/JourneyPresentationState';
import { InstructionService } from '../../../services/InstructionService';
import { destinationFromPlace } from '../../../services/V2DirectionsService';
import { V2PlaceAdapter } from '../../../services/V2PlaceAdapter';
import { useAppStore, type DirectoryPurpose } from '../../../store/useAppStore';
import { Place, RoutePreview, BlockEntryPoint, Gate } from '../../../models/types';
import { IJTEMA_DATA } from '../../../constants/data';
import { AppTheme } from '../../../services/ThemeService';
import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { backChevron, forwardChevron } from '../common/directionalIcons';
import { directionsSheetColors, radii, staticColors } from '../../../theme';
import { placeCategoryLabel } from '../../../utils/placeCategoryLabel';
import { buildPlaceShareMessage } from '../../../utils/placeShare';
import { unavailableReasonCopy } from '../../../utils/unavailableReasonCopy';
import { OUTSIDE_GUIDE_SCOPE, ROUTE_NOT_FOUND, SAME_PLACE, outsideGuideHeadline } from '../../../utils/routeCopy';
import { DirectionsHeader, RouteEndpointRows } from './DirectionsSheetParts';
import { publishDirectionsFooter, useDirectionsFooterHeight } from './DirectionsSheetFooter';
import { OutsideRouteStatusCard } from '../navigation/OutsideRouteStatusCard';
import type { NormalizedOutsideCandidate } from '../../../models/outsideRouting';
import { liveBlockerMessage } from '../../../services/LocationCapability';
import { ManualLiveUpgradeCard } from './ManualLiveUpgradeCard';
import { RouteGuideCard } from './RouteGuideCard';
import { publishDirectionsPeek } from './DirectionsPeekHandle';

declare const __DEV__: boolean;

/** Facility sub-type text for the Masjid/Landmark categories — mirrors the exact same
 * id-prefix signal FacilityLayer.tsx already uses to pick an icon (LM_FOOD_*, LM_WATER_*,
 * ...), just spelled out as a label instead of an icon. Not fabricated: same source data,
 * same categorization already relied on elsewhere. */
function facilityTypeKey(place: Place): MessageKey | null {
  if (place.category === 'Masjid') return 'place.masjid';
  if (place.category !== 'Landmark') return null;
  if (place.id.startsWith('LM_FOOD')) return 'place.food';
  if (place.id.startsWith('LM_WATER')) return 'place.water';
  if (place.id.startsWith('LM_MEDICAL')) return 'place.medical';
  if (place.id.startsWith('LM_PARKING')) return 'place.parking';
  if (place.id.startsWith('LM_BUS')) return 'place.bus';
  if (place.id.startsWith('LM_LOST_FOUND')) return 'place.lostFound';
  if (place.id.startsWith('LM_VOLUNTEER')) return 'place.volunteer';
  return 'place.landmark';
}

type RoutePreviewWithV2Meta = RoutePreview & {
  outsideRoute?: NormalizedOutsideCandidate;
  startResolution?: {
    startType?: 'internal_snap' | 'nearest_official_gate' | 'selected_official_gate' | 'unresolved';
    gate?: {
      name?: {
        en?: string;
      };
    };
  };
  startLabel?: string;
  destinationLabel?: string;
};

/**
 * The single sheet HomeMapScreen renders over the map, in one of three modes — never a
 * separate navigation-stack screen (Google Maps doesn't work that way). `routePreview`
 * is what used to be the standalone DirectionsScreen; `preview`/`details` used to be
 * inline JSX in HomeScreen keyed off `selectedPlace` directly.
 */
export type LocationSheetProps =
  | {
      mode: 'routePreview';
      destination: Place;
      /** Both v1 and v2 destinations reveal the map on start — navigation itself always runs
       * in-place on HomeScreen's persistent map surface (NavigationOverlayV1/V2), never a pushed
       * screen. */
      onClose: () => void;
      /** v2 destinations start navigation via this (built from the resolved preview route in
       * HomeScreen) instead of the viewmodel's own handleStartNavigation — the sheet is the
       * single route-preview surface, there is no separate floating "Start Navigation" card. */
      onStartNavigation?: () => void;
      /** Renders a "Cancel Route" link when provided — lets the user back out of route preview
       * without picking a different start point. Omitted (e.g. from search's preview state)
       * where there's nothing to cancel yet. */
      onCancelRoute?: () => void;
      /** Swaps in a newly picked destination in place (mirrors "Change Start" below, which
       * already does this for the start side) instead of "Change destination" exiting the
       * sheet entirely. Route recalculation and camera follow both happen as a side effect of
       * the caller replacing its destination state — see HomeScreen.handleChangeDestination —
       * not anything this component does directly. Omitted falls back to the old onClose
       * behavior for callers that haven't wired it up. */
      onChangeDestination?: (place: Place) => void;
      /** "View route": tucks the sheet down so the whole route is visible on the map. */
      onViewRoute?: () => void;
      onRouteGuideStarted?: () => void;
      sheetCollapsed?: boolean;
      onToggleSheet?: () => void;
      /** Opens the Directory, the one place chooser, to pick a start (or destination); the choice comes
       * back through the store's directoryChoice. */
      onOpenDirectory?: (purpose: DirectoryPurpose) => void;
      /** Legacy flag (the basemap now ships with the app, so Home always passes false). Display-only. */
    }
  | {
      mode: 'preview' | 'details';
      place: Place;
      theme: AppTheme;
      entryPoints: BlockEntryPoint[];
      blockGates: Gate[];
      selectedEntryIdx: number;
      onSelectEntryIdx: (idx: number) => void;
      walkingTimeMin: number | null;
      isFav: boolean;
      onToggleFavorite: () => void;
      onSelectGate: (gate: Gate) => void;
      onOpenDirections: () => void;
      onClose: () => void;
      onShowDetails: () => void;
      onCloseDetails: () => void;
      developerModeEnabled: boolean;
    };

export function LocationSheet(props: LocationSheetProps) {
  if (props.mode === 'routePreview') {
    return (
      <RoutePreviewSection
        destination={props.destination}
        onClose={props.onClose}
        onStartNavigation={props.onStartNavigation}
        onViewRoute={props.onViewRoute}
        onRouteGuideStarted={props.onRouteGuideStarted}
        sheetCollapsed={props.sheetCollapsed}
        onToggleSheet={props.onToggleSheet}
        onCancelRoute={props.onCancelRoute}
        onChangeDestination={props.onChangeDestination}
        onOpenDirectory={props.onOpenDirectory}
      />
    );
  }
  return <PlaceSection {...props} />;
}

/** Cross-fades its children whenever `transitionKey` changes, instead of the content
 * snapping straight to its new state. Plain RN Animated (not LayoutAnimation) so it
 * can't interfere with BottomSheetModal's own reanimated gesture/layout handling. */
function FadeContent({ transitionKey, children }: { transitionKey: string; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: NAV_TRANSITION_TIMINGS.sheetContentFadeMs,
      useNativeDriver: true,
    }).start();
  }, [transitionKey, opacity, reducedMotion]);
  // With reduced motion the content is simply opaque. The first render cannot know that yet (the OS setting is read
  // asynchronously), so a fade has already been handed to the native driver; stopping it and jumping the value raced
  // with it on Android and left the Directions rows at ~15% opacity with animations off (EMULATOR).
  return <Animated.View style={reducedMotion ? undefined : { opacity }}>{children}</Animated.View>;
}

/** Hint under the start name; a resolved start needs none (its name already says it). */
function startSourceHelper(source: StartSource, unresolved: boolean, t: ReturnType<typeof useI18n>['t']): string | undefined {
  if (unresolved) return undefined; // the row's own name ("Choose where to start") already asks
  return source === 'device_last_known' || source === 'remembered_location' ? t('directions.savedEarlier') : undefined;
}

function RoutePreviewSection({
  destination,
  onClose,
  onStartNavigation,
  onCancelRoute,
  onChangeDestination,
  onOpenDirectory,
  onViewRoute,
  onRouteGuideStarted,
  sheetCollapsed,
  onToggleSheet,
}: {
  destination: Place;
  onClose: () => void;
  onStartNavigation?: () => void;
  onViewRoute?: () => void;
  /** Called once the route guide opens so the map can frame the whole route. */
  onRouteGuideStarted?: () => void;
  /** Whether the sheet is at its lowest detent, and a way to fold/expand it from the peek handle. */
  sheetCollapsed?: boolean;
  onToggleSheet?: () => void;
  onCancelRoute?: () => void;
  onChangeDestination?: (place: Place) => void;
  onOpenDirectory?: (purpose: DirectoryPurpose) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const footerHeight = useDirectionsFooterHeight();
  const insets = useSafeAreaInsets();
  const ChevronEnd = forwardChevron();
  const currentLocation = useAppStore((s) => s.currentLocation);
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);

  const [showGateOptions, setShowGateOptions] = useState(false);
  // Guards Retry against a same-tick double-tap: loadState only reflects the in-flight
  // request after DirectionsViewModel's state update commits and this component
  // re-renders, so a second tap landing before that commit would otherwise still see
  // the stale loadState==='error' and re-invoke calculateRoute concurrently.
  const retryInFlightRef = useRef(false);

  const { t, dir } = useI18n();
  const {
    route,
    startSource,
    startSourceLabel,
    startSourceSupportingCopy,
    currentRouteOriginInsideVenue,
    isOutsideStart,
    loadState,
    errorMessage,
    manualStart,
    setManualStartPlace,
    chooseCurrentLocation,
    chooseRememberedLocation,
    calculateRoute,
    retryOutsideRoute,
    manualGateId,
    manualGateOptions,
    selectManualGate,
    clearManualGateSelection,
    routeRefreshing,
    handleStartNavigation,
    canStartNavigation,
    startNavigationDisabledReason,
    startAction,
    startAttempt,
    runStartAction,
    startRouteGuide,
    upgrade, confirmLiveUpgrade, cancelLiveUpgrade, startUpgradedNavigation,
    locationRecoveryAction, locationAcquiring, runLocationRecovery, cancelLocationRecovery,
    previewBlock2, confirmBlock2,
  } = useDirectionsViewModel(destination);
  const routeGuide = useAppStore((s) => s.routeGuide);
  // Home can start a preview only once BOTH the route and its destination are in the store (its start handler returns
  // silently otherwise); the view-model's own `ready` can be a render ahead of that (runtime race on the emulator).
  const setRouteGuideStep = useAppStore((s) => s.setRouteGuideStep);
  const endRouteGuide = useAppStore((s) => s.endRouteGuide);
  const isRouteGuideStart = startAction?.kind === 'route_guide';
  const readyRecovery = !isRouteGuideStart && locationRecoveryAction && (locationRecoveryAction.kind !== 'use_location' || !startAction);

  // The Directory is the only start chooser: Change Start always opens it in start mode. Current / last-known
  // are quick options there; it returns them through the store and the VM applies them like a picked place.
  const handleChangeStart = () => onOpenDirectory?.('start');
  const directoryChoice = useAppStore((s) => s.directoryChoice);
  useEffect(() => {
    if (directoryChoice?.purpose !== 'start') return;
    if (!useAppStore.getState().consumeDirectoryChoice(directoryChoice, destination.id)) return;
    if (!('quick' in directoryChoice)) setManualStartPlace(directoryChoice.place);
    else if (directoryChoice.quick === 'current_location') void chooseCurrentLocation();
    else chooseRememberedLocation();
  }, [chooseCurrentLocation, chooseRememberedLocation, directoryChoice, destination.id, setManualStartPlace]);
  // Same hand-off for "Change destination": the caller swaps its destination, which recalculates the route.
  useEffect(() => {
    if (directoryChoice?.purpose !== 'destination' || !('place' in directoryChoice)) return;
    if (!useAppStore.getState().consumeDirectoryChoice(directoryChoice, destination.id)) return;
    onChangeDestination?.(directoryChoice.place);
  }, [directoryChoice, destination.id, onChangeDestination]);
  // Journey cancellation/replacement invalidates replies in the store. An outgoing sheet
  // must not clear a newer sheet’s pending choice during unmount.
  const startIcon =
    startSource === 'remembered_location' || startSource === 'device_last_known' ? (
      <MapPin size={24} color={directionsSheetColors.brand} />
    ) : (startSource === 'manual_place' || startSource === 'hypothetical_place') ? (
      <Navigation size={24} color={directionsSheetColors.brand} />
    ) : (
      <LocateFixed size={24} color={directionsSheetColors.brand} />
    );

  const outsideStart = isOutsideStart;
  const routeMeta = route as RoutePreviewWithV2Meta | null;
  const outsideRoute = routeMeta?.outsideRoute;
  // Everything below renders from the one journey state, never from coordinates, distances or provider names.
  const journeyState = selectJourneyPresentationState({ loadState, startSource, liveReady: canStartNavigation, route: routeMeta });
  const outsideGuide = outsideGuideSummary(routeMeta as Parameters<typeof outsideGuideSummary>[0]);
  const entryGateName = routeMeta?.startResolution?.gate?.name?.en ?? null;
  const routeDistance = route ? InstructionService.formatDistance(route.totalDistance, distanceUnit) : null;
  const routeEta = route ? InstructionService.formatDuration(route.estimatedTimeMin) : null;
  const routeStatusMessage = outsideStart
    ? `${startSourceSupportingCopy} ${t('directions.gateFirst')}`
    : startSourceSupportingCopy;

  // Only what the FROM/TO rows don't already say: which gate the route enters through, or that the start was snapped.
  const routeEntrySummary = journeyState === 'OUTSIDE_VENUE_GUIDE'
    ? null // the headline already says which gate
    : entryGateName
    ? t('directions.enterGate', { gate: entryGateName })
    : routeMeta?.startResolution?.startType === 'internal_snap'
    ? t('directions.closestPath')
    : null;

  const showRouteReady = isJourneyStartable(journeyState) || (journeyState === 'NEEDS_START' && loadState === 'ready' && !!route);
  const showPreviewRoute = showRouteReady || journeyState === 'HYPOTHETICAL_PREVIEW';
  const showLoading = loadState === 'loading';
  const showError = journeyState === 'ROUTE_FAILURE';
  const showSamePlace = journeyState === 'SAME_PLACE';
  const showNeedsStart = journeyState === 'NEEDS_START' && !showRouteReady;
  const hypotheticalPreview = startSource === 'hypothetical_place';
  const hypotheticalReady = hypotheticalPreview && (journeyState === 'HYPOTHETICAL_PREVIEW' || showSamePlace);
  const destinationCannotBeRouted =
    destination.isRoutable === false ||
    (destination.routingStatus !== undefined && destination.routingStatus !== 'routable');
  // Only what the FROM row can't say: an outside start, or a saved (not live) start. "Start ready" said nothing new.
  const savedStart = startSource === 'remembered_location' || startSource === 'device_last_known';
  const showStartHint = !showLoading && !showError && !showSamePlace && !showRouteReady && (outsideStart || savedStart);
  const retryRoute = () => {
    if (retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    void calculateRoute().finally(() => {
      retryInFlightRef.current = false;
    });
  };

  // calculateRoute (DirectionsViewModel.ts:438-440) fires automatically on mount and on
  // every start/destination change — a screen-reader user gets no spoken signal a route
  // just appeared or failed unless we announce the transition ourselves. Same one-shot
  // pattern as LocationTutorialTooltip's location announcement and NavigationChromeV2's
  // arrival announcement (#64), keyed on loadState so it fires once per resolved
  // calculation, not on every re-render while the state holds steady.
  useEffect(() => {
    if (isJourneyStartable(journeyState) && route) {
      AccessibilityInfo.announceForAccessibility(
        directGuide
          ? `${outsideGuideHeadline(guideGateName ?? t('directions.gate'))}. ${OUTSIDE_GUIDE_SCOPE}`
          : [t('directions.ready'), routeEntrySummary, routeDistance].filter(Boolean).join('. ') + '.',
      );
    } else if (loadState === 'error' && errorMessage) {
      AccessibilityInfo.announceForAccessibility(errorMessage);
    } else if (loadState === 'same_place') {
      AccessibilityInfo.announceForAccessibility(SAME_PLACE);
    }
  }, [loadState]);

  const directGuide = journeyState === 'OUTSIDE_VENUE_GUIDE';
  // Past ~150% font the pinned footer would eat the sheet: it keeps only the action (and its
  // disabled reason) and the summary/caption scroll with the content instead.
  const compactFooter = fontScale >= 1.5;

  // One TalkBack stop ("Route ready, 13 min, 1.1 km") instead of three that Android sorts apart.
  const guideGateName = outsideGuide
    ? entryGateName ?? V2PlaceAdapter.getPlaceById(outsideGuide.gateId)?.name ?? outsideGuide.gateId.replace('GATE_', 'Gate ')
    : null;
  const guideDistance = outsideGuide ? t('directions.straightDistance', { distance: InstructionService.formatDistance(outsideGuide.straightLineDistanceM, distanceUnit) }) : null;
  const readyHeadline = directGuide
    ? outsideGuideHeadline(guideGateName ?? t('directions.gate'))
    : startAction?.kind === 'start' ? t('directions.readyToGo') : t('directions.ready');
  const routeSummaryLabel = directGuide
    ? `${readyHeadline}, ${guideDistance}. ${OUTSIDE_GUIDE_SCOPE}`
    : [
        readyHeadline,
        outsideRoute?.durationSeconds !== null ? routeEta : null,
        routeDistance,
      ].filter(Boolean).join(', ');
  const routeSummary = showPreviewRoute ? (
    <View style={styles.summary} accessible accessibilityLabel={routeSummaryLabel}>
      <Text style={styles.summaryLabel}>{readyHeadline}</Text>
      {directGuide ? (
        <>
          <Text style={styles.routeHeroDistance}>{guideDistance}</Text>
          <Text style={styles.statusText}>{OUTSIDE_GUIDE_SCOPE}</Text>
        </>
      ) : (
        <View style={styles.routeHeroRow}>
          {outsideRoute?.durationSeconds !== null && (
            <Text style={styles.routeHeroDuration}>{routeEta}</Text>
          )}
          <Text style={styles.routeHeroDistance}>{routeDistance}</Text>
        </View>
      )}
    </View>
  ) : null;
  // At large text the pinned footer keeps only the primary action: this link scrolls with the body instead (#326).
  const secondaryLink = startAction?.secondaryLabel ? (
    <Pressable
      style={styles.linkButton}
      onPress={isRouteGuideStart ? () => void runStartAction(() => startNowRef.current()) : onViewRoute}
      disabled={isRouteGuideStart && startAttempt === 'working'}
      accessibilityRole="button"
      accessibilityLabel={startAction.secondaryLabel}
    >
      <Text style={styles.linkButtonText}>
        {isRouteGuideStart && startAttempt === 'working' ? t('recovery.acquiring') : startAction.secondaryLabel}
      </Text>
    </Pressable>
  ) : null;
  const footerVisible = (showLoading || showError || showSamePlace || showNeedsStart || showRouteReady || hypotheticalReady) && !(showRouteReady && routeGuide);
  // The caption scrolls with the content: the pinned footer only has room for the route summary,
  // the action and its disabled reason (gorhom's visible area at the 50% snap is small).

  const startNow = () => {
    if (destinationFromPlace(destination)) {
      // Built from the resolved preview route already sitting in the store (see
      // HomeScreen.handleStartPreviewNavigation) — starts NavigationOverlayV2 in place, then reveals the map.
      onStartNavigation?.();
    } else {
      // v1: starts the in-place NavigationOverlayV1 via the store; no screen navigation either way.
      handleStartNavigation();
    }
    // Home replaces setup only after the store confirms actual navigation. A rejected
    // activation leaves the route and recovery controls visible.
  };
  // A start that waits for a recomputed route must run the handler of the render that holds that route.
  const startNowRef = useRef(startNow);
  startNowRef.current = startNow;

  const footerNode = footerVisible ? (
    <>
            {showLoading && (
              <View accessibilityLiveRegion="polite" style={styles.footerStatus}>
                <View style={styles.statusRow}>
                  <RefreshCw size={18} color={directionsSheetColors.brand} />
                  <Text style={styles.statusTitle}>{t('directions.findingRoute')}</Text>
                </View>
                <Text style={styles.statusText}>{routeStatusMessage}</Text>
              </View>
            )}

            {showError &&
              (destinationCannotBeRouted ? (
                // Retrying re-runs the same failed lookup: an unverified/unconnected
                // destination stays unroutable until its data is verified. Offer a
                // change of destination instead (no route is invented).
                <Button
                  variant="brandTint"
                  label={t('directions.anotherDestination')}
                  onPress={onChangeDestination && onOpenDirectory ? () => onOpenDirectory('destination') : onClose}
                />
              ) : (
                <>
                  <Button
                    variant="brand"
                    icon={<RefreshCw size={18} color={directionsSheetColors.brandText} />}
                    label={t('directions.tryAgain')}
                    onPress={retryRoute}
                  />
                  <Button variant="outline" label={t('directions.changeStart')} onPress={handleChangeStart} />
                </>
              ))}

            {showNeedsStart && <>
              <Button variant="brand" label={t('directions.chooseStart')} onPress={handleChangeStart} />
              {locationRecoveryAction && <Button variant="outline" label={locationAcquiring ? t('recovery.acquiring') : locationRecoveryAction.label}
                disabled={locationAcquiring} onPress={() => void runLocationRecovery()} />}
              {locationAcquiring && <Button variant="outline" label={t('recovery.cancel')} onPress={cancelLocationRecovery} />}
              <Button variant="outline" label={t('block2.preview')} onPress={previewBlock2} disabled={locationAcquiring} />
            </>}

            {hypotheticalReady && <>
              {!compactFooter && routeSummary}
              <Button variant="brand" label={t('block2.confirm')} onPress={confirmBlock2} />
              <Button variant="outline" label={t('block2.change')} onPress={handleChangeStart} />
              {locationRecoveryAction && <Button variant="outline" label={locationAcquiring ? t('recovery.acquiring') : locationRecoveryAction.label}
                disabled={locationAcquiring} onPress={() => void runLocationRecovery()} />}
              {locationAcquiring && <Button variant="outline" label={t('recovery.cancel')} onPress={cancelLocationRecovery} />}
            </>}

            {showSamePlace && (
              <Button
                variant="brand"
                label={t('directions.anotherPlace')}
                onPress={onChangeDestination && onOpenDirectory ? () => onOpenDirectory('destination') : onClose}
              />
            )}

            {showRouteReady && !routeGuide && (
              <>
                {!compactFooter && routeSummary}
                <Button
                  variant="brand"
                  style={styles.cta}
                  label={
                    (startAttempt === 'working' || locationAcquiring) && !isRouteGuideStart
                      ? t('recovery.acquiring')
                      : readyRecovery
                      ? locationRecoveryAction.label
                      : startAction && startAction.kind !== 'start'
                      ? startAction.primaryLabel
                      : directGuide
                      ? t('directions.startWalking')
                      : t('directions.startNavigation')
                  }
                  accessibilityLabel={
                    !startAction && !canStartNavigation && startNavigationDisabledReason
                      ? `${directGuide ? t('directions.startWalking') : t('directions.startNavigation')}. ${startNavigationDisabledReason}`
                      : undefined
                  }
                  icon={
                    startAction && startAction.kind !== 'start' && !isRouteGuideStart ? (
                      <LocateFixed size={20} color={directionsSheetColors.brandText} />
                    ) : (
                      <Navigation size={20} color={directionsSheetColors.brandText} />
                    )
                  }
                  trailingIcon={<ChevronEnd size={20} color={directionsSheetColors.brandText} />}
                  disabled={((startAttempt === 'working' || locationAcquiring) && !isRouteGuideStart) || (!readyRecovery && !startAction && !canStartNavigation)}
                  onPress={() => {
                    if (isRouteGuideStart) {
                      startRouteGuide();
                      onRouteGuideStarted?.();
                    } else if (readyRecovery) void runLocationRecovery();
                    else if (startAction) void runStartAction(() => startNowRef.current());
                    else startNow();
                  }}
                />
                {!compactFooter && secondaryLink}
                {!isRouteGuideStart && !readyRecovery && locationRecoveryAction && startAttempt === 'failed' && !locationAcquiring &&
                  <Button variant="outline" label={locationRecoveryAction.label} onPress={() => void runLocationRecovery()} />}
                {!isRouteGuideStart && (startAttempt === 'working' || locationAcquiring) && cancelLocationRecovery &&
                  <Button variant="outline" label={t('recovery.cancel')} onPress={cancelLocationRecovery} />}
                {startAttempt === 'failed' || startAttempt === 'settings' || startAttempt === 'services_off' ? (
                  <Text accessibilityLiveRegion="polite" style={styles.footerReason}>
                    {startAttempt === 'settings'
                      ? t('directions.allowSettings')
                      : startAttempt === 'services_off'
                      ? liveBlockerMessage('services_off')
                      : t('directions.locationFailed')}
                  </Text>
                ) : null}
                {!startAction && !canStartNavigation && startNavigationDisabledReason ? (
                  <Text style={styles.footerReason}>{startNavigationDisabledReason}</Text>
                ) : null}
              </>
            )}
    </>
  ) : null;
  // Published to the modal's footer slot (see DirectionsSheetFooter) so it stays pinned to the
  // visible bottom of the sheet at every snap point.
  useEffect(() => {
    publishDirectionsFooter(footerNode);
  });
  useEffect(() => () => publishDirectionsFooter(null), []);
  // The collapsed sheet's peek (#307): where the journey stands, so a folded sheet never goes silent.
  const guideStep = routeGuide?.steps[routeGuide.stepIndex];
  const peekText = guideStep
    ? `${t('directions.nextStep', { step: guideStep.text })}${guideStep.distanceM > 0 ? ` · ${InstructionService.formatDistance(guideStep.distanceM, distanceUnit)}` : ''}`
    : directGuide
    ? outsideGuideHeadline(guideGateName ?? t('directions.gate')) // never the walking-looking total
    : showPreviewRoute
    ? [outsideRoute?.durationSeconds !== null ? routeEta : null, routeDistance].filter(Boolean).join(' · ')
    : showLoading
    ? t('directions.findingRoute')
    : t('directions.peek', { from: startSourceLabel, to: destination.name });
  useEffect(() => {
    publishDirectionsPeek({ text: peekText, collapsed: sheetCollapsed ?? false, onToggle: onToggleSheet });
  }, [peekText, sheetCollapsed, onToggleSheet]);
  useEffect(() => () => publishDirectionsPeek(null), []);

  const directionsHeader = (
    <DirectionsHeader
      title={routeGuide ? t('directions.guideTitle') : t('directions.title')}
      subtitle={routeGuide ? t('directions.guideNotice') : t('directions.subtitle')}
      onBack={onClose}
    />
  );

  return (
    // collapsable={false} keeps the body a native view and importantForAccessibility marks it as one node, so
    // TalkBack reads it as a block before the pinned footer instead of interleaving their rows (#128 B;
    // observed on API 36 TalkBack, not a platform guarantee).
    <View
      testID="directions-body"
      style={[styles.container, { direction: dir }]}
      collapsable={false}
      importantForAccessibility="yes"
    >

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <BottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (footerHeight || insets.bottom) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* The heading scrolls with its content (#326): pinned, its title and subtitle outgrow the top detent on a
              320 dp window or at 200% font and leave the body no viewport. */}
          <View style={styles.directionsHeader}>{directionsHeader}</View>
          {upgrade && upgrade.phase !== 'idle' && <ManualLiveUpgradeCard upgrade={upgrade} destination={destination.name}
            onConfirm={() => void confirmLiveUpgrade()} onCancel={cancelLiveUpgrade} onStart={() => { startUpgradedNavigation(); }}
            recoveryLabel={locationRecoveryAction?.kind !== 'use_location' ? locationRecoveryAction?.label : undefined} onRecover={() => void runLocationRecovery()} />}
          {showRouteReady && routeGuide && (
            <RouteGuideCard
              guide={routeGuide}
              onPrevious={() => setRouteGuideStep(routeGuide.stepIndex - 1)}
              onNext={() => setRouteGuideStep(routeGuide.stepIndex + 1)}
              onLive={() => void runStartAction(() => startNowRef.current())}
              onEnd={endRouteGuide}
              liveBusy={startAttempt === 'working' || (upgrade && upgrade.phase !== 'idle')}
              message={
                startAttempt === 'settings'
                  ? t('directions.allowSettings')
                  : startAttempt === 'services_off'
                  ? liveBlockerMessage('services_off')
                  : startAttempt === 'failed'
                  ? t('directions.guideLocationFailed')
                  : null
              }
            />
          )}

          {/* What went wrong comes first: at the half-height snap the From/To rows already fill the view. */}
          <FadeContent transitionKey={`status-${loadState}`}>
          {showError && (
            <Card variant="error" style={styles.statusCard}>
              <Text style={[styles.statusTitle, styles.statusTitleError]}>{errorMessage || ROUTE_NOT_FOUND}</Text>
            </Card>
          )}

          {showSamePlace && (
            <Card variant="neutral" style={styles.statusCard}>
              <Text style={styles.statusTitle}>{SAME_PLACE}</Text>
            </Card>
          )}

          {hypotheticalPreview && (
            <Card variant="neutral" style={styles.statusCard}>
              <Text style={styles.statusText} accessibilityLiveRegion="polite">{t('block2.notice')}</Text>
            </Card>
          )}
          {showNeedsStart && (
            <Card variant="neutral" style={styles.statusCard}>
              <Text style={styles.statusTitle}>{t('directions.whereStart')}</Text>
              {errorMessage ? <Text style={styles.statusText}>{errorMessage}</Text> : null}
            </Card>
          )}
          </FadeContent>

          <FadeContent transitionKey="routeEnds">
            <RouteEndpointRows
              from={{
                label: t('directions.from'),
                name: startSourceLabel,
                detail: startSourceHelper(
                  startSource,
                  (startSource === 'live_gps' && !currentLocation) || (startSource === 'manual_place' && !manualStart),
                  t,
                ),
                icon: startIcon,
                actionAccessibilityLabel: t('directions.changeFrom', { name: startSourceLabel }),
                onAction: handleChangeStart,
              }}
              to={{
                label: t('directions.to'),
                name: destination.name,
                detail: placeCategoryLabel(destination.category),
                icon: <MapPin size={24} color={directionsSheetColors.brand} />,
                actionAccessibilityLabel: t('directions.changeTo', { name: destination.name }),
                onAction: onChangeDestination && onOpenDirectory ? () => onOpenDirectory('destination') : onClose,
              }}
            >
              {(destination.verificationWarning || destination.unavailableReason) && (
                <Card variant="warning" style={styles.statusCard}>
                  <Text style={[styles.statusTitle, styles.statusTitleWarning]}>{t('directions.headsUp')}</Text>
                  <Text style={styles.statusText}>
                    {destination.verificationWarning ?? unavailableReasonCopy(destination.unavailableReason)}
                  </Text>
                </Card>
              )}
            </RouteEndpointRows>
          </FadeContent>

          <FadeContent transitionKey={loadState}>
          {showStartHint && (
            <Card variant={outsideStart ? 'warning' : 'neutral'} style={styles.statusCard}>
              <Text style={[styles.statusTitle, outsideStart && styles.statusTitleWarning]}>
                {outsideStart ? t('directions.outside') : t('directions.savedLocation')}
              </Text>
              <Text style={styles.statusText}>
                {routeStatusMessage}
              </Text>
              {startSource === 'live_gps' && currentRouteOriginInsideVenue === false && (
                <Text style={styles.statusHint}>{t('directions.selectedGateFirst')}</Text>
              )}
            </Card>
          )}

          {showPreviewRoute && (
            <View style={styles.readyBody}>
              {compactFooter && routeSummary}
              {compactFooter && !routeGuide && !hypotheticalPreview && secondaryLink}
              {routeEntrySummary ? <Text style={styles.statusText}>{routeEntrySummary}</Text> : null}

              {outsideRoute && (
                <OutsideRouteStatusCard
                  route={outsideRoute}
                  gateLabel={V2PlaceAdapter.getPlaceById(outsideRoute.gateId)?.name ?? outsideRoute.gateId.replace('GATE_', 'Gate ')}
                  retrying={routeRefreshing}
                  onRetry={outsideRoute.provider === 'direct-guide' ? () => void retryOutsideRoute() : undefined}
                  onChooseGate={outsideRoute.provider === 'direct-guide' ? () => setShowGateOptions(true) : undefined}
                />
              )}

              {directGuide && showGateOptions && (
                <View style={styles.gateOptions}>
                  <Text accessibilityRole="header" style={styles.cardLabel}>{t('directions.chooseGate')}</Text>
                  <Button
                    variant={manualGateId ? 'outline' : 'brandTint'}
                    label={t('directions.closestGate')}
                    accessibilityLabel={t('directions.useClosestGate')}
                    // Selection state was previously conveyed only by variant color
                    // (secondary vs outline) — invisible to TalkBack. Same fix already
                    // applied to LayersSheet's Standard/Satellite toggle (#65).
                    accessibilityState={{ selected: !manualGateId }}
                    onPress={() => {
                      clearManualGateSelection();
                      setShowGateOptions(false);
                    }}
                  />
                  {manualGateOptions.map((gate) => (
                    <Button
                      key={gate.gateId}
                      variant={manualGateId === gate.gateId ? 'brandTint' : 'outline'}
                      label={gate.label}
                      accessibilityLabel={t('directions.useGate', { gate: gate.label })}
                      accessibilityState={{ selected: manualGateId === gate.gateId }}
                      onPress={() => {
                        selectManualGate(gate.gateId);
                        setShowGateOptions(false);
                      }}
                    />
                  ))}
                </View>
              )}

              {onCancelRoute && (
                <Pressable
                  style={styles.linkButton}
                  onPress={onCancelRoute}
                  accessibilityRole="button"
                  accessibilityLabel={t('directions.cancelRoute')}
                >
                  <Text style={styles.cancelRouteText}>{t('directions.cancelRoute')}</Text>
                </Pressable>
              )}
            </View>
          )}
          </FadeContent>
        </BottomSheetScrollView>

      </KeyboardAvoidingView>
    </View>
  );
}

function PlaceSection(props: Extract<LocationSheetProps, { mode: 'preview' | 'details' }>) {
  const { t, dir } = useI18n();
  const BackIcon = backChevron();
  const facilityKey = facilityTypeKey(props.place);
  const insets = useSafeAreaInsets();
  const {
    mode,
    place,
    theme,
    entryPoints,
    blockGates,
    selectedEntryIdx,
    onSelectEntryIdx,
    walkingTimeMin,
    isFav,
    onToggleFavorite,
    onSelectGate,
    onOpenDirections,
    onClose,
    onShowDetails,
    onCloseDetails,
    developerModeEnabled,
  } = props;
  const isDetails = mode === 'details';

  return (
    // The sheet runs to the window bottom, behind the system navigation bar: let the last row scroll clear of it.
    <BottomSheetScrollView contentContainerStyle={[sheetStyles.sheetContent, { direction: dir }, { paddingBottom: sheetStyles.sheetContent.padding + insets.bottom }]}>
      <View testID="place-sheet-content" style={{ direction: dir }}>
        <View style={sheetStyles.placeHeader}>
          {isDetails && (
            <Pressable
              onPress={onCloseDetails}
              style={sheetStyles.detailsBackButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <BackIcon size={24} color={staticColors.iconMuted} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[sheetStyles.placeName, { color: theme.text }]}>{place.name}</Text>
            {place.urduName && (
              <Text style={[sheetStyles.placeUrdu, { color: theme.primary }]}>{place.urduName}</Text>
            )}
            <Text style={[sheetStyles.placeCategory, { color: theme.subtext }]}>{placeCategoryLabel(place.category)}</Text>
            {place.sourceVersion !== 'v2' && place.category === 'Block' && (IJTEMA_DATA.blocks as any)[place.id]?.role && (
              <Text style={sheetStyles.placeRole}>{(IJTEMA_DATA.blocks as any)[place.id].role}</Text>
            )}
            {place.category === 'Gate' && (
              <Text style={sheetStyles.placeRole}>
                {t(place.isMajorGate ? 'place.majorGate' : 'place.officialGate')}
              </Text>
            )}
            {facilityKey && (
              <Text style={sheetStyles.placeRole}>{t(facilityKey!)}</Text>
            )}
          </View>
          {!isDetails && (
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={sheetStyles.headerCloseButton}
              accessibilityRole="button"
              accessibilityLabel={t('place.close')}
            >
              <X size={24} color={staticColors.iconMuted} />
            </Pressable>
          )}
        </View>

        {(place.verificationWarning || place.unavailableReason) && (
          <View style={sheetStyles.placeWarningBanner}>
            <Text style={sheetStyles.placeWarningBannerText}>
              {place.verificationWarning ?? unavailableReasonCopy(place.unavailableReason)}
            </Text>
          </View>
        )}

        {!isDetails && (
          <View style={sheetStyles.infoChips}>
            {walkingTimeMin !== null && (
              <View style={sheetStyles.infoChip}>
                <Clock size={14} color={staticColors.success} />
                <Text style={sheetStyles.infoChipText}>{t('place.walk', { minutes: walkingTimeMin })}</Text>
              </View>
            )}
            {entryPoints.length > 0 && (
              <View style={sheetStyles.infoChip}>
                <MapPin size={14} color={staticColors.success} />
                <Text style={sheetStyles.infoChipText}>{t('place.entranceCount', { count: entryPoints.length })}</Text>
              </View>
            )}
          </View>
        )}

        {isDetails && place.description && (
          <View style={sheetStyles.detailsBlock}>
            <Text style={sheetStyles.sectionLabel}>{t('place.information')}</Text>
            <Text style={sheetStyles.placeDesc}>{unavailableReasonCopy(place.description)}</Text>
          </View>
        )}

        {entryPoints.length > 0 && (
          <View style={sheetStyles.entranceSection}>
            <Text style={sheetStyles.sectionLabel}>{t(isDetails ? 'place.rastay' : 'place.entrances')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {entryPoints.map((ep, idx) => (
                <Pressable
                  key={ep.nodeId}
                  style={[
                    sheetStyles.entranceChip,
                    selectedEntryIdx === idx && sheetStyles.entranceChipActive,
                  ]}
                  onPress={() => onSelectEntryIdx(idx)}
                  accessibilityRole="button"
                  accessibilityLabel={t('place.entranceSpoken', { number: idx + 1, name: ep.friendlyName })}
                  accessibilityState={{ selected: selectedEntryIdx === idx }}
                >
                  <Text
                    style={[
                      sheetStyles.entranceNodeText,
                      selectedEntryIdx === idx && sheetStyles.entranceChipTextActive,
                    ]}
                  >
                    {t('place.entrance', { number: idx + 1 })}
                  </Text>
                  <Text
                    style={[
                      sheetStyles.entranceChipText,
                      selectedEntryIdx === idx && sheetStyles.entranceChipTextActive,
                    ]}
                  >
                    {ep.friendlyName}
                  </Text>
                  <Text style={sheetStyles.entranceUrdu}>{ep.urduName}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {blockGates.length > 0 && (
          <View style={sheetStyles.entranceSection}>
            <Text style={sheetStyles.sectionLabel}>{t(isDetails ? 'place.nearbyGates' : 'place.memberGates')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {blockGates.map((gate) => (
                <Pressable
                  key={gate.id}
                  style={sheetStyles.gateChip}
                  onPress={() => onSelectGate(gate)}
                  accessibilityRole="button"
                  accessibilityLabel={gate.name.replace('Member Masjid Gate ', 'Gate ')}
                >
                  {__DEV__ && developerModeEnabled && <Text style={sheetStyles.entranceNodeText}>{gate.id}</Text>}
                  <Text style={sheetStyles.entranceChipText}>{gate.name.replace('Member Masjid Gate ', 'Gate ')}</Text>
                  {gate.urduName && <Text style={sheetStyles.entranceUrdu}>{gate.urduName}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {(place.category === 'Rasta' || place.category === 'SpecialRoute') && (place.connectedBlockNames?.length ?? 0) > 0 && (
          <View style={sheetStyles.entranceSection}>
            <Text style={sheetStyles.sectionLabel}>{t(place.category === 'Rasta' ? 'place.blocks' : 'place.areas')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {place.connectedBlockNames!.map((name) => (
                <View key={name} style={sheetStyles.entranceChip}>
                  <Text style={sheetStyles.entranceChipText}>{name}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <Button
          variant="primary"
          icon={<Navigation size={22} color={staticColors.white} />}
          label={t('place.directions')}
          onPress={onOpenDirections}
          style={sheetStyles.takeMeButtonWrap}
        />

        <View style={sheetStyles.secondaryActions}>
          <Pressable
            style={sheetStyles.secondaryAction}
            onPress={onToggleFavorite}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t(isFav ? 'place.unsave' : 'place.saveLocation')}
            accessibilityState={{ selected: isFav }}
          >
            <Star
              size={20}
              color={isFav ? staticColors.starActive : staticColors.info}
              fill={isFav ? staticColors.starActive : 'none'}
            />
            <Text style={sheetStyles.secondaryActionText}>{t(isFav ? 'place.saved' : 'place.save')}</Text>
          </Pressable>
          <Pressable
            style={sheetStyles.secondaryAction}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('place.shareLocation')}
            onPress={() => {
              const share = buildPlaceShareMessage(place);
              if (!share) {
                Alert.alert(t('place.unavailable'), unavailableReasonCopy(place.unavailableReason) ?? t('place.notOnMap', { name: place.name }));
                return;
              }
              Share.share({ title: share.title, message: share.message }).catch(() => Alert.alert(t('place.shareError'), t('place.tryAgain')));
            }}
          >
            <Share2 size={20} color={staticColors.info} />
            <Text style={sheetStyles.secondaryActionText}>{t('place.share')}</Text>
          </Pressable>
          {!isDetails && (
            <Pressable
              style={sheetStyles.secondaryAction}
              onPress={onShowDetails}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('place.showDetails')}
            >
              <MapPin size={20} color={staticColors.info} />
              <Text style={sheetStyles.secondaryActionText}>{t('place.details')}</Text>
            </Pressable>
          )}
        </View>

        {!isDetails && place.description && (
          <Text style={sheetStyles.placeDesc}>{unavailableReasonCopy(place.description)}</Text>
        )}
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: directionsSheetColors.background,
  },
  scroll: {
    flex: 1,
  },
  // Cancels the scroll content's own padding and gap so the heading sits where the pinned one did.
  directionsHeader: { marginHorizontal: -16, marginTop: -4, marginBottom: -6 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 10,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: directionsSheetColors.headingText,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: directionsSheetColors.headingText,
  },
  // Shared status cards (hint / error / warnings) follow the sheet's 14 dp card radius.
  statusCard: {
    borderRadius: 14,
    padding: 14,
  },
  readyBody: {
    gap: 10,
  },
  footerReason: {
    fontSize: 13,
    lineHeight: 18,
    color: directionsSheetColors.secondaryText,
  },
  footerStatus: {
    gap: 4,
  },
  cta: {
    borderRadius: radii.xl,
  },
  // One line: label left, duration + distance right (wraps under large fonts).
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: 12,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: directionsSheetColors.brand,
  },
  // Tap target: the label alone is ~24 dp tall; minHeight brings the whole row to the
  // 48 dp minimum.
  linkButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: directionsSheetColors.brand,
  },
  // Cancelling is secondary and destructive: quiet red text, never styled like the primary action.
  cancelRouteText: {
    fontSize: 15,
    fontWeight: '600',
    color: staticColors.dangerText,
  },
  // Same AA-passing muted token DestinationRow (#96/#146) uses for unroutable places.
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: staticColors.textPrimary,
  },
  statusTitleWarning: {
    color: staticColors.warningText, // #B06000 on #FFF6E5 fails AA (4.33:1); #7C4A03 passes (6.89:1)
  },
  statusTitleError: {
    color: staticColors.dangerText,
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: staticColors.textSecondaryStrong,
  },
  statusHint: {
    fontSize: 13,
    lineHeight: 18,
    color: staticColors.iconMuted,
  },
  gateOptions: {
    gap: 10,
  },
  // Hero duration/distance — the route's ETA is the largest element (adapted from the
  // Google Maps UI Kit directions screen). Sheet brand green, not the route-line blue, so
  // the sheet carries no blue (#177); the map keeps the route-line colours.
  routeHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  routeHeroDuration: {
    fontSize: 24,
    fontWeight: '800',
    color: directionsSheetColors.brand,
  },
  routeHeroDistance: {
    fontSize: 16,
    fontWeight: '600',
    color: staticColors.iconMuted,
  },
});

const sheetStyles = StyleSheet.create({
  sheetContent: { padding: 20 },
  placeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailsBackButton: { paddingRight: 12, paddingTop: 2 },
  placeName: { fontSize: 24, fontWeight: 'bold', color: staticColors.textPrimary },
  placeUrdu: { fontSize: 18, color: staticColors.success, marginTop: 2 },
  placeCategory: { fontSize: 14, color: staticColors.iconSubtle, marginTop: 4 },
  placeRole: { fontSize: 13, color: staticColors.info, fontWeight: '700', marginTop: 4 },
  infoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: staticColors.lightGreenSubtext,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  infoChipText: { fontSize: 13, color: staticColors.success, fontWeight: '500' },
  detailsBlock: { marginBottom: 16 },
  entranceSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: staticColors.iconMuted, marginBottom: 8 },
  entranceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: staticColors.neutralSurface,
    marginRight: 8,
    minWidth: 120,
  },
  gateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: staticColors.gateChipBackground,
    borderWidth: 1,
    borderColor: staticColors.gateAccent,
    marginRight: 8,
    minWidth: 132,
  },
  entranceChipActive: { backgroundColor: staticColors.routePreviewPill, borderWidth: 1.5, borderColor: staticColors.info },
  entranceNodeText: { fontSize: 13, color: staticColors.textPrimary, fontWeight: '800', marginBottom: 2 },
  entranceChipText: { fontSize: 14, color: staticColors.textSecondaryStrong, fontWeight: '500' },
  entranceChipTextActive: { color: staticColors.info },
  // destNameMuted (#888) is ~3.6:1 on white, fails AA for this size; iconMuted passes.
  entranceUrdu: { fontSize: 12, color: staticColors.iconMuted, marginTop: 2 },
  takeMeButtonWrap: {
    marginBottom: 20,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: staticColors.neutralSurface,
    paddingVertical: 12,
  },
  // minWidth/minHeight/paddingVertical widen the tap target past the icon+label's own bounds
  // (elderly-friendly touch target, Phase 8B task 7) without changing the visible row layout.
  secondaryAction: { alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 64, minHeight: 48, paddingVertical: 6 },
  secondaryActionText: { fontSize: 12, color: staticColors.info, fontWeight: '500' },
  headerCloseButton: { padding: 4 },
  placeDesc: { fontSize: 14, color: staticColors.iconMuted, lineHeight: 22 },
  placeWarningBanner: {
    backgroundColor: staticColors.warningBackgroundAlt,
    borderWidth: 1,
    borderColor: staticColors.gateMarkerWarning,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  placeWarningBannerText: { fontSize: 13, color: staticColors.warningText, fontWeight: '600', lineHeight: 18 }, // #E65100 on #FFF3E0 fails AA (3.79:1); #7C4A03 passes (6.75:1)
});
