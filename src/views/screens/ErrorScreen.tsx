/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Button } from '../components/common/Button';
import { staticColors } from '../../theme';

export function ErrorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { title, message, type } = route.params || {
    title: 'Error',
    message: 'An unexpected error occurred.',
    type: 'general'
  };

  const handleRetry = () => {
    navigation.replace('Splash');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {type === 'connectivity' ? (
            <WifiOff size={64} color={staticColors.danger} />
          ) : (
            <AlertTriangle size={64} color={staticColors.danger} />
          )}
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <Button
          label="Retry"
          onPress={handleRetry}
          icon={<RefreshCw size={20} color={staticColors.white} />}
          style={styles.retryButton}
        />

        <Pressable style={styles.backButton} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main')}>
          <Text style={styles.backText}>Go Back</Text>
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
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: staticColors.drawerText,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  retryButton: {
    marginBottom: 4,
  },
  backButton: {
    padding: 12,
  },
  backText: {
    color: '#666',
    fontSize: 16,
  },
});
