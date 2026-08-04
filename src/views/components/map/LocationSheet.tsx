/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Share,
  Alert,
} from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import {
  ChevronLeft,
  Clock,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Star,
  Share2,
  X,
} from 'lucide-react-native';

import { useDirectionsViewModel } from '../../../viewmodels/DirectionsViewModel';
import { InstructionService } from '../../../services/InstructionService';
import { SearchService } from '../../../services/SearchService';
import { useAppStore } from '../../../store/useAppStore';
import { Place, RoutePreview, BlockEntryPoint, Gate } from '../../../models/types';
import { EntryGateRoutingService } from '../../../services/EntryGateRoutingService';
import { IJTEMA_DATA } from '../../../constants/data';
import { AppTheme } from '../../../services/ThemeService';
import { NAV_TRANSITION_TIMINGS } from '../../../constants/navigationTransitions';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { SearchBarField } from '../common/SearchBarField';
import { staticColors } from '../../../theme';
import { OutsideRouteStatusCard } from '../navigation/OutsideRouteStatusCard';
import type { NormalizedOutsideRoute } from '../../../models/outsideRouting';

declare const __DEV__: boolean;

/** Facility sub-type text for the Masjid/Landmark categories — mirrors the exact same
 * id-prefix signal FacilityLayer.tsx already uses to pick an icon (LM_FOOD_*, LM_WATER_*,
 * ...), just spelled out as a label instead of an icon. Not fabricated: same source data,
 * same categorization already relied on elsewhere. */
function facilityTypeLabel(place: Place): string | null {
  if (place.category === 'Masjid') return 'Masjid';
  if (place.category !== 'Landmark') return null;
  if (place.id.startsWith('LM_FOOD')) return 'Food & refreshments point';
  if (place.id.startsWith('LM_WATER')) return 'Water point';
  if (place.id.startsWith('LM_MEDICAL')) return 'Medical point';
  if (place.id.startsWith('LM_PARKING')) return 'Parking area';
  if (place.id.startsWith('LM_BUS')) return 'Bus point';
  if (place.id.startsWith('LM_LOST_FOUND')) return 'Lost & found point';
  if (place.id.startsWith('LM_VOLUNTEER')) return 'Volunteer help point';
  return 'Landmark';
}

