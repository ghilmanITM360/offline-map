/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Map as MapIcon, MapPin, Navigation, WifiOff, Footprints } from 'lucide-react-native';
import { useWelcomeViewModel } from '../../viewmodels/WelcomeViewModel';

const BENEFITS = [
  { icon: MapPin, text: 'See where you are' },
  { icon: Navigation, text: 'Navigate to blocks and gates' },
  { icon: WifiOff, text: 'Venue routes work offline' },
  { icon: Footprints, text: 'Get walking directions' },
];

export function WelcomeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const onboardingStatusReadFailed = Boolean(route.params?.onboardingStatusReadFailed);
  const { continueFromWelcome } = useWelcomeViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <MapIcon size={64} color="#2E7D32" />
          </View>
          <Text style={styles.title}>Welcome to Ijtema Map</Text>
          <Text style={styles.urduTitle}>اجتماع میپ میں خوش آمدید</Text>
          {onboardingStatusReadFailed && (
            <Text style={styles.notice}>We couldn't confirm your previous setup, so we're showing this again.</Text>
          )}
          <Text style={styles.description}>
            Find blocks, gates, and routes easily.{'\n'}Works even without internet.
          </Text>

          <View style={styles.featureList}>
            {BENEFITS.map(({ icon: Icon, text }) => (
              <View key={text} style={styles.featureItem}>
                <Icon size={24} color="#2E7D32" />
                <Text style={styles.featureText}>{text}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={styles.button}
            onPress={() => continueFromWelcome(navigation)}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.buttonText}>Continue</Text>
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
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 6,
  },
  urduTitle: {
    fontSize: 17,
    color: '#2E7D32',
    textAlign: 'center',
    marginBottom: 18,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  notice: {
    fontSize: 13,
    color: '#946500',
    textAlign: 'center',
    marginBottom: 12,
  },
  featureList: {
    width: '100%',
    marginBottom: 36,
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
