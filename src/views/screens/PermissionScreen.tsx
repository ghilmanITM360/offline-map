/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MapPin, ShieldCheck } from 'lucide-react-native';
import { usePermissionViewModel } from '../../viewmodels/PermissionViewModel';
import { Button } from '../components/common/Button';
import { staticColors } from '../../theme';

export function PermissionScreen() {
  const navigation = useNavigation<any>();
  const { loading, requestPermission, skipPermission } = usePermissionViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <MapPin size={72} color={staticColors.success} />
          </View>
          <Text style={styles.title}>Find your location</Text>
          <Text style={styles.description}>
            Allow location access so we can show where you are and guide you to your destination.
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <ShieldCheck size={24} color={staticColors.success} />
              <Text style={styles.featureText}>Current location on map</Text>
            </View>
            <View style={styles.featureItem}>
              <ShieldCheck size={24} color={staticColors.success} />
              <Text style={styles.featureText}>Walking navigation</Text>
            </View>
            <View style={styles.featureItem}>
              <ShieldCheck size={24} color={staticColors.success} />
              <Text style={styles.featureText}>Turn-by-turn guidance</Text>
            </View>
          </View>

          <Button label="Allow Location" onPress={() => requestPermission(navigation)} loading={loading} />

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
    backgroundColor: staticColors.lightGreenSubtext,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: staticColors.drawerText,
    marginBottom: 15,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
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
  skipButton: {
    marginTop: 20,
  },
  skipText: {
    color: '#666',
    fontSize: 16,
  },
});
