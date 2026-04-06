/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Download, Wifi, Database, AlertTriangle } from 'lucide-react-native';
import { useDownloadMapViewModel } from '../../viewmodels/DownloadMapViewModel';

export function DownloadMapScreen() {
  const navigation = useNavigation<any>();
  const { progress, status, error, startDownload } = useDownloadMapViewModel();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Offline Maps</Text>
          <Text style={styles.subtitle}>Download map data for offline use</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Database size={24} color="#2E7D32" />
            <Text style={styles.cardTitle}>Ijtema Ground Map</Text>
          </View>
          <Text style={styles.cardSize}>Size: 45.2 MB</Text>
          <Text style={styles.cardDesc}>Includes all blocks, masjids, gates, and navigation paths.</Text>
          
          {progress > 0 ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { width: `${progress * 100}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>{Math.round(progress * 100)}% Downloaded</Text>
              <Text style={styles.statusText}>{status}</Text>
            </View>
          ) : (
            <Pressable style={styles.downloadButton} onPress={() => startDownload(navigation)}>
              <Download size={20} color="#FFFFFF" />
              <Text style={styles.downloadText}>Download Now</Text>
            </Pressable>
          )}

          {error && (
            <View style={styles.errorBox}>
              <AlertTriangle size={20} color="#D32F2F" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Wifi size={20} color="#666" />
          <Text style={styles.infoText}>Recommended to use Wi-Fi for downloading.</Text>
        </View>

        {progress === 0 && (
          <Pressable style={styles.skipButton} onPress={() => navigation.replace('Main')}>
            <Text style={styles.skipText}>Skip for now (Online only)</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 12,
  },
  cardSize: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginBottom: 24,
  },
  downloadButton: {
    backgroundColor: '#2E7D32',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
  },
  downloadText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2E7D32',
  },
  progressText: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  statusText: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#D32F2F',
    marginLeft: 10,
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 10,
  },
  skipButton: {
    marginTop: 40,
    alignItems: 'center',
  },
  skipText: {
    color: '#2E7D32',
    fontSize: 16,
    fontWeight: '500',
  },
});
