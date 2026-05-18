/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { ConnectivityService } from '../services/ConnectivityService';
import { RootStackParamList } from '../navigation/RootNavigator';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OfflineMapStatusService } from '../services/OfflineMapStatusService';

const REDIRECT_DELAY_MS = 1200;

function logDownload(stage: string, details?: unknown) {
  if (details !== undefined) {
    console.log(`[OfflineDownload] ${stage}`, details);
    return;
  }
  console.log(`[OfflineDownload] ${stage}`);
}

export function useDownloadMapViewModel() {
  const {
    downloadState,
    setDownloadState,
    resetDownloadState,
    updateOfflineData,
    setOfflineMapAvailable,
    setOfflineMapStatus,
  } = useAppStore();

  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  const isMountedRef = useRef(true);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionLockRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const safeSetDownloadState = useCallback(
    (partial: Parameters<typeof setDownloadState>[0]) => {
      if (!isMountedRef.current) return;
      setDownloadState(partial);
    },
    [setDownloadState],
  );

  const triggerNavigationToMain = useCallback(
    (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      try {
        logDownload('navigation triggered');
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } catch (error) {
        logDownload('navigation failed', error);
      }
    },
    [],
  );

  const completeDownloadFlow = useCallback(
    async (
      navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>,
      downloadedTiles: number,
      totalTiles: number,
    ) => {
      if (completionLockRef.current) {
        logDownload('completion already processed - idempotent skip');
        return;
      }
      completionLockRef.current = true;

      try {
        logDownload('tile count complete', { downloadedTiles, totalTiles });

        await OfflineMapStatusService.markDownloaded(downloadedTiles);
        await OfflineMapStatusService.setDownloadedFlag(true);
        logDownload('manifest saved');

        const validation = await OfflineMapStatusService.validateAtStartup();
        logDownload('manifest verified', validation);

        if (validation.status !== 'downloaded') {
          throw new Error(validation.reason ?? 'Manifest verification failed after download');
        }

        updateOfflineData({
          isDownloaded: true,
          sizeMB: parseFloat((downloadedTiles * 0.08).toFixed(1)),
          downloadDate: validation.manifest?.completedAt ?? new Date().toISOString(),
        });
        setOfflineMapAvailable(true);
        setOfflineMapStatus('downloaded', null);

        safeSetDownloadState({
          phase: 'complete',
          progress: 1,
          downloadedTiles,
          totalTiles,
          errorMessage: null,
          resumable: false,
        });

        if (redirectTimeoutRef.current) {
          clearTimeout(redirectTimeoutRef.current);
        }

        redirectTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          triggerNavigationToMain(navigation);
        }, REDIRECT_DELAY_MS);
      } catch (error) {
        completionLockRef.current = false;
        await OfflineMapStatusService.markCorrupt('Download completed but manifest verification failed');
        setOfflineMapStatus('corrupt', 'Manifest verification failed. Please repair the map download.');
        safeSetDownloadState({
          phase: 'error',
          errorMessage: 'Map data verification failed. Please repair and download again.',
          resumable: true,
        });
        logDownload('completion failed', error);
      }
    },
    [safeSetDownloadState, setOfflineMapAvailable, setOfflineMapStatus, triggerNavigationToMain, updateOfflineData],
  );

  const startDownload = useCallback(
    async (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      completionLockRef.current = false;
      cancelledRef.current = false;
      pausedRef.current = false;
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }

      safeSetDownloadState({ phase: 'connecting', errorMessage: null });
      setOfflineMapStatus('downloading', 'Preparing download...');
      logDownload('download started');

      const connected = await ConnectivityService.isConnected();
      if (!connected) {
        safeSetDownloadState({
          phase: 'error',
          errorMessage: 'No internet connection. Please connect and try again.',
        });
        setOfflineMapStatus('not_downloaded', 'Internet is required to download the map.');
        return;
      }

      try {
        await OfflineMapService.init();
        await OfflineMapService.saveMapData();

        const allTiles = OfflineMapStatusService.getTileList();
        const totalTiles = allTiles.length;
        let alreadyDone = 0;

        for (const t of allTiles) {
          const exists = await OfflineMapService.tileExists(t.z, t.x, t.y);
          if (exists) alreadyDone += 1;
        }

        await OfflineMapStatusService.markDownloading(alreadyDone);

        safeSetDownloadState({
          phase: 'downloading',
          totalTiles,
          downloadedTiles: alreadyDone,
          progress: Math.min(alreadyDone / totalTiles, 1),
          resumable: alreadyDone > 0,
        });

        let downloaded = alreadyDone;
        for (const tile of allTiles) {
          if (cancelledRef.current) return;

          while (pausedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 700));
            if (cancelledRef.current) return;
          }

          const exists = await OfflineMapService.tileExists(tile.z, tile.x, tile.y);
          if (exists) {
            continue;
          }

          const downloadedUri = await OfflineMapService.downloadTile(tile.z, tile.x, tile.y);
          if (!downloadedUri) {
            throw new Error(`Tile download failed for ${tile.z}/${tile.x}/${tile.y}`);
          }

          const confirmed = await OfflineMapService.tileExists(tile.z, tile.x, tile.y);
          if (!confirmed) {
            throw new Error(`Tile save verification failed for ${tile.z}/${tile.x}/${tile.y}`);
          }

          downloaded += 1;
          logDownload('tile saved', { tile: `${tile.z}/${tile.x}/${tile.y}`, downloaded, totalTiles });
          safeSetDownloadState({
            downloadedTiles: downloaded,
            progress: Math.min(downloaded / totalTiles, 1),
          });

          if (downloaded % 10 === 0 || downloaded === totalTiles) {
            await OfflineMapStatusService.markDownloading(downloaded);
          }
        }

        if (downloaded !== totalTiles) {
          throw new Error(`Incomplete download: expected ${totalTiles} but saved ${downloaded}`);
        }

        await completeDownloadFlow(navigation, downloaded, totalTiles);
      } catch (error) {
        console.error('Download error:', error);
        await OfflineMapStatusService.markCorrupt('Map download interrupted or incomplete');
        setOfflineMapStatus('corrupt', 'Download incomplete. Repair and download again.');
        safeSetDownloadState({
          phase: 'error',
          errorMessage: 'Download failed. Tap retry to continue.',
          resumable: true,
        });
      }
    },
    [completeDownloadFlow, safeSetDownloadState, setOfflineMapStatus],
  );

  const pauseDownload = useCallback(() => {
    pausedRef.current = true;
    safeSetDownloadState({ phase: 'paused', resumable: true });
    setOfflineMapStatus('downloading', 'Download paused');
  }, [safeSetDownloadState, setOfflineMapStatus]);

  const resumeDownload = useCallback(
    (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      pausedRef.current = false;
      void startDownload(navigation);
    },
    [startDownload],
  );

  const cancelDownload = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;
    completionLockRef.current = false;
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
    }
    if (!isMountedRef.current) return;
    resetDownloadState();
    setOfflineMapStatus('not_downloaded', null);
    void OfflineMapStatusService.clearManifest();
    void OfflineMapStatusService.setDownloadedFlag(false);
  }, [resetDownloadState, setOfflineMapStatus]);

  const retryDownload = useCallback(
    (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      cancelledRef.current = false;
      pausedRef.current = false;
      completionLockRef.current = false;
      safeSetDownloadState({ phase: 'idle', errorMessage: null });
      void startDownload(navigation);
    },
    [safeSetDownloadState, startDownload],
  );

  const continueToMain = useCallback(
    async (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      const status = await OfflineMapStatusService.validateAtStartup();
      logDownload('manual continue requested', status);
      if (status.status === 'downloaded') {
        triggerNavigationToMain(navigation);
        return;
      }

      safeSetDownloadState({
        phase: 'error',
        errorMessage: 'Map data is incomplete. Please repair and download again.',
      });
      setOfflineMapStatus('corrupt', 'Map data is incomplete. Repair required.');
    },
    [safeSetDownloadState, setOfflineMapStatus, triggerNavigationToMain],
  );

  const repairDownload = useCallback(async () => {
    logDownload('repair requested');
    await OfflineMapService.deleteMapData();
    await OfflineMapStatusService.clearManifest();
    await OfflineMapStatusService.setDownloadedFlag(false);
    resetDownloadState();
    safeSetDownloadState({ phase: 'idle', errorMessage: null, progress: 0, downloadedTiles: 0, totalTiles: 0 });
    setOfflineMapAvailable(false);
    updateOfflineData({ isDownloaded: false, sizeMB: 0, downloadDate: undefined });
    setOfflineMapStatus('not_downloaded', null);
  }, [resetDownloadState, safeSetDownloadState, setOfflineMapAvailable, setOfflineMapStatus, updateOfflineData]);

  return {
    downloadState,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    continueToMain,
    repairDownload,
  };
}
