/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ArrowRight, MapPin, Navigation, Clock, Footprints } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDirectionsViewModel } from '../../viewmodels/DirectionsViewModel';
import { InstructionService } from '../../services/InstructionService';
import { useAppStore } from '../../store/useAppStore';
import { RootStackParamList } from '../../navigation/RootNavigator';

export function DirectionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Directions'>>();
  const routeParams = useRoute<RouteProp<RootStackParamList, 'Directions'>>();
  const { destination } = routeParams.params;
  const distanceUnit = useAppStore((s) => s.settings.distanceUnit);

  const {
    route,
    alternatives,
    selectedIndex,
    selectAlternative,
    instructions,
    originLabel,
    handleStartNavigation,
  } = useDirectionsViewModel(destination);

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
