/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
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
import { useReducedMotion } from '../../viewmodels/useReducedMotion';
import { staticColors, spacing, radii, shadows } from '../../theme';

type DownloadMapScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>;

export function DownloadMapScreen() {
  const navigation = useNavigation<DownloadMapScreenNavigationProp>();
  const { hasInternet, offlineMapStatus, offlineMapStatusMessage } = useAppStore();
  const {
    downloadState,
    showContinueFallback,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    continueToMain,
    continueWithVenueMapOnly,
    continueWithOnlineMode,
    repairDownload,
    offlineTileDownloadAvailable,
  } = useDownloadMapViewModel();

  const [expectedTiles, setExpectedTiles] = useState(OfflineMapStatusService.getExpectedTileCount());

  const { phase, progress, totalTiles, errorMessage } = downloadState;

  const pct = Math.round(progress * 100);
  const isIdle = phase === 'idle';
  const isDownloading = phase === 'downloading' || phase === 'connecting';
  const isPaused = phase === 'paused';
  const isError = phase === 'error';
  const isComplete = phase === 'complete';
  const isCorrupt = offlineMapStatus === 'corrupt' || offlineMapStatus === 'needs_update';
  const showVenueMapOnlyAction = isIdle || isError || isCorrupt;
  const blockingMessage = isError
    ? (errorMessage ?? offlineMapStatusMessage ?? 'Download failed.')
    : isCorrupt
      ? (offlineMapStatusMessage ?? 'Map data looks incomplete. Repair and re-download is required.')
      : null;

  const reducedMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const progressAnim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }
    const anim = Animated.timing(entrance, { toValue: 1, duration: 320, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [reducedMotion, entrance]);

  useEffect(() => {
    if (reducedMotion) {
      progressAnim.setValue(pct);
      return;
    }
    // useNativeDriver: false — width isn't animatable on the native driver.
    const anim = Animated.timing(progressAnim, { toValue: pct, duration: 260, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [pct, reducedMotion, progressAnim]);

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

  const confirmCancel = () => {
    Alert.alert(
      'Cancel download?',
      'Your download progress will be lost. You can resume anytime by tapping Download Offline Map again.',
      [
        { text: 'Keep Downloading', style: 'cancel' },
        { text: 'Cancel Download', style: 'destructive', onPress: cancelDownload },
      ],
    );
  };

  const confirmVenueMapOnly = () => {
    Alert.alert(
      'Use venue map only?',
      offlineTileDownloadAvailable
        ? 'You can navigate inside the Ijtema area and to/from it on nearby roads without a background map. You can download the full background map anytime from Settings.'
        : 'Directions inside the Ijtema and on nearby roads work without internet. The picture map behind the venue cannot be saved on your phone in this version.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => continueWithVenueMapOnly(navigation) },
      ],
    );
  };

  const confirmOnlineMode = () => {
    Alert.alert(
      'Continue without downloading?',
      offlineTileDownloadAvailable
        ? "You'll need internet to see the map and get directions. You can download the offline map anytime from Settings."
        : 'The picture map behind the venue needs internet. Directions inside the Ijtema and on nearby roads still work without internet.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => continueWithOnlineMode(navigation) },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View
          style={{
            opacity: entrance,
            transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Offline Maps</Text>
            <Text style={styles.urduTitle}>آف لائن نقشہ</Text>
            <Text style={styles.subtitle}>Works without internet once downloaded. The satellite background needs internet.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {isComplete ? (
                <CheckCircle size={28} color={staticColors.success} />
              ) : isCorrupt ? (
                <AlertTriangle size={28} color={staticColors.warning} />
              ) : (
                <Download size={28} color={staticColors.success} />
              )}
              <Text style={styles.cardTitle}>Karachi Ijtema Ground</Text>
            </View>

            {isIdle && (
              // Icon-led rows, not a bare "✓ " glyph prefix — matches PermissionScreen's
              // own feature list, so the same "list of benefits" idea reads the same way
              // on both onboarding screens instead of two different visual treatments.
              <View style={styles.benefitList}>
                <View style={styles.benefitItem}>
                  <CheckCircle size={18} color={staticColors.success} />
                  <Text style={styles.benefitText}>Find your way around the venue</Text>
                </View>
                <View style={styles.benefitItem}>
                  <CheckCircle size={18} color={staticColors.success} />
                  <Text style={styles.benefitText}>Walking directions to blocks and gates</Text>
                </View>
                <View style={styles.benefitItem}>
                  <CheckCircle size={18} color={staticColors.success} />
                  <Text style={styles.benefitText}>Works without an internet connection</Text>
                </View>
              </View>
            )}

            {!offlineTileDownloadAvailable && isIdle && (
              <View style={styles.warningBox}>
                <AlertTriangle size={18} color={staticColors.warningText} />
                <Text style={styles.warningText}>Offline background-map download isn't available yet on this app.</Text>
              </View>
            )}

            {(isDownloading || isPaused || isError || isComplete) && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBarBg}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      { width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>{pct}%</Text>
              </View>
            )}

            {isDownloading && (
              <Text style={styles.statusText}>
                {phase === 'connecting' ? 'Getting ready to download…' : 'Downloading map…'}
              </Text>
            )}

            {isPaused && <Text style={styles.statusText}>Download paused. Tap Resume to continue.</Text>}

            {isComplete && <Text style={[styles.statusText, styles.successText]}>Map saved! Redirecting…</Text>}

            {isCorrupt && (
              <View style={styles.warningBox}>
                <Wrench size={18} color={staticColors.warningText} />
                <Text style={styles.warningText}>Map data looks incomplete. Repair and re-download is required.</Text>
              </View>
            )}

            {blockingMessage && (
              <View style={styles.errorBox}>
                <AlertTriangle size={20} color={staticColors.danger} />
                <Text style={styles.errorText}>{blockingMessage}</Text>
              </View>
            )}

            <View style={styles.actionRow}>
              {offlineTileDownloadAvailable && (isIdle || isCorrupt) && (
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => startDownload(navigation)}
                  accessibilityRole="button"
                  accessibilityLabel="Download Offline Map"
                >
                  <Download size={20} color={staticColors.white} />
                  <Text style={styles.primaryButtonText}>Download Offline Map</Text>
                </Pressable>
              )}

              {isDownloading && (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={pauseDownload}
                  accessibilityRole="button"
                  accessibilityLabel="Pause"
                >
                  <Pause size={18} color={staticColors.success} />
                  <Text style={styles.secondaryButtonText}>Pause</Text>
                </Pressable>
              )}

              {isPaused && (
                <>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => resumeDownload(navigation)}
                    accessibilityRole="button"
                    accessibilityLabel="Resume"
                  >
                    <Play size={18} color={staticColors.white} />
                    <Text style={styles.primaryButtonText}>Resume</Text>
                  </Pressable>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={confirmCancel}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                </>
              )}

              {isError && (
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => retryDownload(navigation)}
                  accessibilityRole="button"
                  accessibilityLabel="Try Again"
                >
                  <RotateCcw size={18} color={staticColors.white} />
                  <Text style={styles.primaryButtonText}>Try Again</Text>
                </Pressable>
              )}

              {isCorrupt && (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={repairDownload}
                  accessibilityRole="button"
                  accessibilityLabel="Repair Download"
                >
                  <Wrench size={18} color={staticColors.success} />
                  <Text style={styles.secondaryButtonText}>Repair Download</Text>
                </Pressable>
              )}

              {showContinueFallback && (
                <Pressable
                  style={styles.continueButton}
                  onPress={() => continueToMain(navigation)}
                  accessibilityRole="button"
                  accessibilityLabel="Continue to Map"
                >
                  <ArrowRight size={18} color={staticColors.white} />
                  <Text style={styles.primaryButtonText}>Continue to Map</Text>
                </Pressable>
              )}
            </View>
          </View>

          {isIdle && offlineTileDownloadAvailable && (
            <View style={styles.infoBox}>
              <Wifi size={18} color={staticColors.iconMuted} />
              <Text style={styles.infoText}>Wi-Fi recommended. This map needs about {estimatedSizeMb} MB.</Text>
            </View>
          )}

          {showVenueMapOnlyAction && (
            <Pressable
              style={styles.skipButton}
              onPress={confirmVenueMapOnly}
              accessibilityRole="button"
              accessibilityLabel="Use Venue Map Only"
            >
              <Text style={styles.skipText}>Use Venue Map Only</Text>
            </Pressable>
          )}

          {showVenueMapOnlyAction && (
            <Text style={styles.fallbackHint}>
              You can still navigate inside and around the venue without internet. Only the satellite background
              image may be missing.
            </Text>
          )}

          {(isIdle || isError) && hasInternet && (
            <Pressable
              style={styles.skipButton}
              onPress={confirmOnlineMode}
              accessibilityRole="button"
              accessibilityLabel="Use Online Mode"
            >
              <Text style={styles.skipText}>Use Online Mode</Text>
            </Pressable>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: staticColors.neutralSurface,
  },
  content: {
    padding: spacing.xl,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: staticColors.textPrimary,
  },
  urduTitle: {
    fontSize: 20,
    color: staticColors.success,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    color: staticColors.iconMuted,
    marginTop: spacing.xs + 2,
  },
  card: {
    backgroundColor: staticColors.white,
    borderRadius: radii.xxl,
    padding: spacing.xl,
    ...shadows.medium,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: staticColors.textPrimary,
    marginLeft: spacing.md,
  },
  benefitList: {
    marginBottom: spacing.xl - spacing.xs,
    gap: spacing.sm,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: staticColors.textSecondaryStrong,
    lineHeight: 22,
  },
  progressContainer: {
    marginBottom: spacing.sm,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: staticColors.lightGreenSubtext,
    borderRadius: radii.sm / 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: staticColors.success,
    borderRadius: radii.sm / 2,
  },
  progressText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: staticColors.success,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  statusText: {
    fontSize: 13,
    color: staticColors.iconMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  successText: {
    color: staticColors.success,
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: staticColors.warningBackgroundAlt,
    padding: spacing.md,
    borderRadius: radii.md - 2,
    marginBottom: spacing.md,
    gap: spacing.sm + 2,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: staticColors.warningText,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: staticColors.dangerBackground,
    padding: spacing.md,
    borderRadius: radii.md - 2,
    marginBottom: spacing.lg,
  },
  errorText: {
    marginLeft: spacing.sm,
    color: staticColors.dangerText,
    flex: 1,
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  primaryButton: {
    backgroundColor: staticColors.success,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: staticColors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: staticColors.lightGreenSubtext,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryButtonText: {
    color: staticColors.success,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: staticColors.dangerBackground,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: staticColors.dangerText,
    fontSize: 14,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: staticColors.info,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    backgroundColor: staticColors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  infoText: {
    color: staticColors.iconMuted,
    fontSize: 13,
    flex: 1,
  },
  skipButton: {
    marginTop: spacing.xl - spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  skipText: {
    color: staticColors.info,
    fontSize: 14,
    fontWeight: '600',
  },
  fallbackHint: {
    marginTop: spacing.sm,
    textAlign: 'center',
    color: staticColors.textCaption,
    fontSize: 12,
  },
});
