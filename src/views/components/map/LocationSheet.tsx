/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
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

declare const __DEV__: boolean;

type RoutePreviewWithV2Meta = RoutePreview & {
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
      onClose: () => void;
      /** Legacy (v1) destinations only — pushes the 'Navigation' stack screen. v2 destinations
       * start navigation through HomeScreen's own route-preview card instead (onClose reveals it). */
      onStartLegacyNavigation: () => void;
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
        onStartLegacyNavigation={props.onStartLegacyNavigation}
      />
    );
  }
  return <PlaceSection {...props} />;
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
  onStartLegacyNavigation,
}: {
  destination: Place;
  onClose: () => void;
  onStartLegacyNavigation: () => void;
}) {
  const currentLocation = useAppStore((s) => s.currentLocation);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);

  const [startSearch, setStartSearch] = useState('');

  const {
    route,
    startSource,
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
    handleStartNavigation,
    showManualStartSearch,
  } = useDirectionsViewModel(destination);

  const startCandidates = useMemo(() => {
    if (!showManualStartSearch || startSearch.trim().length < 2) return [];
    return SearchService.search(startSearch, currentLocation ?? undefined)
      .filter((candidate) => candidate.id !== destination.id)
      .slice(0, 8);
  }, [currentLocation, destination.id, showManualStartSearch, startSearch]);

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
  const entryGateName = routeMeta?.startResolution?.gate?.name?.en ?? null;
  const routeDistance = route ? InstructionService.formatDistance(route.totalDistance, distanceUnit) : null;
  const routeEta = route ? InstructionService.formatDuration(route.estimatedTimeMin) : null;
  const routeStatusMessage = outsideStart
    ? "You are outside Ijtema. We'll enter through nearest official gate."
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.backButton}>
          <ChevronLeft size={28} color="#202124" />
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
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Going to</Text>
            <View style={styles.destinationRow}>
              <View style={styles.destinationIconWrap}>
                <MapPin size={20} color="#2E7D32" />
              </View>
              <View style={styles.destinationBody}>
                <Text style={styles.destinationName}>{destination.name}</Text>
                <Text style={styles.destinationCategory}>{destination.category}</Text>
              </View>
            </View>
            {(destination.verificationWarning || destination.unavailableReason) && (
              <View style={[styles.statusCard, styles.statusCardWarning, styles.destinationWarningCard]}>
                <Text style={[styles.statusTitle, styles.statusTitleWarning]}>Heads up</Text>
                <Text style={styles.statusText}>
                  {destination.verificationWarning ?? destination.unavailableReason}
                </Text>
              </View>
            )}
            <Pressable style={styles.linkButton} onPress={onClose}>
              <Text style={styles.linkButtonText}>Change destination</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Where are you starting from?</Text>

            <StartOption
              active={startSource === 'live_gps'}
              icon={<LocateFixed size={18} color={startSource === 'live_gps' ? '#FFFFFF' : '#1A73E8'} />}
              title="Use my current location"
              subtitle="Find nearest official gate automatically"
              onPress={() => {
                void chooseCurrentLocation();
              }}
            />

            <StartOption
              active={startSource === 'remembered_location'}
              disabled={!rememberedLocationAvailable}
              icon={<MapPin size={18} color={startSource === 'remembered_location' ? '#FFFFFF' : '#1A73E8'} />}
              title="Use last known location"
              subtitle={
                !rememberedLocationAvailable
                  ? 'No saved location yet'
                  : rememberedLocationInsideVenue
                  ? `We will start from nearest path (${rememberedLocationAgeLabel})`
                  : `We'll enter through nearest official gate (${rememberedLocationAgeLabel})`
              }
              onPress={() => {
                chooseRememberedLocation();
              }}
            />

            <StartOption
              active={startSource === 'manual_place'}
              icon={<Navigation size={18} color={startSource === 'manual_place' ? '#FFFFFF' : '#1A73E8'} />}
              title="Choose start manually"
              subtitle="Select gate, rasta, block, or point"
              onPress={chooseManualStart}
            />

            {showManualStartSearch && (
              <View style={styles.manualSection}>
                <TextInput
                  style={styles.searchInput}
                  value={startSearch}
                  onChangeText={setStartSearch}
                  placeholder="Search start point: gate, rasta, block"
                  placeholderTextColor="#80868B"
                  returnKeyType="search"
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
                          Keyboard.dismiss();
                        }}
                      >
                        <MapPin size={16} color="#5F6368" />
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
          </View>

          {showStartHint && (
            <View style={[styles.statusCard, outsideStart ? styles.statusCardWarning : styles.statusCardNeutral]}>
              <Text style={[styles.statusTitle, outsideStart && styles.statusTitleWarning]}>
                {outsideStart ? 'Outside Ijtema' : 'Start ready'}
              </Text>
              <Text style={styles.statusText}>
                {outsideStart
                  ? "You are outside Ijtema. Route will enter through nearest connected official gate."
                  : routeStatusMessage}
              </Text>
              {startSource === 'live_gps' && currentRouteOriginInsideVenue === false && (
                <Text style={styles.statusHint}>We will snap to nearest connected gate first, then continue inside venue.</Text>
              )}
            </View>
          )}

          {showLoading && (
            <View style={[styles.statusCard, styles.statusCardInfo]}>
              <View style={styles.statusRow}>
                <RefreshCw size={18} color="#1A73E8" />
                <Text style={styles.statusTitle}>Finding best offline route...</Text>
              </View>
              <Text style={styles.statusText}>{routeStatusMessage}</Text>
            </View>
          )}

          {showError && (
            <View style={[styles.statusCard, styles.statusCardError]}>
              <Text style={[styles.statusTitle, styles.statusTitleError]}>Route problem</Text>
              <Text style={styles.statusText}>{errorMessage}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => {
                  void calculateRoute();
                }}
              >
                <RefreshCw size={18} color="#FFFFFF" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {showRouteReady && (
            <View style={[styles.statusCard, styles.statusCardSuccess]}>
              <Text style={styles.statusTitle}>Route ready</Text>
              <Text style={styles.statusText}>{routeEntrySummary}</Text>

              <View style={styles.metricsRow}>
                <View style={styles.metricPill}>
                  <Clock size={15} color="#1A73E8" />
                  <Text style={styles.metricText}>ETA: {routeEta}</Text>
                </View>
                <View style={styles.metricPill}>
                  <Navigation size={15} color="#1A73E8" />
                  <Text style={styles.metricText}>Distance: {routeDistance}</Text>
                </View>
              </View>

              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  if (destination.sourceVersion === 'v2') {
                    // v2 destinations start navigation from HomeScreen's
                    // route-preview card (its own "Start Navigation" button) —
                    // this just reveals the map behind the sheet.
                    onClose();
                    return;
                  }
                  handleStartNavigation();
                  onStartLegacyNavigation();
                }}
              >
                <Text style={styles.primaryButtonText}>
                  {destination.sourceVersion === 'v2' ? 'Show route on map' : 'Start Navigation'}
                </Text>
              </Pressable>
            </View>
          )}
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
            <Pressable onPress={onCloseDetails} style={sheetStyles.detailsBackButton}>
              <ChevronLeft size={24} color="#5F6368" />
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
          </View>
          {!isDetails && (
            <Pressable onPress={onClose}>
              <X size={24} color="#5F6368" />
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
                <Clock size={14} color="#2E7D32" />
                <Text style={sheetStyles.infoChipText}>{walkingTimeMin} min walk</Text>
              </View>
            )}
            {entryPoints.length > 0 && (
              <View style={sheetStyles.infoChip}>
                <MapPin size={14} color="#2E7D32" />
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
                >
                  {__DEV__ && developerModeEnabled && <Text style={sheetStyles.entranceNodeText}>{gate.id}</Text>}
                  <Text style={sheetStyles.entranceChipText}>{gate.name.replace('Member Masjid Gate ', 'Gate ')}</Text>
                  {gate.urduName && <Text style={sheetStyles.entranceUrdu}>{gate.urduName}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <Pressable style={sheetStyles.takeMeButton} onPress={onOpenDirections}>
          <Navigation size={22} color="#FFFFFF" />
          <Text style={sheetStyles.takeMeText}>Directions</Text>
        </Pressable>

        <View style={sheetStyles.secondaryActions}>
          <Pressable style={sheetStyles.secondaryAction} onPress={onToggleFavorite}>
            <Star
              size={20}
              color={isFav ? '#FBC02D' : '#1A73E8'}
              fill={isFav ? '#FBC02D' : 'none'}
            />
            <Text style={sheetStyles.secondaryActionText}>{isFav ? 'Saved' : 'Save'}</Text>
          </Pressable>
          <Pressable
            style={sheetStyles.secondaryAction}
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
            <Share2 size={20} color="#1A73E8" />
            <Text style={sheetStyles.secondaryActionText}>Share</Text>
          </Pressable>
          {!isDetails && (
            <Pressable style={sheetStyles.secondaryAction} onPress={onShowDetails}>
              <MapPin size={20} color="#1A73E8" />
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
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#202124',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 14,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#202124',
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  destinationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
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
    color: '#202124',
  },
  destinationCategory: {
    fontSize: 13,
    color: '#5F6368',
  },
  linkButton: {
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A73E8',
  },
  startOption: {
    flexDirection: 'row',
    gap: 14,
    borderWidth: 1.5,
    borderColor: '#D7E3FC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  startOptionActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#1A73E8',
  },
  startOptionDisabled: {
    opacity: 0.56,
  },
  startOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF3FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startOptionIconActive: {
    backgroundColor: '#1A73E8',
  },
  startOptionBody: {
    flex: 1,
    gap: 4,
  },
  startOptionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A73E8',
  },
  startOptionTitleActive: {
    color: '#174EA6',
  },
  startOptionTitleDisabled: {
    color: '#6B7280',
  },
  startOptionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#5F6368',
  },
  startOptionSubtitleDisabled: {
    color: '#80868B',
  },
  manualSection: {
    gap: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: '#202124',
    backgroundColor: '#FFFFFF',
  },
  searchResults: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  searchItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  searchItemBody: {
    flex: 1,
    gap: 2,
  },
  searchItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#202124',
  },
  searchItemMeta: {
    fontSize: 13,
    color: '#5F6368',
  },
  emptySearchText: {
    fontSize: 14,
    color: '#5F6368',
  },
  statusCard: {
    borderRadius: 24,
    padding: 18,
    gap: 10,
    borderWidth: 1,
  },
  destinationWarningCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    gap: 4,
  },
  statusCardNeutral: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  statusCardWarning: {
    backgroundColor: '#FFF6E5',
    borderColor: '#F9AB00',
  },
  statusCardInfo: {
    backgroundColor: '#EEF3FD',
    borderColor: '#D7E3FC',
  },
  statusCardError: {
    backgroundColor: '#FDECEC',
    borderColor: '#F28B82',
  },
  statusCardSuccess: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7E3FC',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#202124',
  },
  statusTitleWarning: {
    color: '#7C4A03', // #B06000 on #FFF6E5 fails AA (4.33:1); #7C4A03 passes (6.89:1)
  },
  statusTitleError: {
    color: '#C5221F',
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#3C4043',
  },
  statusHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#5F6368',
  },
  metricsRow: {
    gap: 10,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF3FD',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#174EA6',
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: '#1A73E8',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  retryButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D93025',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
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
  placeName: { fontSize: 24, fontWeight: 'bold', color: '#202124' },
  placeUrdu: { fontSize: 18, color: '#2E7D32', marginTop: 2 },
  placeCategory: { fontSize: 14, color: '#70757A', marginTop: 4 },
  placeRole: { fontSize: 13, color: '#1A73E8', fontWeight: '700', marginTop: 4 },
  infoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  infoChipText: { fontSize: 13, color: '#2E7D32', fontWeight: '500' },
  detailsBlock: { marginBottom: 16 },
  entranceSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#5F6368', marginBottom: 8 },
  entranceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F1F3F4',
    marginRight: 8,
    minWidth: 120,
  },
  gateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#EA4335',
    marginRight: 8,
    minWidth: 132,
  },
  entranceChipActive: { backgroundColor: '#E8F0FE', borderWidth: 1.5, borderColor: '#1A73E8' },
  entranceNodeText: { fontSize: 13, color: '#202124', fontWeight: '800', marginBottom: 2 },
  entranceChipText: { fontSize: 14, color: '#3C4043', fontWeight: '500' },
  entranceChipTextActive: { color: '#1A73E8' },
  entranceUrdu: { fontSize: 12, color: '#888', marginTop: 2 },
  takeMeButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  takeMeText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.3 },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F3F4',
    paddingVertical: 12,
  },
  secondaryAction: { alignItems: 'center', gap: 4 },
  secondaryActionText: { fontSize: 12, color: '#1A73E8', fontWeight: '500' },
  placeDesc: { fontSize: 14, color: '#5F6368', lineHeight: 22 },
  placeWarningBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#E65100',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  placeWarningBannerText: { fontSize: 13, color: '#7C4A03', fontWeight: '600', lineHeight: 18 }, // #E65100 on #FFF3E0 fails AA (3.79:1); #7C4A03 passes (6.75:1)
});
