/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Download,
  Wifi,
  AlertTriangle,
  CheckCircle,
  Pause,
  Play,
  RotateCcw,
  Wrench,
  ArrowRight,
} from 'lucide-react-native';
import { useDownloadMapViewModel } from '../../viewmodels/DownloadMapViewModel';
import { useAppStore } from '../../store/useAppStore';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { OfflineMapStatusService } from '../../services/OfflineMapStatusService';

type DownloadMapScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>;

const REDIRECT_FALLBACK_MS = 2600;

export function DownloadMapScreen() {
  const navigation = useNavigation<DownloadMapScreenNavigationProp>();
  const { hasInternet, offlineMapStatus, offlineMapStatusMessage } = useAppStore();
  const {
    downloadState,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    continueToMain,
    repairDownload,
  } = useDownloadMapViewModel();

  const [showContinueFallback, setShowContinueFallback] = useState(false);
  const [expectedTiles, setExpectedTiles] = useState(OfflineMapStatusService.getExpectedTileCount());

  const { phase, progress, downloadedTiles, totalTiles, errorMessage } = downloadState;

  const pct = Math.round(progress * 100);
  const isIdle = phase === 'idle';
  const isDownloading = phase === 'downloading' || phase === 'connecting';
  const isPaused = phase === 'paused';
  const isError = phase === 'error';
  const isComplete = phase === 'complete';
  const isCorrupt = offlineMapStatus === 'corrupt' || offlineMapStatus === 'needs_update';

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (isComplete) {
      timeout = setTimeout(() => setShowContinueFallback(true), REDIRECT_FALLBACK_MS);
    } else {
      setShowContinueFallback(false);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isComplete]);

  useEffect(() => {
    const readExpected = async () => {
      const status = await OfflineMapStatusService.validateAtStartup();
      setExpectedTiles(status.manifest?.tileCountExpected ?? OfflineMapStatusService.getExpectedTileCount());
    };
    void readExpected();
  }, []);

  const estimatedSizeMb = useMemo(() => {
    const tiles = totalTiles || expectedTiles;
    return Math.max(1, Math.round((tiles * 0.08) * 10) / 10);
  }, [expectedTiles, totalTiles]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Offline Maps</Text>
          <Text style={styles.urduTitle}>آف لائن نقشہ</Text>
          <Text style={styles.subtitle}>Download once. Navigate offline anytime.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            {isComplete ? (
              <CheckCircle size={28} color="#2E7D32" />
            ) : isCorrupt ? (
              <AlertTriangle size={28} color="#D97706" />
            ) : (
              <Download size={28} color="#2E7D32" />
            )}
            <Text style={styles.cardTitle}>Karachi Ijtema Ground</Text>
          </View>
          <Text style={styles.cardDesc}>
            Zoom levels 14-18 for walking navigation.{"\n"}
            Expected tiles: {totalTiles || expectedTiles}
          </Text>

          {(isDownloading || isPaused || isError || isComplete) && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>{pct}%</Text>
                {(totalTiles > 0 || expectedTiles > 0) && (
                  <Text style={styles.tilesText}>
                    {downloadedTiles} / {totalTiles || expectedTiles} tiles
                  </Text>
                )}
              </View>
            </View>
          )}

          {isDownloading && (
            <Text style={styles.statusText}>
              {phase === 'connecting' ? 'Connecting to tile server…' : 'Downloading map tiles…'}
            </Text>
          )}

          {isPaused && <Text style={styles.statusText}>Download paused. Tap Resume to continue.</Text>}

          {isComplete && <Text style={[styles.statusText, styles.successText]}>Map saved! Redirecting…</Text>}

          {isCorrupt && (
            <View style={styles.warningBox}>
              <Wrench size={18} color="#B45309" />
              <Text style={styles.warningText}>Map data looks incomplete. Repair and re-download is required.</Text>
            </View>
          )}

          {(isError || offlineMapStatusMessage) && (
            <View style={styles.errorBox}>
              <AlertTriangle size={20} color="#D32F2F" />
              <Text style={styles.errorText}>{errorMessage ?? offlineMapStatusMessage}</Text>
            </View>
          )}

          <View style={styles.actionRow}>
            {(isIdle || isCorrupt) && (
              <Pressable style={styles.primaryButton} onPress={() => startDownload(navigation)}>
                <Download size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Download Now</Text>
              </Pressable>
            )}

            {isDownloading && (
              <Pressable style={styles.secondaryButton} onPress={pauseDownload}>
                <Pause size={18} color="#2E7D32" />
                <Text style={styles.secondaryButtonText}>Pause</Text>
              </Pressable>
            )}

            {isPaused && (
              <>
                <Pressable style={styles.primaryButton} onPress={() => resumeDownload(navigation)}>
                  <Play size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Resume</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={cancelDownload}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </>
            )}

            {isError && (
              <Pressable style={styles.primaryButton} onPress={() => retryDownload(navigation)}>
                <RotateCcw size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </Pressable>
            )}

            {isCorrupt && (
              <Pressable style={styles.secondaryButton} onPress={repairDownload}>
                <Wrench size={18} color="#2E7D32" />
                <Text style={styles.secondaryButtonText}>Repair Download</Text>
              </Pressable>
            )}

            {showContinueFallback && (
              <Pressable style={styles.continueButton} onPress={() => continueToMain(navigation)}>
                <ArrowRight size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Continue to Map</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Wifi size={18} color="#666" />
          <Text style={styles.infoText}>Wi-Fi recommended. Estimated download: {estimatedSizeMb} MB.</Text>
        </View>

        {(isIdle || isError) && hasInternet && (
          <Pressable
            style={styles.skipButton}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
          >
            <Text style={styles.skipText}>Skip - Use online mode</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#202124',
  },
  urduTitle: {
    fontSize: 20,
    color: '#2E7D32',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
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
    color: '#202124',
    marginLeft: 12,
  },
  cardDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2E7D32',
    borderRadius: 6,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  tilesText: {
    fontSize: 13,
    color: '#888',
  },
  statusText: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  successText: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    marginLeft: 8,
    color: '#D32F2F',
    flex: 1,
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#FCE8E6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#C5221F',
    fontSize: 14,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  infoText: {
    color: '#666',
    fontSize: 13,
    flex: 1,
  },
  skipButton: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skipText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },
});
