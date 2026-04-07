/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, Modal } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, LocalTile } from 'react-native-maps';
import { X, Navigation, Volume2, VolumeX, ArrowLeft, ArrowRight, MapPin } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import { useAppStore } from '../../store/useAppStore';
import { useNavigationViewModel } from '../../viewmodels/NavigationViewModel';

const tilePathTemplate = `${FileSystem.documentDirectory}tiles/{z}_{x}_{y}.png`;

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
  const navigation = useNavigation<any>();
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
    handleExit,
  } = useNavigationViewModel();

  useEffect(() => {
    if (!destination) {
      navigation.goBack();
    }
  }, [destination]);

  useEffect(() => {
    if (snappedLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...snappedLocation,
        latitudeDelta: 0.002,
        longitudeDelta: 0.002,
      }, 1000);
    }
  }, [snappedLocation]);

  const currentStep = instructions[currentStepIndex];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={true}
        followsUserLocation={true}
        showsMyLocationButton={false}
        initialRegion={{
          latitude: currentLocation?.latitude || 24.9685,
          longitude: currentLocation?.longitude || 67.0015,
          latitudeDelta: 0.002,
          longitudeDelta: 0.002,
        }}
      >
        {offlineData.isDownloaded && (
          <LocalTile pathTemplate={tilePathTemplate} tileSize={256} zIndex={-1} />
        )}
        {route && (
          <Polyline
            coordinates={route.coordinates}
            strokeColor="#2E7D32"
            strokeWidth={6}
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

      {/* Top Navigation Bar */}
      <SafeAreaView style={styles.topBar}>
        {currentStep && !arrived && (
          <View style={styles.instructionCard}>
            <View style={styles.instructionIcon}>
              <StepIcon type={currentStep.type} />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionDistance}>{currentStep.distance} m</Text>
              <Text style={styles.instructionText}>{currentStep.text}</Text>
            </View>
            <Pressable onPress={() => setIsMuted(!isMuted)} style={styles.muteButton}>
              {isMuted ? <VolumeX size={24} color="#FFFFFF" /> : <Volume2 size={24} color="#FFFFFF" />}
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      {/* Bottom Info Bar */}
      {!arrived && (
        <View style={styles.bottomBar}>
          <View style={styles.tripInfo}>
            <View>
              <Text style={styles.timeRemaining}>
                {route ? route.estimatedTimeMin : '--'} min
              </Text>
              <Text style={styles.distanceRemaining}>
                {remainingDistance > 0 ? remainingDistance : (route ? route.totalDistance : '--')} m
                {' • '}
                {new Date(Date.now() + (route?.estimatedTimeMin || 0) * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Pressable style={styles.exitButton} onPress={() => handleExit(navigation)}>
              <X size={24} color="#FFFFFF" />
              <Text style={styles.exitText}>Exit</Text>
            </Pressable>
          </View>
          <View style={styles.dragHandle} />
        </View>
      )}

      {/* Destination Reached Overlay */}
      <Modal visible={arrived} transparent animationType="fade">
        <View style={styles.arrivedOverlay}>
          <View style={styles.arrivedCard}>
            <MapPin size={52} color="#2E7D32" />
            <Text style={styles.arrivedTitle}>You've Arrived!</Text>
            <Text style={styles.arrivedSubtitle}>{destination?.name}</Text>
            <Pressable style={styles.arrivedButton} onPress={() => handleExit(navigation)}>
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
    margin: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 8,
  },
  instructionIcon: {
    marginRight: 16,
  },
  instructionTextContainer: {
    flex: 1,
  },
  instructionDistance: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  instructionText: {
    fontSize: 18,
    color: '#E8F5E9',
    marginTop: 2,
  },
  muteButton: {
    padding: 8,
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
    paddingBottom: 30,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  distanceRemaining: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  exitButton: {
    backgroundColor: '#D32F2F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  exitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 15,
  },
  snappedDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4285F4',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  arrivedOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrivedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    marginHorizontal: 32,
    elevation: 20,
  },
  arrivedTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#202124',
    marginTop: 16,
  },
  arrivedSubtitle: {
    fontSize: 16,
    color: '#5F6368',
    marginTop: 6,
    textAlign: 'center',
  },
  arrivedButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 25,
    paddingHorizontal: 40,
    paddingVertical: 14,
    marginTop: 28,
  },
  arrivedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
