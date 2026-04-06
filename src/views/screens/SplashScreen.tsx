/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store/useAppStore';
import { ConnectivityService } from '../../services/ConnectivityService';

export function SplashScreen() {
  const navigation = useNavigation<any>();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { offlineData } = useAppStore();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: true,
    }).start();

    const checkStatus = async () => {
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 2000));

      const isConnected = await ConnectivityService.isConnected();

      if (!isConnected && !offlineData.isDownloaded) {
        navigation.replace('Error', {
          title: 'No Internet Connection',
          message: 'You need an internet connection to download the offline map for the first time.',
          type: 'connectivity'
        });
        return;
      }

      if (!offlineData.isDownloaded) {
        navigation.replace('Permission');
      } else {
        navigation.replace('Main');
      }
    };

    checkStatus();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Image
          source={{ uri: 'https://picsum.photos/seed/map/200/200' }}
          style={styles.logo}
        />
        <Text style={styles.title}>Ijtema Map</Text>
        <Text style={styles.subtitle}>Offline Navigation Guide</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#E8F5E9',
    marginTop: 8,
  },
});
