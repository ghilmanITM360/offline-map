/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Download, Wifi, AlertTriangle, CheckCircle, Pause, Play, RotateCcw } from 'lucide-react-native';
import { useDownloadMapViewModel } from '../../viewmodels/DownloadMapViewModel';
import { useAppStore } from '../../store/useAppStore';
export function DownloadMapScreen() {
    const navigation = useNavigation(); // fixed: replace any navigation with typed stack navigation
    const { hasInternet } = useAppStore();
    const { downloadState, startDownload, pauseDownload, resumeDownload, cancelDownload, retryDownload } = useDownloadMapViewModel();
    const { phase, progress, downloadedTiles, totalTiles, errorMessage } = downloadState;
    const pct = Math.round(progress * 100);
    const isIdle = phase === 'idle';
    const isDownloading = phase === 'downloading' || phase === 'connecting';
    const isPaused = phase === 'paused';
    const isError = phase === 'error';
    const isComplete = phase === 'complete';
    return (<SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Offline Maps</Text>
          <Text style={styles.urduTitle}>آف لائن نقشہ</Text>
          <Text style={styles.subtitle}>Download once. Navigate forever.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            {isComplete ? (<CheckCircle size={28} color="#2E7D32"/>) : (<Download size={28} color="#2E7D32"/>)}
            <Text style={styles.cardTitle}>Ijtema Ground Map</Text>
          </View>
          <Text style={styles.cardDesc}>
            Includes all blocks, masjids, gates, rastas, and walking paths.{'\n'}
            Works completely without internet after download.
          </Text>

          {/* Progress bar — shown whenever download has started */}
          {(isDownloading || isPaused || isError || isComplete) && (<View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${pct}%` }]}/>
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>{pct}%</Text>
                {totalTiles > 0 && (<Text style={styles.tilesText}>
                    {downloadedTiles} / {totalTiles} tiles
                  </Text>)}
              </View>
            </View>)}

          {/* Status text */}
          {isDownloading && (<Text style={styles.statusText}>
              {phase === 'connecting' ? 'Connecting to server…' : 'Downloading map tiles…'}
            </Text>)}
          {isPaused && <Text style={styles.statusText}>Download paused. Tap Resume to continue.</Text>}
          {isComplete && <Text style={[styles.statusText, styles.successText]}>✓ Map saved! Redirecting…</Text>}

          {/* Error state */}
          {isError && (<View style={styles.errorBox}>
              <AlertTriangle size={20} color="#D32F2F"/>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>)}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {isIdle && (<Pressable style={[styles.primaryButton, !isIdle && styles.primaryButtonDisabled]} // fixed: visually disable the primary action as soon as a job is in flight
         onPress={() => startDownload(navigation)} disabled={!isIdle} // fixed: prevent rapid double-taps from starting duplicate download jobs
         accessibilityRole="button" // fixed: expose the download action as a button
         accessibilityLabel="Download map" // fixed: provide a clear accessible name for the download action
        >
                <Download size={20} color="#FFFFFF"/>
                <Text style={styles.primaryButtonText}>Download Now</Text>
              </Pressable>)}

            {isDownloading && (<Pressable style={styles.secondaryButton} onPress={pauseDownload}>
                <Pause size={18} color="#2E7D32"/>
                <Text style={styles.secondaryButtonText}>Pause</Text>
              </Pressable>)}

            {isPaused && (<>
                <Pressable style={styles.primaryButton} onPress={() => resumeDownload(navigation)}>
                  <Play size={18} color="#FFFFFF"/>
                  <Text style={styles.primaryButtonText}>Resume</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={cancelDownload}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </>)}

            {isError && (<Pressable style={styles.primaryButton} onPress={() => retryDownload(navigation)}>
                <RotateCcw size={18} color="#FFFFFF"/>
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </Pressable>)}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Wifi size={18} color="#666"/>
          <Text style={styles.infoText}>Wi-Fi recommended. Download is about 25 MB.</Text>
        </View>

        {/* Skip link — only show when we have internet or map is downloaded */}
        {(isIdle || isError) && hasInternet && (<Pressable style={styles.skipButton} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
            <Text style={styles.skipText}>Skip — Use online mode</Text>
          </Pressable>)}
      </View>
    </SafeAreaView>);
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
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFEBEE',
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
    },
    errorText: {
        fontSize: 14,
        color: '#D32F2F',
        marginLeft: 10,
        flex: 1,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    primaryButton: {
        flex: 1,
        backgroundColor: '#2E7D32',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    primaryButtonDisabled: {
        opacity: 0.5, // fixed: visibly indicate when the primary download action is disabled
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    secondaryButton: {
        flex: 1,
        backgroundColor: '#E8F5E9',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    secondaryButtonText: {
        color: '#2E7D32',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#CCC',
        justifyContent: 'center',
    },
    cancelButtonText: {
        color: '#888',
        fontSize: 15,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
        paddingHorizontal: 4,
    },
    infoText: {
        fontSize: 13,
        color: '#666',
        marginLeft: 8,
    },
    skipButton: {
        marginTop: 32,
        alignItems: 'center',
    },
    skipText: {
        color: '#1A73E8',
        fontSize: 15,
        fontWeight: '500',
    },
});
