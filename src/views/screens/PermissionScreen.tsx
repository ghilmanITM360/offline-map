/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MapPin, ShieldCheck } from 'lucide-react-native';
import { usePermissionViewModel } from '../../viewmodels/PermissionViewModel';

export function PermissionScreen() {
  const navigation = useNavigation<any>();
  const { loading, requestPermission, skipPermission } = usePermissionViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MapPin size={80} color="#2E7D32" />
        </View>
        <Text style={styles.title}>Location Access</Text>
        <Text style={styles.description}>
          To provide accurate navigation and show your current position on the map, we need your location permission.
        </Text>
        
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <ShieldCheck size={24} color="#2E7D32" />
            <Text style={styles.featureText}>Real-time GPS tracking</Text>
          </View>
          <View style={styles.featureItem}>
            <ShieldCheck size={24} color="#2E7D32" />
            <Text style={styles.featureText}>Voice-guided directions</Text>
          </View>
          <View style={styles.featureItem}>
            <ShieldCheck size={24} color="#2E7D32" />
            <Text style={styles.featureText}>Offline map support</Text>
          </View>
        </View>

        <Pressable 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={() => requestPermission(navigation)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Grant Permission</Text>
          )}
        </Pressable>
        
        <Pressable 
          style={styles.skipButton} 
          onPress={() => skipPermission(navigation)}
          disabled={loading}
        >
          <Text style={styles.skipText}>Maybe Later</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  featureList: {
    width: '100%',
    marginBottom: 50,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  featureText: {
    fontSize: 16,
    color: '#444',
    marginLeft: 15,
  },
  button: {
    backgroundColor: '#2E7D32',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 20,
  },
  skipText: {
    color: '#666',
    fontSize: 16,
  },
});
