/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ChevronLeft, ArrowRight, MapPin, Navigation, Clock, Footprints, LocateFixed, RefreshCw } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDirectionsViewModel } from '../../viewmodels/DirectionsViewModel';
import { InstructionService } from '../../services/InstructionService';
import { RoutePointService } from '../../services/RoutePointService';
import { useAppStore } from '../../store/useAppStore';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { IJTEMA_DATA, MAP_BOUNDS } from '../../constants/data';
import { SearchService } from '../../services/SearchService';
import { Place } from '../../models/types';
import { MapConfigService } from '../../services/MapConfigService';
import { RoutingService } from '../../services/RoutingService';

export function DirectionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Directions'>>();
  const routeParams = useRoute<RouteProp<RootStackParamList, 'Directions'>>();
  const { destination } = routeParams.params;
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);
  const clearRoutePlanner = useAppStore((s) => s.clearRoutePlanner);
  const currentLocation = useAppStore((s) => s.currentLocation);
  const hasGoogleMapsKey = MapConfigService.isGoogleMapsKeyConfigured();
  const insets = useSafeAreaInsets();
  const previewMapRef = useRef<MapView>(null);
  const [startSearch, setStartSearch] = useState('');

  const {
    route,
    alternatives,
    selectedIndex,
    selectAlternative,
    instructions,
    originLabel,
    handleStartNavigation,
    loadState,
    errorMessage,
    setManualStartPlace,
    chooseCurrentLocation,
    calculateRoute,
    useCurrentStart,
  } = useDirectionsViewModel(destination);

  const startCoordinate = route?.coordinates[0] ?? (currentLocation ?? null);
  const endNodeId = route?.nodes[route.nodes.length - 1];
  const destinationCoordinate =
    RoutePointService.nodeToCoordinate(endNodeId) ?? RoutePointService.getDestinationCoordinate(destination);

  const startCandidates = useMemo(() => {
    if (startSearch.trim().length < 2) return [];
    return SearchService.search(startSearch, currentLocation ?? undefined)
      .filter((candidate) => candidate.id !== destination.id)
      .slice(0, 8);
  }, [currentLocation, destination.id, startSearch]);

  const showNeedStartMessage = loadState === 'needs_origin';
  const showLoading = loadState === 'loading';
  const showError = loadState === 'error';
  const outsideVenue = currentLocation ? !RoutingService.isInsideVenue(currentLocation) : false;

  useEffect(() => {
    if (!hasGoogleMapsKey || !previewMapRef.current) return;

    if (route?.coordinates && route.coordinates.length > 1) {
      previewMapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 52, right: 52, bottom: 52, left: 52 },
        animated: true,
      });
      return;
    }

    if (destinationCoordinate) {
      previewMapRef.current.animateToRegion(
        {
          latitude: destinationCoordinate.latitude,
          longitude: destinationCoordinate.longitude,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        },
        400,
      );
      return;
    }

    previewMapRef.current.animateToRegion(
      {
        latitude: (MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2,
        longitude: (MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2,
        latitudeDelta: MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat + 0.003,
        longitudeDelta: MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng + 0.003,
      },
      400,
    );
  }, [destinationCoordinate, hasGoogleMapsKey, route?.coordinates]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={28} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>Directions</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 18) + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inputCard}>
            <Text style={styles.fieldLabel}>FROM</Text>
            <View style={styles.inputRow}>
              <View style={styles.dotOrigin} />
              <TextInput
                style={styles.input}
                value={originLabel}
                editable={false}
                placeholder="Choose starting point"
              />
            </View>

            <View style={styles.startActionsRow}>
              <Pressable
                style={[styles.startActionBtn, useCurrentStart && styles.startActionBtnActive]}
                onPress={() => {
                  chooseCurrentLocation();
                  void calculateRoute();
                }}
              >
                <LocateFixed size={16} color={useCurrentStart ? '#FFFFFF' : '#1A73E8'} />
                <Text style={[styles.startActionText, useCurrentStart && styles.startActionTextActive]}>Use My Current Location</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.searchStartInput}
              value={startSearch}
              onChangeText={setStartSearch}
              placeholder="Search start point"
              placeholderTextColor="#888"
            />

            {startCandidates.length > 0 && (
              <View style={styles.startSearchResults}>
                {startCandidates.map((candidate: Place) => (
                  <Pressable
                    key={candidate.id}
                    style={styles.startSearchItem}
                    onPress={() => {
                      setManualStartPlace(candidate);
                      setStartSearch(candidate.name);
                      void calculateRoute();
                    }}
                  >
                    <MapPin size={16} color="#5F6368" />
                    <View style={styles.startSearchTextWrap}>
                      <Text style={styles.startSearchName}>{candidate.name}</Text>
                      <Text style={styles.startSearchCategory}>{candidate.category}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabelTo}>TO</Text>
            <View style={styles.inputRow}>
              <MapPin size={20} color="#2E7D32" />
              <TextInput
                style={styles.input}
                value={destination?.name || ''}
                placeholder="Choose destination"
                editable={false}
              />
            </View>
            <Pressable style={styles.changeDestinationButton} onPress={() => navigation.goBack()}>
              <Text style={styles.changeDestinationText}>Change Destination</Text>
            </Pressable>
          </View>

          {outsideVenue && (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>You are outside the Ijtema area.</Text>
              <Text style={styles.warningDesc}>Choose a starting point inside the ground or use the nearest gate.</Text>
            </View>
          )}

          <View style={styles.mapPreviewWrap}>
            {hasGoogleMapsKey ? (
              <MapView
                ref={previewMapRef}
                style={styles.mapPreview}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                initialRegion={{
                  latitude: (MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2,
                  longitude: (MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2,
                  latitudeDelta: MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat + 0.003,
                  longitudeDelta: MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng + 0.003,
                }}
                scrollEnabled
                zoomEnabled
                rotateEnabled={false}
                pitchEnabled={false}
              >
                {Object.values(IJTEMA_DATA.blocks).map((block) => (
                  <Polygon
                    key={`preview_block_${block.id}`}
                    coordinates={block.corners ?? block.polygon}
                    fillColor={block.id === destination.id ? 'rgba(46,125,50,0.34)' : 'rgba(46,125,50,0.12)'}
                    strokeColor={block.id === destination.id ? '#2E7D32' : '#5F6368'}
                    strokeWidth={block.id === destination.id ? 2.5 : 1}
                  />
                ))}
                {IJTEMA_DATA.edges.map((edge, idx) => {
                  const from = IJTEMA_DATA.nodes[edge.from];
                  const to = IJTEMA_DATA.nodes[edge.to];
                  if (!from || !to) return null;
                  const coords = [
                    { latitude: from.lat, longitude: from.lng },
                    { latitude: to.lat, longitude: to.lng },
                  ];
                  return (
                    <React.Fragment key={`preview_edge_${edge.from}_${edge.to}_${idx}`}>
                      <Polyline coordinates={coords} strokeColor="rgba(60,64,67,0.44)" strokeWidth={6} zIndex={1} />
                      <Polyline coordinates={coords} strokeColor="rgba(255,255,255,0.88)" strokeWidth={3.8} zIndex={2} />
                    </React.Fragment>
                  );
                })}
                {route && (
                  <>
                    <Polyline coordinates={route.coordinates} strokeColor="rgba(13,71,161,0.72)" strokeWidth={9} zIndex={20} />
                    <Polyline coordinates={route.coordinates} strokeColor="#1A73E8" strokeWidth={5} zIndex={21} />
                  </>
                )}
                {startCoordinate && <Marker coordinate={startCoordinate} pinColor="#1A73E8" title="Start" />}
                {destinationCoordinate && (
                  <Marker coordinate={destinationCoordinate} pinColor="#2E7D32" title={destination.name} />
                )}
              </MapView>
            ) : (
              <View style={styles.mapUnavailable}>
                <Text style={styles.mapUnavailableTitle}>Map preview unavailable</Text>
                <Text style={styles.mapUnavailableText}>{MapConfigService.getMissingGoogleMapsMessage()}</Text>
              </View>
            )}
          </View>

          {alternatives.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.altTabScrollView}
              contentContainerStyle={styles.altTabContent}
            >
              {alternatives.map((alt, idx) => (
                <Pressable
                  key={alt.label}
                  style={[styles.altTab, selectedIndex === idx && styles.altTabActive]}
                  onPress={() => selectAlternative(idx)}
                >
                  <Text style={[styles.altTabLabel, selectedIndex === idx && styles.altTabLabelActive]}>
                    {alt.label}
                  </Text>
                  <Text style={[styles.altTabTime, selectedIndex === idx && styles.altTabTimeActive]}>
                    {alt.route.estimatedTimeMin} min
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {showNeedStartMessage && (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Choose starting point</Text>
              <Text style={styles.infoDesc}>
                GPS is unavailable right now. Select a starting point manually to continue.
              </Text>
            </View>
          )}

          {showLoading && (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Calculating route...</Text>
              <Text style={styles.infoDesc}>Please wait while we find the best walking path.</Text>
            </View>
          )}

          {showError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>{errorMessage ?? 'Could not calculate route.'}</Text>
              <Pressable style={styles.retryButton} onPress={() => void calculateRoute()}>
                <RefreshCw size={16} color="#FFFFFF" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {route && loadState === 'ready' && (
            <View style={styles.routeCard}>
              <View style={styles.routeInfo}>
                <View style={styles.routeMetrics}>
                  <View style={styles.routeMetric}>
                    <Clock size={16} color="#2E7D32" />
                    <Text style={styles.routeTime}>{route.estimatedTimeMin} min</Text>
                  </View>
                  <View style={styles.routeMetric}>
                    <Footprints size={16} color="#5F6368" />
                    <Text style={styles.routeDistance}>
                      {InstructionService.formatDistance(route.totalDistance, distanceUnit)}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={styles.startButton}
                  onPress={() => handleStartNavigation(navigation)}
                >
                  <Navigation size={20} color="#FFFFFF" />
                  <Text style={styles.startButtonText}>Start Navigation</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.stepsSection}>
            <Text style={styles.stepsTitle}>Steps</Text>
            {instructions.length === 0 ? (
              <Text style={styles.emptyStepsText}>
                {route ? 'No step instructions generated for this route.' : 'Select a valid start and destination to see route steps.'}
              </Text>
            ) : (
              instructions.map((step, index) => (
                <View key={`${step.type}_${index}`} style={styles.stepItem}>
                  {step.type === 'arrival' ? (
                    <MapPin size={20} color="#2E7D32" />
                  ) : (
                    <ArrowRight size={20} color="#666" />
                  )}
                  <Text style={styles.stepText}>{step.text}</Text>
                  {step.distance > 0 && (
                    <Text style={styles.stepDist}>
                      {InstructionService.formatDistance(step.distance, distanceUnit)}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>

          {route && loadState === 'ready' && (
            <Pressable
              style={styles.clearRouteButton}
              onPress={() => {
                clearRoutePlanner();
                navigation.goBack();
              }}
            >
              <Text style={styles.clearRouteText}>Clear route</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
    color: '#333',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },
  inputCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    padding: 12,
  },
  fieldLabel: {
    color: '#5F6368',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 8,
  },
  fieldLabelTo: {
    color: '#5F6368',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dotOrigin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4285F4',
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    marginLeft: 10,
  },
  startActionsRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 8,
  },
  startActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A73E8',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },
  startActionBtnActive: {
    backgroundColor: '#1A73E8',
  },
  startActionText: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '700',
  },
  startActionTextActive: {
    color: '#FFFFFF',
  },
  searchStartInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  startSearchResults: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 4,
    overflow: 'hidden',
  },
  startSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECECEC',
    gap: 8,
  },
  startSearchTextWrap: {
    flex: 1,
  },
  startSearchName: {
    fontSize: 14,
    color: '#202124',
    fontWeight: '600',
  },
  startSearchCategory: {
    fontSize: 12,
    color: '#666',
  },
  changeDestinationButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  changeDestinationText: {
    color: '#1A73E8',
    fontWeight: '700',
    fontSize: 13,
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  warningTitle: {
    color: '#92400E',
    fontWeight: '700',
    fontSize: 14,
  },
  warningDesc: {
    color: '#92400E',
    fontSize: 13,
    marginTop: 4,
  },
  mapPreviewWrap: {
    height: 230,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E8EAED',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  mapPreview: {
    flex: 1,
  },
  mapUnavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#E8EAED',
  },
  mapUnavailableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 6,
  },
  mapUnavailableText: {
    fontSize: 13,
    color: '#5F6368',
    textAlign: 'center',
    lineHeight: 18,
  },
  altTabScrollView: { marginTop: 2 },
  altTabContent: { gap: 10, paddingVertical: 4 },
  altTab: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
    minWidth: 90,
  },
  altTabActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#2E7D32',
  },
  altTabLabel: { fontSize: 13, fontWeight: '600', color: '#5F6368' },
  altTabLabelActive: { color: '#2E7D32' },
  altTabTime: { fontSize: 12, color: '#70757A', marginTop: 2 },
  altTabTimeActive: { color: '#2E7D32' },
  routeCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
  },
  routeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeMetrics: { gap: 6 },
  routeMetric: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeTime: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  routeDistance: {
    fontSize: 15,
    color: '#666',
  },
  startButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 2,
    gap: 8,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: '#E8F0FE',
    borderRadius: 10,
    padding: 12,
  },
  infoTitle: {
    color: '#1A73E8',
    fontWeight: '700',
    fontSize: 14,
  },
  infoDesc: {
    color: '#3C4043',
    fontSize: 13,
    marginTop: 4,
  },
  errorCard: {
    backgroundColor: '#FCE8E6',
    borderRadius: 10,
    padding: 12,
  },
  errorTitle: {
    color: '#B3261E',
    fontWeight: '700',
    fontSize: 14,
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#D32F2F',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  stepsSection: {
    marginTop: 2,
  },
  stepsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyStepsText: {
    color: '#666',
    fontSize: 14,
    paddingVertical: 8,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  stepText: {
    fontSize: 15,
    color: '#444',
    marginLeft: 14,
    flex: 1,
  },
  stepDist: {
    fontSize: 13,
    color: '#999',
  },
  clearRouteButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FCE8E6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clearRouteText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '700',
  },
});
