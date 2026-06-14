/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, BackHandler, Platform, Alert, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, LocalTile, Camera, Polygon } from 'react-native-maps';
import { X, Navigation, Volume2, VolumeX, ArrowLeft, ArrowRight, MapPin, RefreshCw, LocateFixed } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Paths } from 'expo-file-system'; // fixed: use Paths API instead of deprecated documentDirectory
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../../store/useAppStore';
import { useNavigationViewModel } from '../../viewmodels/NavigationViewModel';
import { useNavigationViewModelV2 } from '../../viewmodels/NavigationViewModelV2';
import { InstructionService } from '../../services/InstructionService';
import { RoutePointService } from '../../services/RoutePointService';
import { useTheme } from '../../services/useTheme';
import { MapConfigService } from '../../services/MapConfigService';
import { RoutingService } from '../../services/RoutingService';
import { MapFeatureFlagsService } from '../../services/MapFeatureFlagsService';
import { V2MapRenderingService } from '../../services/V2MapRenderingService';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { IJTEMA_DATA, MAP_BOUNDS } from '../../constants/data';
import { IJTEMA_MAP_REGION } from '../../data/ijtema';

type NavigationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Navigation'>; // fixed: type stack navigation on the navigation screen

const getTilePath = (): string => `${Paths.document.uri}tiles/{z}_{x}_{y}.png`; // fixed: lazy getter defers Paths.document access to render time so the native module is ready

function StepIcon({ type, size = 32 }: { type: string; size?: number }) {
  const color = '#FFFFFF';
  switch (type) {
    case 'left':    return <ArrowLeft size={size} color={color} />;
    case 'right':   return <ArrowRight size={size} color={color} />;
    case 'arrival': return <MapPin size={size} color={color} />;
    default:        return <Navigation size={size} color={color} />;
  }
}

export function NavigationScreen() {
  const activeRoute = useAppStore((s) => s.activeRoute);
  const isV2ActiveRoute = activeRoute?.sourceVersion === 'v2';
  const useV2Navigation = Boolean(
    activeRoute && activeRoute.sourceVersion === 'v2' && MapFeatureFlagsService.useIjtemaV2Navigation(),
  );

  if (isV2ActiveRoute && !useV2Navigation) {
    return <NavigationScreenV2Disabled />;
  }

  return useV2Navigation ? <NavigationScreenV2 /> : <NavigationScreenV1 />;
}

