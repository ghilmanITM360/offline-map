/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Map as MapIcon, MapPin, Navigation, WifiOff, Footprints } from 'lucide-react-native';
import { useWelcomeViewModel } from '../../viewmodels/WelcomeViewModel';
import { Button } from '../components/common/Button';
import { staticColors } from '../../theme';

const BENEFITS = [
  { icon: MapPin, text: 'Find your location' },
  { icon: Navigation, text: 'Navigate to blocks and gates' },
  { icon: WifiOff, text: 'Use offline maps' },
  { icon: Footprints, text: 'Get walking directions' },
];

export function WelcomeScreen() {
  const navigation = useNavigation<any>();
  const { continueFromWelcome } = useWelcomeViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <MapIcon size={64} color={staticColors.success} />
          </View>
          <Text style={styles.title}>Welcome to Karachi Ijtema Navigation</Text>
          <Text style={styles.urduTitle}>کراچی اجتماع نیویگیشن میں خوش آمدید</Text>
          <Text style={styles.description}>
            Find blocks, gates, and routes easily.{'\n'}Works even without internet.
          </Text>

          <View style={styles.featureList}>
            {BENEFITS.map(({ icon: Icon, text }) => (
              <View key={text} style={styles.featureItem}>
                <Icon size={24} color={staticColors.success} />
                <Text style={styles.featureText}>{text}</Text>
              </View>
            ))}
          </View>

          <Button label="Continue" onPress={() => continueFromWelcome(navigation)} />
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
    backgroundColor: staticColors.lightGreenSubtext,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: staticColors.drawerText,
    textAlign: 'center',
    marginBottom: 6,
  },
  urduTitle: {
    fontSize: 17,
    color: staticColors.success,
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
});
