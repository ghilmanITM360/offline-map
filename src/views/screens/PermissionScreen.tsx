/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MapPin, ShieldCheck } from 'lucide-react-native';
import { usePermissionViewModel } from '../../viewmodels/PermissionViewModel';
import { staticColors } from '../../theme';

export function PermissionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Set only when SplashScreen routes a returning, already-onboarded user back here —
  // i.e. location access was granted before and has since been revoked outside the
  // app. WelcomeViewModel's first-time Continue -> Permission transition passes no
  // params, so this stays falsy on a genuine first ask (#153 Finding 2).
  const isReturningAfterRevocation = Boolean(route.params?.revoked);
  const { loading, requestPermission, skipPermission } = usePermissionViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <MapPin size={72} color="#2E7D32" />
          </View>
          <Text style={styles.title}>Find your location</Text>
          <Text style={styles.description}>
            {isReturningAfterRevocation
              ? 'Allow location access so we can show where you are and guide you to your destination. If you already allowed this before, it may have been turned off.'
              : 'Allow location access so we can show where you are and guide you to your destination.'}
          </Text>
          <Text style={styles.consequenceNote}>
            Without it, you can still explore the map, but live navigation won't work.
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <ShieldCheck size={24} color="#2E7D32" />
              <Text style={styles.featureText}>Current location on map</Text>
            </View>
            <View style={styles.featureItem}>
              <ShieldCheck size={24} color="#2E7D32" />
              <Text style={styles.featureText}>Walking navigation</Text>
            </View>
            <View style={styles.featureItem}>
              <ShieldCheck size={24} color="#2E7D32" />
              <Text style={styles.featureText}>Turn-by-turn guidance</Text>
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
              <Text style={styles.buttonText}>Allow Location</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={() => skipPermission(navigation)}
            disabled={loading}
          >
            <Text style={styles.skipText}>Continue Without Location</Text>
          </Pressable>
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
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  content: {
    padding: 30,
    alignItems: 'center',
  },
  iconContainer: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
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
    marginBottom: 8,
  },
  consequenceNote: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 28,
  },
  featureList: {
    width: '100%',
    marginBottom: 34,
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
    backgroundColor: staticColors.focusedBlock,
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
