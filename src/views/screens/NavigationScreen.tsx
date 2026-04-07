/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, LocalTile, Camera } from 'react-native-maps';
import { X, Navigation, Volume2, VolumeX, ArrowLeft, ArrowRight, MapPin, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppStore } from '../../store/useAppStore';
import { useNavigationViewModel } from '../../viewmodels/NavigationViewModel';

const TILE_PATH = `${FileSystem.documentDirectory}tiles/{z}_{x}_{y}.png`;

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
  const nav = useNavigation<any>();
  const mapRef = useRef<MapView>(null);
  const { offlineData } = useAppStore();

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
        heading: snappedLocation.heading ?? 0,
        pitch: 30,
      };
      mapRef.current.animateCamera(camera as Camera, { duration: 800 });
    }
  }, [snappedLocation]);

  const currentStep = instructions[currentStepIndex];
  const nextStep = instructions[currentStepIndex + 1];

  const arrivalTime = new Date(
    Date.now() + (route?.estimatedTimeMin ?? 0) * 60_000
  ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={true}
        showsMyLocationButton={false}
        rotateEnabled={true}
        initialRegion={{
          latitude: currentLocation?.latitude ?? 24.9685,
          longitude: currentLocation?.longitude ?? 67.0015,
          latitudeDelta: 0.002,
          longitudeDelta: 0.002,
        }}
      >
        {offlineData.isDownloaded && (
          <LocalTile pathTemplate={TILE_PATH} tileSize={256} zIndex={-1} />
        )}

        {route && (
          <Polyline
            coordinates={route.coordinates}
            strokeColor="#1A73E8"
            strokeWidth={7}
            lineDashPattern={reroutePending ? [10, 5] : undefined}
          />
        )}

        {destination && (
          <Marker coordinate={destination.coordinate} title={destination.name} />
        )}

        {snappedLocation && (
          <Marker coordinate={snappedLocation} flat anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.snappedDot} />
          </Marker>
        )}
      </MapView>

      {/* Top instruction card */}
      <SafeAreaView style={styles.topBar}>
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
                {currentStep.distance > 0 ? `${currentStep.distance} m` : ''}
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
        <View style={styles.bottomBar}>
          <View style={styles.tripInfo}>
            <View>
              <Text style={styles.timeRemaining}>
                {route ? `${route.estimatedTimeMin} min` : '— min'}
              </Text>
              <Text style={styles.distanceRemaining}>
                {remainingDistance > 0
                  ? `${remainingDistance} m`
                  : route
                  ? `${route.totalDistance} m`
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
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
