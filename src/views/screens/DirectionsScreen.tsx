/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ChevronLeft, ArrowRight, MapPin, Navigation, Clock, Footprints } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDirectionsViewModel } from '../../viewmodels/DirectionsViewModel';
import { InstructionService } from '../../services/InstructionService';
import { RoutePointService } from '../../services/RoutePointService';
import { useAppStore } from '../../store/useAppStore';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { IJTEMA_DATA } from '../../constants/data';

export function DirectionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Directions'>>();
  const routeParams = useRoute<RouteProp<RootStackParamList, 'Directions'>>();
  const { destination } = routeParams.params;
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);
  const clearRoutePlanner = useAppStore((s) => s.clearRoutePlanner);
  const setRoutePlannerDest = useAppStore((s) => s.setRoutePlannerDest);

  const {
    route,
    alternatives,
    selectedIndex,
    selectAlternative,
    instructions,
    originLabel,
    handleStartNavigation,
  } = useDirectionsViewModel(destination);

  const startCoordinate = route?.coordinates[0];
  const endNodeId = route?.nodes[route.nodes.length - 1];
  const destinationCoordinate =
    RoutePointService.nodeToCoordinate(endNodeId) ?? RoutePointService.getDestinationCoordinate(destination);
  const previewCenter = startCoordinate ?? destinationCoordinate ?? destination.coordinate;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <ChevronLeft size={28} color="#333" />
          </Pressable>
          <Text style={styles.headerTitle}>Directions</Text>
        </View>

        <View style={styles.searchSection}>
          <View style={styles.inputRow}>
            <View style={styles.dotOrigin} />
            <TextInput
              style={styles.input}
              value={originLabel}
              editable={false}
              placeholder="Current location"
            />
          </View>
          <View style={styles.verticalLine} />
          <View style={styles.inputRow}>
            <MapPin size={20} color="#2E7D32" />
            <TextInput
              style={styles.input}
              value={destination?.name || ''}
              placeholder="Choose destination"
              editable={false}
            />
          </View>
        </View>

        <View style={styles.mapPreviewWrap}>
          <MapView
            style={styles.mapPreview}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={{
              latitude: previewCenter.latitude,
              longitude: previewCenter.longitude,
              latitudeDelta: 0.006,
              longitudeDelta: 0.006,
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
                fillColor={block.id === destination.id ? 'rgba(251,188,5,0.28)' : 'rgba(46,125,50,0.12)'}
                strokeColor={block.id === destination.id ? '#F29900' : '#2E7D32'}
                strokeWidth={block.id === destination.id ? 2 : 1}
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
                  <Polyline coordinates={coords} strokeColor="rgba(60,64,67,0.42)" strokeWidth={6} zIndex={1} />
                  <Polyline coordinates={coords} strokeColor="rgba(255,255,255,0.86)" strokeWidth={4} zIndex={2} />
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
        </View>

        <ScrollView style={styles.content}>
          {/* Route alternative tabs */}
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

          {route ? (
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
                  <Text style={styles.startButtonText}>Start</Text>
                </Pressable>
              </View>
              {alternatives[selectedIndex] && (
                <Text style={styles.routeDesc}>{alternatives[selectedIndex].label} route</Text>
              )}
              {route.nodes.length > 0 && (
                <Text style={styles.routeNodes} numberOfLines={2}>
                  Nodes: {route.nodes.join(' -> ')}
                </Text>
              )}
              <Pressable
                style={styles.clearRouteButton}
                onPress={() => {
                  clearRoutePlanner();
                  setRoutePlannerDest(null);
                  navigation.goBack();
                }}
              >
                <Text style={styles.clearRouteText}>Clear route</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Calculating best route...</Text>
            </View>
          )}

          <View style={styles.stepsSection}>
            <Text style={styles.stepsTitle}>Steps</Text>
            {instructions.map((step, index) => (
              <View key={index} style={styles.stepItem}>
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
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 16,
    color: '#333',
  },
  searchSection: {
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  mapPreviewWrap: {
    height: 260,
    margin: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E8EAED',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  mapPreview: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
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
    fontSize: 16,
    color: '#333',
    marginLeft: 10,
  },
  verticalLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E0E0E0',
    marginLeft: 16,
    marginVertical: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  // --- Route alternative tabs ---
  altTabScrollView: { marginBottom: 16 },
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
  // --- Route summary card ---
  routeCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
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
    fontSize: 16,
    color: '#666',
  },
  startButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 3,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  routeDesc: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    fontStyle: 'italic',
  },
  routeNodes: {
    marginTop: 8,
    fontSize: 12,
    color: '#3C4043',
  },
  clearRouteButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearRouteText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '700',
  },
  stepsSection: {
    marginTop: 10,
  },
  stepsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  stepText: {
    fontSize: 16,
    color: '#444',
    marginLeft: 16,
    flex: 1,
  },
  stepDist: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
});
