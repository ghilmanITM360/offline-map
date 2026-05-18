/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, BackHandler, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, LocalTile, Camera } from 'react-native-maps';
import { X, Navigation, Volume2, VolumeX, ArrowLeft, ArrowRight, MapPin, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Paths } from 'expo-file-system'; // fixed: use Paths API instead of deprecated documentDirectory
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../../store/useAppStore';
import { useNavigationViewModel } from '../../viewmodels/NavigationViewModel';
import { InstructionService } from '../../services/InstructionService';
import { RoutePointService } from '../../services/RoutePointService';
import { useTheme } from '../../services/useTheme';
import { MapConfigService } from '../../services/MapConfigService';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { IJTEMA_DATA } from '../../constants/data';

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
  const nav = useNavigation<NavigationScreenNavigationProp>();
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const offlineData = useAppStore((s) => s.offlineData);
  const settings = useAppStore((s) => s.settings);
  const theme = useTheme();
  const navBg = theme.background;
  const hasGoogleMapsKey = MapConfigService.isGoogleMapsKeyConfigured();

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
    handleExit,
  } = useNavigationViewModel();

  // Disable Android hardware back button during navigation
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Guard — if destination disappears, exit
  useEffect(() => {
    if (!destination) nav.goBack();
  }, [destination]);

  // Heading-up camera following
  useEffect(() => {
    if (snappedLocation && mapRef.current) {
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
    }
  }, [settings.keepNorthFixed, snappedLocation]); // fixed: react to north-up setting changes while navigating

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];
  const destinationCoordinate = RoutePointService.getDestinationCoordinate(destination);

  const arrivalTime = new Date(
    Date.now() + (route?.estimatedTimeMin ?? 0) * 60_000
  ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.container, { backgroundColor: navBg }]}>
      {hasGoogleMapsKey ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} // fixed: avoid forcing Google provider on iOS
          showsUserLocation={true}
          showsMyLocationButton={false}
          rotateEnabled={!settings.keepNorthFixed} // fixed: disable free rotation when north-up mode is enabled
          initialRegion={{
            latitude: currentLocation?.latitude ?? 24.9685,
            longitude: currentLocation?.longitude ?? 67.0015,
            latitudeDelta: 0.002,
            longitudeDelta: 0.002,
          }}
        >
        {offlineData.isDownloaded && (
          <LocalTile pathTemplate={getTilePath()} tileSize={256} zIndex={-1} />
        )}

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

        {destination && destinationCoordinate && (
          <Marker coordinate={destinationCoordinate} title={destination.name} pinColor="#2E7D32" />
        )}

        {snappedLocation && (
          <Marker coordinate={snappedLocation} flat anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.snappedDot} />
          </Marker>
        )}
        </MapView>
      ) : (
        <View style={styles.mapUnavailable}>
          <Text style={styles.mapUnavailableTitle}>Map unavailable</Text>
          <Text style={styles.mapUnavailableText}>{MapConfigService.getMissingGoogleMapsMessage()}</Text>
        </View>
      )}

      {/* Top instruction card */}
      <SafeAreaView style={styles.topBar}>
        {isWeakGps && (
          <View style={styles.weakGpsBanner}>
            <Text style={styles.weakGpsText}>Weak GPS signal detected. Route updates may be slower.</Text>
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
              <Text style={styles.instructionText}>{currentStep.text}</Text>
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
            <View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    maxWidth: 200,
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
  snappedDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
    borderWidth: 3,
    borderColor: '#FFFFFF',
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