type RoutePreviewWithV2Meta = RoutePreview & {
  outsideRoute?: NormalizedOutsideRoute;
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
        onCancelRoute={props.onCancelRoute}
        onChangeDestination={props.onChangeDestination}
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
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: NAV_TRANSITION_TIMINGS.sheetContentFadeMs,
      useNativeDriver: true,
    }).start();
  }, [transitionKey, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

function StartOption({
  icon,
  title,
  subtitle,
  active,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.startOption,
        active && styles.startOptionActive,
        disabled && styles.startOptionDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
    >
      <View style={[styles.startOptionIcon, active && styles.startOptionIconActive]}>{icon}</View>
      <View style={styles.startOptionBody}>
        <Text style={[styles.startOptionTitle, active && styles.startOptionTitleActive, disabled && styles.startOptionTitleDisabled]}>
          {title}
        </Text>
        <Text style={[styles.startOptionSubtitle, disabled && styles.startOptionSubtitleDisabled]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function RoutePreviewSection({
  destination,
  onClose,
  onStartNavigation,
  onCancelRoute,
  onChangeDestination,
}: {
  destination: Place;
  onClose: () => void;
  onStartNavigation?: () => void;
  onCancelRoute?: () => void;
  onChangeDestination?: (place: Place) => void;
}) {
  const currentLocation = useAppStore((s) => s.currentLocation);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);

  const [startSearch, setStartSearch] = useState('');
  // Mirrors showStartOptions/startSearch below — same inline-search pattern ("Change
  // Start" already reuses SearchService.search this way instead of the full-screen
  // search overlay), applied to the destination side instead of the start side.
  const [showDestinationOptions, setShowDestinationOptions] = useState(false);
  const [destSearch, setDestSearch] = useState('');
  const [showGateOptions, setShowGateOptions] = useState(false);
  // Guards Retry against a same-tick double-tap: loadState only reflects the in-flight
  // request after DirectionsViewModel's state update commits and this component
  // re-renders, so a second tap landing before that commit would otherwise still see
  // the stale loadState==='error' and re-invoke calculateRoute concurrently.
  const retryInFlightRef = useRef(false);

  const {
    route,
    startSource,
    startSourceLabel,
    rememberedLocationAgeLabel,
    rememberedLocationAvailable,
    rememberedLocationInsideVenue,
    currentRouteOriginInsideVenue,
    loadState,
    errorMessage,
    manualStart,
    chooseManualStart,
    setIsEditingManualStart,
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
    showManualStartSearch,
  } = useDirectionsViewModel(destination);

  // Google Maps default: route starts from current GPS location, no picker shown up
  // front. Remembered/manual start only surface once the rider explicitly asks via
  // "Change Start" — picking one collapses back to the compact summary automatically.
  const [showStartOptions, setShowStartOptions] = useState(false);
  const startIcon =
    startSource === 'remembered_location' ? (
      <MapPin size={20} color={staticColors.info} />
    ) : startSource === 'manual_place' ? (
      <Navigation size={20} color={staticColors.info} />
    ) : (
      <LocateFixed size={20} color={staticColors.info} />
    );

  const startCandidates = useMemo(() => {
    if (!showManualStartSearch || startSearch.trim().length < 2) return [];
    return SearchService.search(startSearch, currentLocation ?? undefined)
      .filter((candidate) => candidate.id !== destination.id)
      .slice(0, 8);
  }, [currentLocation, destination.id, showManualStartSearch, startSearch]);

  const destCandidates = useMemo(() => {
    if (!showDestinationOptions || destSearch.trim().length < 2) return [];
    return SearchService.search(destSearch, currentLocation ?? undefined)
      .filter((candidate) => candidate.id !== destination.id)
      .slice(0, 8);
  }, [currentLocation, destination.id, showDestinationOptions, destSearch]);

  const startCoordinate =
    startSource === 'live_gps'
      ? currentLocation
      : startSource === 'remembered_location'
      ? lastKnownLocation
      : manualStart?.coordinate ?? null;
  const outsideStart =
    destination.sourceVersion === 'v2' &&
    startSource !== 'manual_place' &&
    !!startCoordinate &&
    !EntryGateRoutingService.isInsideIjtemaArea(startCoordinate);
  const routeMeta = route as RoutePreviewWithV2Meta | null;
  const outsideRoute = routeMeta?.outsideRoute;
  const entryGateName = routeMeta?.startResolution?.gate?.name?.en ?? null;
  const routeDistance = route ? InstructionService.formatDistance(route.totalDistance, distanceUnit) : null;
  const routeEta = route ? InstructionService.formatDuration(route.estimatedTimeMin) : null;
  const routeStatusMessage = outsideStart
    ? "You are outside Ijtema. We'll enter through best eligible official gate."
    : startSource === 'remembered_location' && rememberedLocationAvailable
    ? `Using last known location ${rememberedLocationAgeLabel}.`
    : startSource === 'manual_place' && manualStart
    ? `Starting from ${manualStart.name}.`
    : startSource === 'live_gps'
    ? 'Using live GPS location now.'
    : 'Choose a start point to continue.';

  const routeEntrySummary = entryGateName
    ? `Enter through ${entryGateName}`
    : routeMeta?.startResolution?.startType === 'internal_snap'
    ? 'Starting from nearest path inside Ijtema.'
    : routeMeta?.startLabel
    ? `Starting from ${routeMeta.startLabel}`
    : 'Offline route ready.';

  const showRouteReady = loadState === 'ready' && !!route;
  const showLoading = loadState === 'loading';
  const showError = loadState === 'error';
  const showStartHint = !showLoading && !showError && !showRouteReady;
  const retryRoute = () => {
    if (retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    void calculateRoute().finally(() => {
      retryInFlightRef.current = false;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.backButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={28} color={staticColors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Get Directions</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <BottomSheetScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Card gap={14}>
            <FadeContent transitionKey={showDestinationOptions ? 'destOptions' : 'destSummary'}>
            {showDestinationOptions ? (
              <>
                <Text style={styles.sectionTitle}>Where do you want to go?</Text>

                <SearchBarField
                  value={destSearch}
                  onChangeText={setDestSearch}
                  placeholder="Search destination: gate, rasta, block"
                  onSubmitEditing={Keyboard.dismiss}
                  autoFocus
                />

                {destCandidates.length > 0 && (
                  <View style={styles.searchResults}>
                    {destCandidates.map((candidate: Place) => (
                      <Pressable
                        key={candidate.id}
                        style={styles.searchItem}
                        onPress={() => {
                          setDestSearch('');
                          setShowDestinationOptions(false);
                          Keyboard.dismiss();
                          onChangeDestination?.(candidate);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${candidate.name}, ${candidate.category}`}
                      >
                        <MapPin size={16} color={staticColors.iconMuted} />
                        <View style={styles.searchItemBody}>
                          <Text style={styles.searchItemName}>{candidate.name}</Text>
                          <Text style={styles.searchItemMeta}>{candidate.category}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}

                {destSearch.trim().length >= 2 && destCandidates.length === 0 && (
                  <Text style={styles.emptySearchText}>No destinations found.</Text>
                )}

                <Pressable
                  style={styles.linkButton}
                  onPress={() => {
                    setShowDestinationOptions(false);
                    setDestSearch('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel changing destination"
                >
                  <Text style={styles.linkButtonText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardLabel}>Going to</Text>
                <View style={styles.destinationRow}>
                  <View style={styles.destinationIconWrap}>
                    <MapPin size={20} color={staticColors.success} />
                  </View>
                  <View style={styles.destinationBody}>
                    <Text style={styles.destinationName}>{destination.name}</Text>
                    <Text style={styles.destinationCategory}>{destination.category}</Text>
                  </View>
                </View>
                {(destination.verificationWarning || destination.unavailableReason) && (
                  <Card variant="warning" style={styles.destinationWarningCard}>
                    <Text style={[styles.statusTitle, styles.statusTitleWarning]}>Heads up</Text>
                    <Text style={styles.statusText}>
                      {destination.verificationWarning ?? destination.unavailableReason}
                    </Text>
                  </Card>
                )}
                <Pressable
                  style={styles.linkButton}
                  onPress={onChangeDestination ? () => setShowDestinationOptions(true) : onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Change destination"
                >
                  <Text style={styles.linkButtonText}>Change destination</Text>
                </Pressable>
              </>
            )}
            </FadeContent>
          </Card>

          <Card gap={14}>
            <FadeContent transitionKey={showStartOptions || showManualStartSearch ? 'options' : 'summary'}>
            {showStartOptions || showManualStartSearch ? (
              <>
                <Text style={styles.sectionTitle}>Where are you starting from?</Text>

                <StartOption
                  active={startSource === 'live_gps'}
                  icon={<LocateFixed size={18} color={startSource === 'live_gps' ? staticColors.white : staticColors.info} />}
                  title="Use my current location"
                  subtitle="Find best eligible official gate automatically"
                  onPress={() => {
                    void chooseCurrentLocation().then((ok) => {
                      if (ok) setShowStartOptions(false);
                    });
                  }}
                />

                <StartOption
                  active={startSource === 'remembered_location'}
                  disabled={!rememberedLocationAvailable}
                  icon={<MapPin size={18} color={startSource === 'remembered_location' ? staticColors.white : staticColors.info} />}
                  title="Use last known location"
                  subtitle={
                    !rememberedLocationAvailable
                      ? 'No saved location yet'
                      : rememberedLocationInsideVenue
                      ? `We will start from nearest path (${rememberedLocationAgeLabel})`
                      : `We'll enter through best eligible official gate (${rememberedLocationAgeLabel})`
                  }
                  onPress={() => {
                    if (chooseRememberedLocation()) setShowStartOptions(false);
                  }}
                />

                <StartOption
                  active={startSource === 'manual_place'}
                  icon={<Navigation size={18} color={startSource === 'manual_place' ? staticColors.white : staticColors.info} />}
                  title="Choose start manually"
                  subtitle="Select gate, rasta, block, or point"
                  onPress={chooseManualStart}
                />

                {showManualStartSearch && (
                  <View style={styles.manualSection}>
                    <SearchBarField
                      value={startSearch}
                      onChangeText={setStartSearch}
                      placeholder="Search start point: gate, rasta, block"
                      onSubmitEditing={Keyboard.dismiss}
                      onFocus={() => setIsEditingManualStart(true)}
                    />

                    {startCandidates.length > 0 && (
                      <View style={styles.searchResults}>
                        {startCandidates.map((candidate: Place) => (
                          <Pressable
                            key={candidate.id}
                            style={styles.searchItem}
                            onPress={() => {
                              setManualStartPlace(candidate);
                              setStartSearch(candidate.name);
                              setIsEditingManualStart(false);
                              setShowStartOptions(false);
                              Keyboard.dismiss();
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${candidate.name}, ${candidate.category}`}
                          >
                            <MapPin size={16} color={staticColors.iconMuted} />
                            <View style={styles.searchItemBody}>
                              <Text style={styles.searchItemName}>{candidate.name}</Text>
                              <Text style={styles.searchItemMeta}>{candidate.category}</Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {startSearch.trim().length >= 2 && startCandidates.length === 0 && (
                      <Text style={styles.emptySearchText}>No start points found.</Text>
                    )}
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={styles.cardLabel}>Starting from</Text>
                <View style={styles.destinationRow}>
                  <View style={styles.destinationIconWrap}>{startIcon}</View>
                  <View style={styles.destinationBody}>
                    <Text style={styles.destinationName}>{startSourceLabel}</Text>
                  </View>
                </View>
                <Pressable
                  style={styles.linkButton}
                  onPress={() => setShowStartOptions(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Change starting point"
                >
                  <Text style={styles.linkButtonText}>Change Start</Text>
                </Pressable>
              </>
            )}
            </FadeContent>
          </Card>

          <FadeContent transitionKey={loadState}>
          {showStartHint && (
            <Card variant={outsideStart ? 'warning' : 'neutral'}>
              <Text style={[styles.statusTitle, outsideStart && styles.statusTitleWarning]}>
                {outsideStart ? 'Outside Ijtema' : 'Start ready'}
              </Text>
              <Text style={styles.statusText}>
                {outsideStart
                  ? "You are outside Ijtema. Route will enter through best eligible official gate."
                  : routeStatusMessage}
              </Text>
              {startSource === 'live_gps' && currentRouteOriginInsideVenue === false && (
                <Text style={styles.statusHint}>We will route to selected official gate first, then continue inside venue.</Text>
              )}
            </Card>
          )}

          {showLoading && (
            <Card variant="info">
              <View style={styles.statusRow}>
                <RefreshCw size={18} color={staticColors.info} />
                <Text style={styles.statusTitle}>Finding route...</Text>
              </View>
              <Text style={styles.statusText}>{routeStatusMessage}</Text>
            </Card>
          )}

          {showError && (
            <Card variant="error">
              <Text style={[styles.statusTitle, styles.statusTitleError]}>Route problem</Text>
              <Text style={styles.statusText}>{errorMessage}</Text>
              <Button
                variant="danger"
                fullWidth={false}
                icon={<RefreshCw size={18} color={staticColors.white} />}
                label="Retry"
                onPress={retryRoute}
              />
            </Card>
          )}

          {showRouteReady && (
            <Card variant="success">
              <Text style={styles.statusTitle}>Route ready</Text>
              <Text style={styles.statusText}>{routeEntrySummary}</Text>

              {outsideRoute && (
                <OutsideRouteStatusCard
                  route={outsideRoute}
                  gateLabel={outsideRoute.gateId.replace('GATE_', 'Gate ')}
                  retrying={routeRefreshing}
                  onRetry={outsideRoute.provider === 'direct-guide' ? () => void retryOutsideRoute() : undefined}
                  onChooseGate={outsideRoute.provider === 'direct-guide' ? () => setShowGateOptions(true) : undefined}
                />
              )}

              {outsideRoute?.provider === 'direct-guide' && showGateOptions && (
                <View style={styles.gateOptions}>
                  <Text style={styles.cardLabel}>Choose official entry gate</Text>
                  <Button
                    variant={manualGateId ? 'outline' : 'secondary'}
                    label="Automatic gate"
                    accessibilityLabel="Use automatic gate selection"
                    onPress={() => {
                      clearManualGateSelection();
                      setShowGateOptions(false);
                    }}
                  />
                  {manualGateOptions.map((gate) => (
                    <Button
                      key={gate.gateId}
                      variant={manualGateId === gate.gateId ? 'secondary' : 'outline'}
                      label={gate.label}
                      accessibilityLabel={`Use ${gate.label}`}
                      onPress={() => {
                        selectManualGate(gate.gateId);
                        setShowGateOptions(false);
                      }}
                    />
                  ))}
                </View>
              )}

              <View style={styles.metricsRow}>
                {outsideRoute?.durationSeconds !== null && (
                  <View style={styles.metricPill}>
                    <Clock size={15} color={staticColors.info} />
                    <Text style={styles.metricText}>ETA: {routeEta}</Text>
                  </View>
                )}
                <View style={styles.metricPill}>
                  <Navigation size={15} color={staticColors.info} />
                  <Text style={styles.metricText}>Distance: {routeDistance}</Text>
                </View>
              </View>

              <Button
                variant="primary"
                label={outsideRoute?.provider === 'direct-guide' ? 'Start Direct Guide' : 'Start Navigation'}
                onPress={() => {
                  if (destination.sourceVersion === 'v2') {
                    // Built from the resolved preview route already sitting in the store
                    // (see HomeScreen.handleStartPreviewNavigation) — starts NavigationOverlayV2
                    // in place, then reveals the map the same way v1 does below.
                    onStartNavigation?.();
                    onClose();
                    return;
                  }
                  // v1: starts the in-place NavigationOverlayV1 (via the store), then
                  // reveals the map the same way v2 does — no screen navigation either way.
                  handleStartNavigation();
                  onClose();
                }}
              />

              {onCancelRoute && (
                <Pressable
                  style={styles.linkButton}
                  onPress={onCancelRoute}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel route"
                >
                  <Text style={styles.linkButtonText}>Cancel Route</Text>
                </Pressable>
              )}
            </Card>
          )}
          </FadeContent>
        </BottomSheetScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PlaceSection(props: Extract<LocationSheetProps, { mode: 'preview' | 'details' }>) {
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
    <BottomSheetScrollView contentContainerStyle={sheetStyles.sheetContent}>
      <View>
        <View style={sheetStyles.placeHeader}>
          {isDetails && (
            <Pressable
              onPress={onCloseDetails}
              style={sheetStyles.detailsBackButton}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={24} color={staticColors.iconMuted} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[sheetStyles.placeName, { color: theme.text }]}>{place.name}</Text>
            {place.urduName && (
              <Text style={[sheetStyles.placeUrdu, { color: theme.primary }]}>{place.urduName}</Text>
            )}
            <Text style={[sheetStyles.placeCategory, { color: theme.subtext }]}>{place.category}</Text>
            {place.sourceVersion !== 'v2' && place.category === 'Block' && (IJTEMA_DATA.blocks as any)[place.id]?.role && (
              <Text style={sheetStyles.placeRole}>{(IJTEMA_DATA.blocks as any)[place.id].role}</Text>
            )}
            {place.category === 'Gate' && (
              <Text style={sheetStyles.placeRole}>
                {place.isMajorGate ? 'Official entry / exit gate · Recommended entry point' : 'Official entry / exit gate'}
              </Text>
            )}
            {facilityTypeLabel(place) && (
              <Text style={sheetStyles.placeRole}>{facilityTypeLabel(place)}</Text>
            )}
          </View>
          {!isDetails && (
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={sheetStyles.headerCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={24} color={staticColors.iconMuted} />
            </Pressable>
          )}
        </View>

        {(place.verificationWarning || place.unavailableReason) && (
          <View style={sheetStyles.placeWarningBanner}>
            <Text style={sheetStyles.placeWarningBannerText}>
              {place.verificationWarning ?? place.unavailableReason}
            </Text>
          </View>
        )}

        {!isDetails && (
          <View style={sheetStyles.infoChips}>
            {walkingTimeMin !== null && (
              <View style={sheetStyles.infoChip}>
                <Clock size={14} color={staticColors.success} />
                <Text style={sheetStyles.infoChipText}>{walkingTimeMin} min walk</Text>
              </View>
            )}
            {entryPoints.length > 0 && (
              <View style={sheetStyles.infoChip}>
                <MapPin size={14} color={staticColors.success} />
                <Text style={sheetStyles.infoChipText}>{entryPoints.length} entrances</Text>
              </View>
            )}
          </View>
        )}

        {isDetails && place.description && (
          <View style={sheetStyles.detailsBlock}>
            <Text style={sheetStyles.sectionLabel}>Block information</Text>
            <Text style={sheetStyles.placeDesc}>{place.description}</Text>
          </View>
        )}

        {entryPoints.length > 0 && (
          <View style={sheetStyles.entranceSection}>
            <Text style={sheetStyles.sectionLabel}>{isDetails ? 'Connected Rastay' : 'Entrances'}</Text>
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
                  accessibilityLabel={`Entrance ${idx + 1}: ${ep.friendlyName}`}
                  accessibilityState={{ selected: selectedEntryIdx === idx }}
                >
                  <Text
                    style={[
                      sheetStyles.entranceNodeText,
                      selectedEntryIdx === idx && sheetStyles.entranceChipTextActive,
                    ]}
                  >
                    Entrance {idx + 1}
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
            <Text style={sheetStyles.sectionLabel}>{isDetails ? 'Nearby Gates' : 'Member Masjid Gates'}</Text>
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
            <Text style={sheetStyles.sectionLabel}>{place.category === 'Rasta' ? 'Connected Blocks' : 'Connected Areas'}</Text>
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
          label="Directions"
          onPress={onOpenDirections}
          style={sheetStyles.takeMeButtonWrap}
        />

        <View style={sheetStyles.secondaryActions}>
          <Pressable style={sheetStyles.secondaryAction} onPress={onToggleFavorite} hitSlop={8}>
            <Star
              size={20}
              color={isFav ? staticColors.starActive : staticColors.info}
              fill={isFav ? staticColors.starActive : 'none'}
            />
            <Text style={sheetStyles.secondaryActionText}>{isFav ? 'Saved' : 'Save'}</Text>
          </Pressable>
          <Pressable
            style={sheetStyles.secondaryAction}
            hitSlop={8}
            onPress={() => {
              if (!place.coordinate) {
                Alert.alert('Place unavailable', place.unavailableReason ?? `${place.name} is not available on the map yet.`);
                return;
              }
              const { latitude, longitude } = place.coordinate;
              Share.share({
                title: place.name,
                message: `${place.name} — Karachi Ijtema\nLocation: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
              }).catch(() => Alert.alert('Unable to share', 'Could not open the share dialog.'));
            }}
          >
            <Share2 size={20} color={staticColors.info} />
            <Text style={sheetStyles.secondaryActionText}>Share</Text>
          </Pressable>
          {!isDetails && (
            <Pressable style={sheetStyles.secondaryAction} onPress={onShowDetails} hitSlop={8}>
              <MapPin size={20} color={staticColors.info} />
              <Text style={sheetStyles.secondaryActionText}>Details</Text>
            </Pressable>
          )}
        </View>

        {!isDetails && place.description && (
          <Text style={sheetStyles.placeDesc}>{place.description}</Text>
        )}
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: staticColors.sheetBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: staticColors.white,
    borderBottomWidth: 1,
    borderBottomColor: staticColors.borderLight,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: staticColors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: staticColors.textCaption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: staticColors.textPrimary,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: staticColors.borderLight,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  destinationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: staticColors.lightGreenSubtext,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationBody: {
    flex: 1,
    gap: 3,
  },
  destinationName: {
    fontSize: 18,
    fontWeight: '700',
    color: staticColors.textPrimary,
  },
  destinationCategory: {
    fontSize: 13,
    color: staticColors.iconMuted,
  },
  linkButton: {
    alignSelf: 'flex-start',
    // Elderly-friendly touch target — the label text alone (~24px tall) falls short of the
    // 44/48px minimum; this padding widens the tappable area without changing visible spacing
    // (the surrounding Card's own gap already accounts for a plain label's footprint).
    paddingVertical: 10,
    marginVertical: -10,
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: staticColors.info,
  },
  startOption: {
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1.5,
    borderColor: staticColors.infoBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: staticColors.white,
  },
  startOptionActive: {
    backgroundColor: staticColors.routePreviewPill,
    borderColor: staticColors.info,
  },
  startOptionDisabled: {
    opacity: 0.56,
  },
  startOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: staticColors.infoBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startOptionIconActive: {
    backgroundColor: staticColors.info,
  },
  startOptionBody: {
    flex: 1,
    gap: 4,
  },
  startOptionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: staticColors.info,
  },
  startOptionTitleActive: {
    color: staticColors.infoStrong,
  },
  startOptionTitleDisabled: {
    color: staticColors.textCaption,
  },
  startOptionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: staticColors.iconMuted,
  },
  startOptionSubtitleDisabled: {
    color: staticColors.textMuted,
  },
  manualSection: {
    gap: 10,
  },
  searchResults: {
    borderWidth: 1,
    borderColor: staticColors.borderLight,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: staticColors.white,
  },
  searchItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: staticColors.neutralSurface,
  },
  searchItemBody: {
    flex: 1,
    gap: 2,
  },
  searchItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: staticColors.textPrimary,
  },
  searchItemMeta: {
    fontSize: 13,
    color: staticColors.iconMuted,
  },
  emptySearchText: {
    fontSize: 14,
    color: staticColors.iconMuted,
  },
  destinationWarningCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    gap: 4,
  },
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
  metricsRow: {
    gap: 10,
  },
  gateOptions: {
    gap: 10,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: staticColors.infoBackground,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricText: {
    fontSize: 14,
    fontWeight: '600',
    color: staticColors.infoStrong,
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
