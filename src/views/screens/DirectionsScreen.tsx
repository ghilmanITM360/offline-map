/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ArrowRight, MapPin, Navigation } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useDirectionsViewModel } from '../../viewmodels/DirectionsViewModel';

export function DirectionsScreen() {
  const navigation = useNavigation<any>();
  const routeParams = useRoute<any>();
  const { destination } = routeParams.params || {};
  
  const {
    route,
    instructions,
    origin,
    setOrigin,
    handleStartNavigation,
  } = useDirectionsViewModel(destination);

  return (
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
            value={origin}
            onChangeText={setOrigin}
            placeholder="Choose starting point"
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
        {route ? (
          <View style={styles.routeCard}>
            <View style={styles.routeInfo}>
              <View>
                <Text style={styles.routeTime}>{route.estimatedTimeMin} min</Text>
                <Text style={styles.routeDistance}>{route.totalDistance} m</Text>
              </View>
              <Pressable 
                style={styles.startButton}
                onPress={() => handleStartNavigation(navigation)}
              >
                <Navigation size={20} color="#FFFFFF" />
                <Text style={styles.startButtonText}>Start</Text>
              </Pressable>
            </View>
            <Text style={styles.routeDesc}>Fastest route, mostly flat</Text>
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
                <Text style={styles.stepDist}>{step.distance}m</Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
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
  routeTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  routeDistance: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
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
