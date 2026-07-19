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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { ChevronLeft, Clock, Footprints, LocateFixed, MapPin, Navigation, RefreshCw } from 'lucide-react-native';

import { useDirectionsViewModel } from '../../viewmodels/DirectionsViewModel';
import { InstructionService } from '../../services/InstructionService';
import { SearchService } from '../../services/SearchService';
import { useAppStore } from '../../store/useAppStore';
import { Place, RoutePreview } from '../../models/types';
import { RoutingService } from '../../services/RoutingService';

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

export function DirectionsScreen({ destination, onClose }: { destination: Place; onClose: () => void }) {
  const currentLocation = useAppStore((s) => s.currentLocation);
  const lastKnownLocation = useAppStore((s) => s.lastKnownLocation);
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);
  const walkingSpeed = useAppStore((s) => s.settings.walkingSpeed ?? 1.4);

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
    !RoutingService.isInsideVenue(startCoordinate);
  const routeMeta = route as RoutePreviewWithV2Meta | null;
  const entryGateName = routeMeta?.startResolution?.gate?.name?.en ?? null;
  const routeDistance = route ? InstructionService.formatDistance(route.totalDistance, distanceUnit) : null;
  const routeEta = route ? `${route.estimatedTimeMin} min` : null;
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
                <View style={styles.metricPill}>
                  <Footprints size={15} color="#1A73E8" />
                  <Text style={styles.metricText}>Walking speed: {walkingSpeed.toFixed(1)} m/s</Text>
                </View>
              </View>

              <Pressable
                style={styles.primaryButton}
                onPress={onClose}
              >
                <Text style={styles.primaryButtonText}>Show route on map</Text>
              </Pressable>
            </View>
          )}
        </BottomSheetScrollView>
      </KeyboardAvoidingView>
    </View>
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
    color: '#B06000',
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