function NavigationScreenV2Disabled() {
  const nav = useNavigation<NavigationScreenNavigationProp>();
  const stopNavigation = useAppStore((s) => s.stopNavigation);

  useEffect(() => {
    stopNavigation();
  }, [stopNavigation]);

  return (
    <SafeAreaView style={styles.disabledNavigationContainer}>
      <Text style={styles.disabledNavigationTitle}>V2 navigation is disabled</Text>
      <Text style={styles.disabledNavigationText}>Return to directions and keep this route in Preview Only mode.</Text>
      <Pressable style={styles.disabledNavigationButton} onPress={() => nav.reset({ index: 0, routes: [{ name: 'Main' }] })}>
        <Text style={styles.disabledNavigationButtonText}>Back to Map</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function NavigationScreenV1() {
  const nav = useNavigation<NavigationScreenNavigationProp>();
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const offlineData = useAppStore((s) => s.offlineData);
  const settings = useAppStore((s) => s.settings);
  const hasInternet = useAppStore((s) => s.hasInternet);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const theme = useTheme();
  const navBg = theme.background;
  const hasGoogleMapsKey = MapConfigService.isGoogleMapsKeyConfigured();
  const userPulseAnim = useRef(new Animated.Value(0)).current;
  const [isAutoFollowing, setIsAutoFollowing] = useState(settings.autoFollowLocation);
  const [mapReady, setMapReady] = useState(false);
  const [initialCameraFitDone, setInitialCameraFitDone] = useState(false);
  const [cameraFitReason, setCameraFitReason] = useState<'route' | 'venue' | 'user' | null>(null);

  const {
    destination,
    currentLocation,
    snappedLocation,
    route,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted,
    remainingDistance,
    arrived,
    reroutePending,
    isWeakGps,
    rerouteStatusMessage,
    handleExit,
  } = useNavigationViewModel();
  const startCoordinate = route?.coordinates[0] ?? null;
  const venueBoundary = [
    { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.minLng },
    { latitude: MAP_BOUNDS.minLat, longitude: MAP_BOUNDS.maxLng },
    { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.maxLng },
    { latitude: MAP_BOUNDS.maxLat, longitude: MAP_BOUNDS.minLng },
  ];
  const graphOnlyFallbackUsed = !hasGoogleMapsKey || !hasInternet;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(userPulseAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(userPulseAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [userPulseAnim]);

  // Confirm exit on Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Exit navigation?', 'Do you want to stop navigation and return to map?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => handleExit(nav) },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [handleExit, nav]);

  // Guard — if destination disappears, exit
  useEffect(() => {
    if (!destination) nav.goBack();
  }, [destination]);

  useEffect(() => {
    setIsAutoFollowing(settings.autoFollowLocation);
  }, [destination, settings.autoFollowLocation]);

  useEffect(() => {
    setInitialCameraFitDone(false);
  }, [route?.id]);

  useEffect(() => {
    if (!mapReady || initialCameraFitDone || !mapRef.current) return;
    if (route?.coordinates && route.coordinates.length > 1) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 90, right: 64, bottom: 220, left: 64 },
        animated: true,
      });
      setCameraFitReason('route');
      setInitialCameraFitDone(true);
      return;
    }
    mapRef.current.fitToCoordinates(venueBoundary, {
      edgePadding: { top: 48, right: 48, bottom: 160, left: 48 },
      animated: true,
    });
    setCameraFitReason('venue');
    setInitialCameraFitDone(true);
  }, [initialCameraFitDone, mapReady, route?.coordinates]);

  // Heading-up camera following
  useEffect(() => {
    if (isAutoFollowing && snappedLocation && mapRef.current) {
      const snappedInsideVenue = RoutingService.isInsideVenue(snappedLocation);
      if (!snappedInsideVenue && route?.coordinates && route.coordinates.length > 1) {
        return;
      }
      const camera: Partial<Camera> = {
        center: {
          latitude: snappedLocation.latitude,
          longitude: snappedLocation.longitude,
        },
        zoom: 18,
        heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0), // fixed: lock heading when north-up mode is enabled
        pitch: 30,
      };
      mapRef.current.animateCamera(camera as Camera, { duration: 800 });
      setCameraFitReason('user');
    }
  }, [isAutoFollowing, route?.coordinates, settings.keepNorthFixed, snappedLocation]); // fixed: react to north-up setting changes while navigating

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const destinationCoordinate = RoutePointService.getDestinationCoordinate(destination);

  const arrivalTime = new Date(
    Date.now() + (route?.estimatedTimeMin ?? 0) * 60_000
  ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.container, { backgroundColor: navBg }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' && hasGoogleMapsKey ? PROVIDER_GOOGLE : undefined} // fixed: allow graph-only rendering without Google key
        mapType={hasGoogleMapsKey && hasInternet ? (offlineData.isDownloaded ? 'none' : settings.mapMode) : 'none'}
        showsUserLocation={false}
        showsMyLocationButton={false}
        rotateEnabled={!settings.keepNorthFixed} // fixed: disable free rotation when north-up mode is enabled
        onMapReady={() => {
          setMapReady(true);
          if (__DEV__) {
            console.log('[Navigation][Render]', {
              mapReady: true,
              graphOverlayReady: true,
              routePolylineCount: route?.coordinates?.length ?? 0,
              startMarkerReady: !!startCoordinate,
              userMarkerReady: !!snappedLocation,
              destinationMarkerReady: !!destinationCoordinate,
              graphOnlyFallbackUsed,
              cameraFitReason,
            });
          }
        }}
        onPanDrag={() => setIsAutoFollowing(false)}
        initialRegion={{
          latitude: currentLocation?.latitude ?? IJTEMA_MAP_REGION.latitude,
          longitude: currentLocation?.longitude ?? IJTEMA_MAP_REGION.longitude,
          latitudeDelta: 0.002,
          longitudeDelta: 0.002,
        }}
      >
        {offlineData.isDownloaded && (
          <LocalTile pathTemplate={getTilePath()} tileSize={256} zIndex={-1} />
        )}

        {/* Venue boundary */}
        <Polygon
          coordinates={venueBoundary}
          fillColor="rgba(232,245,233,0.06)"
          strokeColor="rgba(46,125,50,0.48)"
          strokeWidth={2}
          zIndex={0}
        />

        {/* Block polygons */}
        {Object.values(IJTEMA_DATA.blocks).map((block) => (
          <Polygon
            key={`nav_block_${block.id}`}
            coordinates={block.corners ?? block.polygon}
            fillColor={block.id === destination?.id ? 'rgba(46,125,50,0.2)' : 'rgba(46,125,50,0.08)'}
            strokeColor={block.id === destination?.id ? '#2E7D32' : 'rgba(95,99,104,0.45)'}
            strokeWidth={block.id === destination?.id ? 2 : 1}
            zIndex={0}
          />
        ))}

        {IJTEMA_DATA.edges.map((edge, idx) => {
          const from = IJTEMA_DATA.nodes[edge.from];
          const to = IJTEMA_DATA.nodes[edge.to];
          if (!from || !to) return null;
          const coordinates = [
            { latitude: from.lat, longitude: from.lng },
            { latitude: to.lat, longitude: to.lng },
          ];
          return (
            <React.Fragment key={`nav_edge_${edge.from}_${edge.to}_${idx}`}>
              <Polyline coordinates={coordinates} strokeColor="rgba(60,64,67,0.38)" strokeWidth={7} zIndex={1} />
              <Polyline coordinates={coordinates} strokeColor="rgba(255,255,255,0.86)" strokeWidth={4} zIndex={2} />
            </React.Fragment>
          );
        })}

        {route && (
          <>
            <Polyline
              coordinates={route.coordinates}
              strokeColor="rgba(13,71,161,0.72)"
              strokeWidth={11}
              lineDashPattern={reroutePending ? [10, 5] : undefined}
              zIndex={20}
            />
            <Polyline
              coordinates={route.coordinates}
              strokeColor="#1A73E8"
              strokeWidth={7}
              lineDashPattern={reroutePending ? [10, 5] : undefined}
              zIndex={21}
            />
          </>
        )}

        {startCoordinate && (
          <Marker coordinate={startCoordinate} title="Start" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.startMarkerWrap}>
              <View style={styles.startMarkerDot} />
              <View style={styles.startMarkerLabel}>
                <Text style={styles.startMarkerLabelText}>START</Text>
              </View>
            </View>
          </Marker>
        )}

        {destination && destinationCoordinate && (
          <Marker coordinate={destinationCoordinate} title={destination.name} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.destinationMarker}>
              <MapPin size={34} color="#EA4335" fill="#EA4335" />
            </View>
          </Marker>
        )}

        {snappedLocation && (
          <Marker coordinate={snappedLocation} flat anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.userMarkerWrap}>
              <Animated.View
                style={[
                  styles.userMarkerPulse,
                  {
                    opacity: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0] }),
                    transform: [{ scale: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                  },
                ]}
              />
              <View style={styles.userMarker}>
                <Navigation size={12} color="#FFFFFF" />
              </View>
              {currentLocationSource === 'remembered' && (
                <View style={styles.rememberedLabel}>
                  <Text style={styles.rememberedLabelText}>last known</Text>
                </View>
              )}
            </View>
          </Marker>
        )}
      </MapView>
      {!hasGoogleMapsKey && (
        <View style={styles.mapUnavailableBanner}>
          <Text style={styles.mapUnavailableText}>{MapConfigService.getMissingGoogleMapsMessage()}</Text>
        </View>
      )}
      {!mapReady && (
        <View style={styles.mapLoadingOverlay}>
          <Text style={styles.mapLoadingText}>Venue map loading...</Text>
        </View>
      )}

      {/* Top instruction card */}
      <SafeAreaView style={styles.topBar}>
        {isWeakGps && (
          <View style={styles.weakGpsBanner}>
            <Text style={styles.weakGpsText}>Weak GPS signal detected. Route updates may be slower.</Text>
          </View>
        )}
        {rerouteStatusMessage && !reroutePending && (
          <View style={styles.rerouteHintBanner}>
            <Text style={styles.rerouteHintText}>{rerouteStatusMessage}</Text>
          </View>
        )}
        {reroutePending ? (
          <View style={[styles.instructionCard, styles.rerouteCard]}>
            <RefreshCw size={28} color="#FFFFFF" />
            <Text style={styles.rerouteText}>Recalculating…</Text>
          </View>
        ) : currentStep && !arrived ? (
          <View style={styles.instructionCard}>
            <View style={styles.instructionIcon}>
              <StepIcon type={currentStep.type} size={32} />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionDistance}>
                {currentStep.distance > 0
                  ? InstructionService.formatDistance(currentStep.distance, settings.distanceUnit)
                  : ''}
              </Text>
              <Text style={styles.instructionText} numberOfLines={2} ellipsizeMode="tail">{currentStep.text}</Text>
              {nextStep && (
                <Text style={styles.nextStepText} numberOfLines={1}>
                  Then: {nextStep.text}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setIsMuted(!isMuted)} style={styles.muteButton}>
              {isMuted ? <VolumeX size={24} color="#FFFFFF" /> : <Volume2 size={24} color="#FFFFFF" />}
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      {/* Bottom info bar */}
      {!arrived && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.tripInfo}>
            <View style={styles.tripTextWrap}>
              <Text style={styles.timeRemaining}>
                {route ? `${route.estimatedTimeMin} min` : '— min'}
              </Text>
              <Text style={styles.distanceRemaining}>
                {remainingDistance > 0
                  ? InstructionService.formatDistance(remainingDistance, settings.distanceUnit)
                  : route
                  ? InstructionService.formatDistance(route.totalDistance, settings.distanceUnit)
                  : '—'}{' '}
                · ETA {arrivalTime}
              </Text>
              <Text style={styles.destName} numberOfLines={1}>{destination?.name}</Text>
            </View>
            <Pressable style={styles.exitButton} onPress={() => handleExit(nav)}>
              <X size={20} color="#FFFFFF" />
              <Text style={styles.exitText}>Exit</Text>
            </Pressable>
          </View>
        </View>
      )}

      {snappedLocation && (
        <Pressable
          style={[styles.recenterButton, { bottom: Math.max(insets.bottom, 12) + 140 }]}
          onPress={() => {
            if (!mapRef.current) return;
            setIsAutoFollowing(true);
            mapRef.current.animateCamera(
              {
                center: {
                  latitude: snappedLocation.latitude,
                  longitude: snappedLocation.longitude,
                },
                zoom: 18,
                heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0),
                pitch: 30,
              },
              { duration: 500 },
            );
          }}
        >
          <LocateFixed size={20} color="#1A73E8" />
        </Pressable>
      )}

      {/* Arrival overlay */}
      <Modal visible={arrived} transparent animationType="slide">
        <View style={styles.arrivedOverlay}>
          <View style={styles.arrivedCard}>
            <MapPin size={52} color="#2E7D32" />
            <Text style={styles.arrivedTitle}>You've Arrived!</Text>
            <Text style={styles.arrivedUrdu}>منزل پر پہنچ گئے</Text>
            <Text style={styles.arrivedSubtitle}>{destination?.name}</Text>
            <Pressable style={styles.arrivedButton} onPress={() => handleExit(nav)}>
              <Text style={styles.arrivedButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NavigationScreenV2() {
  const nav = useNavigation<NavigationScreenNavigationProp>();
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const offlineData = useAppStore((s) => s.offlineData);
  const settings = useAppStore((s) => s.settings);
  const hasInternet = useAppStore((s) => s.hasInternet);
  const currentLocationSource = useAppStore((s) => s.currentLocationSource);
  const developerMode = useAppStore((s) => s.developerModeEnabled);
  const theme = useTheme();
  const hasGoogleMapsKey = MapConfigService.isGoogleMapsKeyConfigured();
  const userPulseAnim = useRef(new Animated.Value(0)).current;
  const [isAutoFollowing, setIsAutoFollowing] = useState(settings.autoFollowLocation);
  const [mapReady, setMapReady] = useState(false);
  const [initialCameraFitDone, setInitialCameraFitDone] = useState(false);

  const {
    destination,
    currentLocation,
    snappedLocation,
    route,
    instructions,
    currentStepIndex,
    isMuted,
    setIsMuted,
    remainingDistance,
    etaMinutes,
    arrived,
    reroutePending,
    isWeakGps,
    rerouteStatusMessage,
    handleExit,
  } = useNavigationViewModelV2();

  const v2MapLayers = useMemo(
    () => V2MapRenderingService.getHomeLayers({
      selectedPlaceId: route?.destination.blockId ?? destination?.id,
      selectedPlace: destination,
      developerMode: __DEV__ && developerMode,
      graphOnlyFallback: !hasGoogleMapsKey || !hasInternet,
    }),
    [destination, developerMode, hasGoogleMapsKey, hasInternet, route?.destination.blockId],
  );

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(userPulseAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(userPulseAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [userPulseAnim]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Exit navigation?', 'Do you want to stop navigation and return to map?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => handleExit(nav) },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [handleExit, nav]);

  useEffect(() => {
    if (!route) nav.goBack();
  }, [nav, route]);

  useEffect(() => {
    setInitialCameraFitDone(false);
  }, [route?.routeId]);

  useEffect(() => {
    if (!mapReady || initialCameraFitDone || !mapRef.current) return;
    if (route?.coordinates && route.coordinates.length > 1) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 90, right: 64, bottom: 220, left: 64 },
        animated: true,
      });
      setInitialCameraFitDone(true);
      return;
    }
    mapRef.current.fitToCoordinates(v2MapLayers.venueBoundary, {
      edgePadding: { top: 48, right: 48, bottom: 160, left: 48 },
      animated: true,
    });
    setInitialCameraFitDone(true);
  }, [initialCameraFitDone, mapReady, route?.coordinates, v2MapLayers.venueBoundary]);

  useEffect(() => {
    if (isAutoFollowing && snappedLocation && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: snappedLocation,
          zoom: 18,
          heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0),
          pitch: 30,
        } as Camera,
        { duration: 800 },
      );
    }
  }, [isAutoFollowing, settings.keepNorthFixed, snappedLocation]);

  if (!route) return null;

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const startCoordinate = route.origin.coordinate;
  const destinationCoordinate = route.destination.coordinate;
  const graphOnlyFallbackUsed = (!hasGoogleMapsKey || !hasInternet) && v2MapLayers.graphOnlyFallbackSupported;
  const arrivalTime = new Date(Date.now() + Math.max(etaMinutes, 0) * 60_000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' && hasGoogleMapsKey ? PROVIDER_GOOGLE : undefined}
        mapType={hasGoogleMapsKey && hasInternet ? (offlineData.isDownloaded ? 'none' : settings.mapMode) : 'none'}
        showsUserLocation={false}
        showsMyLocationButton={false}
        rotateEnabled={!settings.keepNorthFixed}
        onMapReady={() => {
          setMapReady(true);
          if (__DEV__) {
            console.log('[NavigationV2][Render]', {
              mapReady: true,
              graphOverlayReady: true,
              routePolylineCount: route.coordinates.length,
              startMarkerReady: !!startCoordinate,
              userMarkerReady: !!snappedLocation,
              destinationMarkerReady: !!destinationCoordinate,
              selectedBlockHighlightReady: v2MapLayers.blocks.some((block) => block.isSelected),
              graphOnlyFallbackUsed,
            });
          }
        }}
        onPanDrag={() => setIsAutoFollowing(false)}
        initialRegion={{
          latitude: currentLocation?.latitude ?? IJTEMA_MAP_REGION.latitude,
          longitude: currentLocation?.longitude ?? IJTEMA_MAP_REGION.longitude,
          latitudeDelta: IJTEMA_MAP_REGION.latitudeDelta,
          longitudeDelta: IJTEMA_MAP_REGION.longitudeDelta,
        }}
      >
        {offlineData.isDownloaded && <LocalTile pathTemplate={getTilePath()} tileSize={256} zIndex={-1} />}

        <Polygon
          coordinates={v2MapLayers.venueBoundary}
          fillColor="rgba(232,245,233,0.06)"
          strokeColor="rgba(46,125,50,0.48)"
          strokeWidth={2}
          zIndex={0}
        />

        {v2MapLayers.rastas.map((rasta) => (
          <React.Fragment key={`nav_v2_rasta_${rasta.id}`}>
            <Polyline coordinates={rasta.polyline} strokeColor="rgba(60,64,67,0.38)" strokeWidth={7} zIndex={1} />
            <Polyline coordinates={rasta.polyline} strokeColor={rasta.isSelected ? '#1A73E8' : 'rgba(255,255,255,0.86)'} strokeWidth={rasta.isSelected ? 5 : 4} zIndex={2} />
          </React.Fragment>
        ))}

        {v2MapLayers.specialRoutes.map((specialRoute) => (
          <Polyline
            key={`nav_v2_special_${specialRoute.id}`}
            coordinates={specialRoute.polyline}
            strokeColor={specialRoute.isSelected ? '#8E24AA' : 'rgba(142,36,170,0.48)'}
            strokeWidth={specialRoute.isSelected ? 5 : 3}
            zIndex={3}
          />
        ))}

        {v2MapLayers.blocks.map((block) => (
          <Polygon
            key={`nav_v2_block_${block.id}`}
            coordinates={block.polygon}
            fillColor={block.isSelected ? 'rgba(46,125,50,0.26)' : 'rgba(46,125,50,0.08)'}
            strokeColor={block.isSelected ? '#2E7D32' : 'rgba(95,99,104,0.45)'}
            strokeWidth={block.isSelected ? 2.5 : 1}
            zIndex={4}
          />
        ))}

        {v2MapLayers.gates.map((gate) => (
          <Marker key={`nav_v2_gate_${gate.id}`} coordinate={gate.coordinate} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <View style={[styles.previewGateLabel, gate.needsConnectorVerification && styles.previewGateLabelWarning]}>
              <Text style={styles.previewLabelText}>{gate.label.replace('Gate ', 'G')}</Text>
            </View>
          </Marker>
        ))}

        <Polyline
          coordinates={route.coordinates}
          strokeColor="rgba(13,71,161,0.72)"
          strokeWidth={11}
          lineDashPattern={reroutePending ? [10, 5] : undefined}
          zIndex={20}
        />
        <Polyline
          coordinates={route.coordinates}
          strokeColor="#1A73E8"
          strokeWidth={7}
          lineDashPattern={reroutePending ? [10, 5] : undefined}
          zIndex={21}
        />

        <Marker coordinate={startCoordinate} title={route.origin.label} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.startMarkerWrap}>
            <View style={styles.startMarkerDot} />
            <View style={styles.startMarkerLabel}>
              <Text style={styles.startMarkerLabelText}>START</Text>
            </View>
          </View>
        </Marker>

        <Marker coordinate={destinationCoordinate} title={route.destination.label} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.destinationMarker}>
            <MapPin size={34} color="#EA4335" fill="#EA4335" />
          </View>
        </Marker>

        {snappedLocation && (
          <Marker coordinate={snappedLocation} flat anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.userMarkerWrap}>
              <Animated.View
                style={[
                  styles.userMarkerPulse,
                  {
                    opacity: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0] }),
                    transform: [{ scale: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                  },
                ]}
              />
              <View style={styles.userMarker}>
                <Navigation size={12} color="#FFFFFF" />
              </View>
              {currentLocationSource === 'remembered' && (
                <View style={styles.rememberedLabel}>
                  <Text style={styles.rememberedLabelText}>last known</Text>
                </View>
              )}
            </View>
          </Marker>
        )}
      </MapView>

      {!hasGoogleMapsKey && (
        <View style={styles.mapUnavailableBanner}>
          <Text style={styles.mapUnavailableText}>
            {graphOnlyFallbackUsed ? 'Graph-only v2 map is active. Base map tiles are unavailable.' : MapConfigService.getMissingGoogleMapsMessage()}
          </Text>
        </View>
      )}
      {route.metadata.startedOutside && route.metadata.entryGateId && (
        <View style={styles.v2EntryGateBanner}>
          <Text style={styles.v2EntryGateText}>Route starts from {route.origin.label}.</Text>
        </View>
      )}
      {!mapReady && (
        <View style={styles.mapLoadingOverlay}>
          <Text style={styles.mapLoadingText}>Venue map loading...</Text>
        </View>
      )}

      <SafeAreaView style={styles.topBar}>
        {isWeakGps && (
          <View style={styles.weakGpsBanner}>
            <Text style={styles.weakGpsText}>Weak GPS signal detected. Route updates may be slower.</Text>
          </View>
        )}
        {rerouteStatusMessage && !reroutePending && (
          <View style={styles.rerouteHintBanner}>
            <Text style={styles.rerouteHintText}>{rerouteStatusMessage}</Text>
          </View>
        )}
        {reroutePending ? (
          <View style={[styles.instructionCard, styles.rerouteCard]}>
            <RefreshCw size={28} color="#FFFFFF" />
            <Text style={styles.rerouteText}>Recalculating...</Text>
          </View>
        ) : currentStep && !arrived ? (
          <View style={styles.instructionCard}>
            <View style={styles.instructionIcon}>
              <StepIcon type={currentStep.type} size={32} />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionDistance}>
                {currentStep.distanceM > 0 ? InstructionService.formatDistance(currentStep.distanceM, settings.distanceUnit) : ''}
              </Text>
              <Text style={styles.instructionText} numberOfLines={2} ellipsizeMode="tail">{currentStep.text}</Text>
              {nextStep && (
                <Text style={styles.nextStepText} numberOfLines={1}>
                  Then: {nextStep.text}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setIsMuted(!isMuted)} style={styles.muteButton}>
              {isMuted ? <VolumeX size={24} color="#FFFFFF" /> : <Volume2 size={24} color="#FFFFFF" />}
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      {!arrived && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.tripInfo}>
            <View style={styles.tripTextWrap}>
              <Text style={styles.timeRemaining}>{etaMinutes} min</Text>
              <Text style={styles.distanceRemaining}>
                {InstructionService.formatDistance(remainingDistance, settings.distanceUnit)} · ETA {arrivalTime}
              </Text>
              <Text style={styles.destName} numberOfLines={1}>{route.destination.label}</Text>
            </View>
            <Pressable style={styles.exitButton} onPress={() => handleExit(nav)}>
              <X size={20} color="#FFFFFF" />
              <Text style={styles.exitText}>Exit</Text>
            </Pressable>
          </View>
        </View>
      )}

      {snappedLocation && (
        <Pressable
          style={[styles.recenterButton, { bottom: Math.max(insets.bottom, 12) + 140 }]}
          onPress={() => {
            if (!mapRef.current) return;
            setIsAutoFollowing(true);
            mapRef.current.animateCamera(
              {
                center: snappedLocation,
                zoom: 18,
                heading: settings.keepNorthFixed ? 0 : (snappedLocation.heading ?? 0),
                pitch: 30,
              } as Camera,
              { duration: 500 },
            );
          }}
        >
          <LocateFixed size={20} color="#1A73E8" />
        </Pressable>
      )}

      <Modal visible={arrived} transparent animationType="slide">
        <View style={styles.arrivedOverlay}>
          <View style={styles.arrivedCard}>
            <MapPin size={52} color="#2E7D32" />
            <Text style={styles.arrivedTitle}>You've Arrived!</Text>
            <Text style={styles.arrivedUrdu}>منزل پر پہنچ گئے</Text>
            <Text style={styles.arrivedSubtitle}>{route.destination.label}</Text>
            <Pressable style={styles.arrivedButton} onPress={() => handleExit(nav)}>
              <Text style={styles.arrivedButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  disabledNavigationContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  disabledNavigationTitle: {
    color: '#202124',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  disabledNavigationText: {
    color: '#5F6368',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  disabledNavigationButton: {
    borderRadius: 28,
    backgroundColor: '#1A73E8',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  disabledNavigationButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapUnavailable: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#E8EAED',
  },
  mapUnavailableBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  mapLoadingOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,249,250,0.42)',
  },
  mapLoadingText: {
    color: '#202124',
    fontSize: 14,
    fontWeight: '700',
  },
  mapUnavailableTitle: {
    color: '#202124',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  mapUnavailableText: {
    color: '#5F6368',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  previewGateLabel: {
    backgroundColor: 'rgba(26,115,232,0.92)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  previewGateLabelWarning: {
    backgroundColor: 'rgba(245,124,0,0.95)',
  },
  previewLabelText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  v2EntryGateBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 108,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(232,245,233,0.96)',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  v2EntryGateText: {
    color: '#1B5E20',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  weakGpsBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F29900',
  },
  weakGpsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  rerouteHintBanner: {
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FBC02D',
  },
  rerouteHintText: {
    color: '#8D6E63',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  instructionCard: {
    backgroundColor: '#2E7D32',
    margin: 12,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  rerouteCard: {
    backgroundColor: '#F57C00',
    justifyContent: 'center',
    gap: 12,
  },
  rerouteText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  instructionIcon: {
    marginRight: 16,
    width: 40,
    alignItems: 'center',
  },
  instructionTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  instructionDistance: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  instructionText: {
    fontSize: 17,
    color: '#E8F5E9',
    marginTop: 2,
  },
  nextStepText: {
    fontSize: 13,
    color: '#A5D6A7',
    marginTop: 6,
  },
  muteButton: {
    padding: 10,
    marginLeft: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  tripInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  tripTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  timeRemaining: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  distanceRemaining: {
    fontSize: 15,
    color: '#5F6368',
    marginTop: 2,
  },
  destName: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  exitButton: {
    backgroundColor: '#D32F2F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 28,
    gap: 8,
  },
  exitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  userMarkerWrap: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A73E8',
  },
  rememberedLabel: {
    marginTop: 2,
    backgroundColor: 'rgba(26,115,232,0.92)',
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rememberedLabelText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  destinationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  startMarkerWrap: {
    alignItems: 'center',
  },
  startMarkerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0B8043',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  startMarkerLabel: {
    marginTop: 3,
    backgroundColor: 'rgba(11,128,67,0.92)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  startMarkerLabelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  recenterButton: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  arrivedOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  arrivedCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 36,
    alignItems: 'center',
    elevation: 20,
  },
  arrivedTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#202124',
    marginTop: 16,
  },
  arrivedUrdu: {
    fontSize: 18,
    color: '#2E7D32',
    marginTop: 4,
  },
  arrivedSubtitle: {
    fontSize: 16,
    color: '#5F6368',
    marginTop: 6,
    textAlign: 'center',
  },
  arrivedButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 28,
    paddingHorizontal: 48,
    paddingVertical: 16,
    marginTop: 28,
  },
  arrivedButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
