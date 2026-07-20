/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useCallback, useEffect } from 'react';
import { Paths } from 'expo-file-system';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { ConnectivityService } from '../services/ConnectivityService';
import { RootStackParamList } from '../navigation/RootNavigator';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OfflineMapStatusService } from '../services/OfflineMapStatusService';
import { OfflineDataService } from '../services/OfflineDataService';

const REDIRECT_DELAY_MS = 1200;
const TILE_DOWNLOAD_MAX_RETRIES = 2;
const BYTES_PER_TILE_ESTIMATE = 0.08 * 1024 * 1024;
const STORAGE_SAFETY_MARGIN_BYTES = 20 * 1024 * 1024;
const CONNECTIVITY_CHECK_EVERY_N_TILES = 5;

type DownloadFailureDescriptor = {
  userMessage: string;
  statusMessage: string;
  resumable: boolean;
};

function statusMessageForFailureType(failureType: string, downloadedTiles: number): string {
  switch (failureType) {
    case 'dns_failed':
      return 'Unable to connect. Please check your internet connection or try a different network.';
    case 'tile_server_unreachable':
    case 'http_403':
    case 'http_404':
      return 'Unable to download the map right now. Please try again in a moment.';
    case 'timeout':
      return 'The download took too long. Please check your connection and try again.';
    case 'connection_lost':
      return 'Internet connection was lost. Tap Try Again to resume where it left off.';
    case 'storage_full':
      return 'Not enough storage to save the map. Please free up space and try again.';
    default:
      return downloadedTiles > 0
        ? 'Download interrupted. Tap Try Again to resume.'
        : 'Download failed. Please check your internet connection and try again.';
  }
}

function logDownload(stage: string, details?: unknown) {
  if (!__DEV__) return;
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
  const downloadInProgressRef = useRef(false);
  const downloadWorkerRef = useRef<Promise<void> | null>(null);

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

  const applyFailureState = useCallback(
    (descriptor: DownloadFailureDescriptor) => {
      safeSetDownloadState({
        phase: 'error',
        errorMessage: descriptor.userMessage,
        resumable: descriptor.resumable,
      });
      setOfflineMapStatus('not_downloaded', descriptor.statusMessage);
    },
    [safeSetDownloadState, setOfflineMapStatus],
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
        await OfflineMapStatusService.setGraphOnlyMode(false);
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
      if (downloadInProgressRef.current) {
        pausedRef.current = false;
        safeSetDownloadState({ phase: 'downloading', errorMessage: null });
        setOfflineMapStatus('downloading', 'Download already running');
        return;
      }

      downloadInProgressRef.current = true;
      completionLockRef.current = false;
      cancelledRef.current = false;
      pausedRef.current = false;
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }

      safeSetDownloadState({ phase: 'connecting', errorMessage: null, resumable: false });
      setOfflineMapStatus('downloading', 'Preparing download...');
      logDownload('download started');

      let connectivity;
      try {
        connectivity = await ConnectivityService.getSnapshot();
        logDownload('network snapshot', connectivity);
      } catch (error) {
        logDownload('network snapshot failed', error);
        applyFailureState({
          userMessage: 'No internet connection. Please connect and try again.',
          statusMessage: 'Internet is required to download the map.',
          resumable: false,
        });
        downloadInProgressRef.current = false;
        return;
      }
      if (!(connectivity.isConnected && connectivity.isInternetReachable)) {
        applyFailureState({
          userMessage: 'No internet connection. Please connect and try again.',
          statusMessage: 'Internet is required to download the map.',
          resumable: false,
        });
        downloadInProgressRef.current = false;
        return;
      }

      if (downloadState.downloadedTiles === 0) {
        try {
          const expectedTiles = OfflineMapStatusService.getExpectedTileCount();
          const neededBytes = expectedTiles * BYTES_PER_TILE_ESTIMATE + STORAGE_SAFETY_MARGIN_BYTES;
          const availableBytes = Paths.availableDiskSpace;
          if (availableBytes > 0 && availableBytes < neededBytes) {
            const neededMb = Math.max(1, Math.round((neededBytes / (1024 * 1024)) * 10) / 10);
            applyFailureState({
              userMessage: `Not enough storage. This map needs about ${neededMb} MB free.`,
              statusMessage: 'Not enough storage to download the map.',
              resumable: false,
            });
            downloadInProgressRef.current = false;
            return;
          }
        } catch {
          // If the free-space check itself fails, proceed — the per-tile write will still
          // surface a clear "not enough storage" message if the disk is actually full.
        }
      }

      const worker = (async () => {
        let downloaded = 0;
        let totalTiles = 0;
        try {
          const allTiles = OfflineMapStatusService.getTileList();
          totalTiles = allTiles.length;
          const firstThreeTiles = allTiles.slice(0, 3).map((tile) => `${tile.z}/${tile.x}/${tile.y}`);
          const firstTile = allTiles[0];
          const firstTileUrl = firstTile
            ? OfflineMapService.getTileUrl(firstTile.z, firstTile.x, firstTile.y)
            : null;
          logDownload('tile plan', {
            expectedTiles: totalTiles,
            zoomLevels: Array.from(new Set(allTiles.map((tile) => tile.z))),
            firstThreeTiles,
            firstTileUrl,
            sourceMode: OfflineMapService.getTileSourceMode(),
          });

          if (!firstTile) {
            throw new Error('Tile list is empty; unable to start offline download.');
          }

          const diagnostics = await OfflineMapService.runNetworkDiagnostics(firstTile);
          logDownload('network diagnostics', diagnostics);
          if (!diagnostics.ok) {
            applyFailureState({
              userMessage: diagnostics.userMessage ?? 'Map download failed. Check internet connection and try again.',
              statusMessage: diagnostics.userMessage ?? 'Download failed.',
              resumable: false,
            });
            return;
          }

          await OfflineMapService.saveMapData();
          logDownload('map data prepared');

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

          downloaded = alreadyDone;
          let tileIndex = 0;
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

            tileIndex += 1;
            if (tileIndex % CONNECTIVITY_CHECK_EVERY_N_TILES === 0) {
              const midSnapshot = await ConnectivityService.getSnapshot();
              if (!(midSnapshot.isConnected && midSnapshot.isInternetReachable)) {
                logDownload('connection lost mid-download', { downloaded, tile: `${tile.z}/${tile.x}/${tile.y}` });
                throw new Error(
                  JSON.stringify({
                    type: 'tile_download_failure',
                    userMessage: 'Internet connection was lost. Please reconnect and tap Try Again.',
                    statusMessage: statusMessageForFailureType('connection_lost', downloaded),
                    detail: 'Connectivity snapshot reported disconnected mid-download.',
                  }),
                );
              }
            }

            const downloadResult = await OfflineMapService.downloadTileWithDiagnostics(tile.z, tile.x, tile.y, {
              retries: TILE_DOWNLOAD_MAX_RETRIES,
            });
            if (!downloadResult.ok || !downloadResult.uri) {
              const statusSuffix = downloadResult.statusCode ? `HTTP ${downloadResult.statusCode}` : 'network error';
              logDownload('tile failed', {
                tile: `${tile.z}/${tile.x}/${tile.y}`,
                url: downloadResult.url,
                statusCode: downloadResult.statusCode,
                failureStage: downloadResult.failureStage,
                failureType: downloadResult.failureType,
                attempts: downloadResult.attempts,
                message: downloadResult.errorMessage,
                usedSource: downloadResult.usedSource,
              });
              const failureType = downloadResult.failureType ?? 'unknown';
              const userMessage = OfflineMapService.getFailureUserMessage(failureType);
              throw new Error(
                JSON.stringify({
                  type: 'tile_download_failure',
                  userMessage,
                  statusMessage: statusMessageForFailureType(failureType, downloaded),
                  detail:
                    `Tile download failed for ${tile.z}/${tile.x}/${tile.y} (${statusSuffix}). ` +
                    `URL: ${downloadResult.url}. ${downloadResult.errorMessage ?? ''}`.trim(),
                }),
              );
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
          const errorMessage = error instanceof Error ? error.message : String(error);
          logDownload('download failed', { errorMessage, downloaded, totalTiles });
          await OfflineMapStatusService.markDownloading(downloaded);
          let userMessage = 'Map download failed. Check internet connection and try again.';
          let statusMessage = downloaded > 0
            ? 'Download interrupted. Tap Try Again to resume.'
            : 'Download failed. Check internet and try again.';
          let resumable = downloaded > 0;

          try {
            const parsed = JSON.parse(errorMessage) as Partial<{
              type: string;
              userMessage: string;
              statusMessage: string;
            }>;
            if (parsed.type === 'tile_download_failure') {
              if (parsed.userMessage) userMessage = parsed.userMessage;
              if (parsed.statusMessage) statusMessage = parsed.statusMessage;
            }
          } catch {
            // keep fallback generic message
          }

          applyFailureState({ userMessage, statusMessage, resumable });
        } finally {
          downloadInProgressRef.current = false;
          downloadWorkerRef.current = null;
        }
      })();

      downloadWorkerRef.current = worker;
      await worker;
    },
    [applyFailureState, completeDownloadFlow, downloadState.downloadedTiles, safeSetDownloadState, setOfflineMapStatus],
  );

  const pauseDownload = useCallback(() => {
    pausedRef.current = true;
    safeSetDownloadState({ phase: 'paused', resumable: true });
    setOfflineMapStatus('downloading', 'Download paused');
  }, [safeSetDownloadState, setOfflineMapStatus]);

  const resumeDownload = useCallback(
    (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      pausedRef.current = false;
      if (downloadInProgressRef.current) {
        safeSetDownloadState({ phase: 'downloading', errorMessage: null });
        setOfflineMapStatus('downloading', 'Resuming download...');
        return;
      }
      void startDownload(navigation);
    },
    [safeSetDownloadState, setOfflineMapStatus, startDownload],
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
      if (downloadInProgressRef.current) {
        pausedRef.current = false;
        safeSetDownloadState({ phase: 'downloading', errorMessage: null });
        return;
      }
      cancelledRef.current = false;
      pausedRef.current = false;
      completionLockRef.current = false;
      setOfflineMapStatus('not_downloaded', null);
      safeSetDownloadState({ phase: 'idle', errorMessage: null });
      void startDownload(navigation);
    },
    [safeSetDownloadState, setOfflineMapStatus, startDownload],
  );

  const continueWithVenueMapOnly = useCallback(
    async (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      await OfflineMapStatusService.setDownloadedFlag(false);
      await OfflineMapStatusService.setGraphOnlyMode(true);
      await OfflineMapStatusService.setSkippedOnlineMode(false);
      setOfflineMapStatus('not_downloaded', 'Background map unavailable. Ijtema routes still work.');
      safeSetDownloadState({ phase: 'idle', errorMessage: null, resumable: false });
      triggerNavigationToMain(navigation);
    },
    [safeSetDownloadState, setOfflineMapStatus, triggerNavigationToMain],
  );

  const continueWithOnlineMode = useCallback(
    async (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      await OfflineMapStatusService.setDownloadedFlag(false);
      await OfflineMapStatusService.setGraphOnlyMode(false);
      await OfflineMapStatusService.setSkippedOnlineMode(true);
      setOfflineMapStatus('not_downloaded', 'Using online mode. You can download the offline map anytime from Settings.');
      safeSetDownloadState({ phase: 'idle', errorMessage: null, resumable: false });
      triggerNavigationToMain(navigation);
    },
    [safeSetDownloadState, setOfflineMapStatus, triggerNavigationToMain],
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
    cancelledRef.current = true;
    pausedRef.current = false;
    await downloadWorkerRef.current?.catch(() => undefined);
    const manifest = await OfflineMapStatusService.readManifest();
    const savedTiles = await OfflineMapService.getStoredTileCount();
    logDownload('repair snapshot', {
      manifestStatus: manifest?.status ?? 'none',
      expectedTiles: manifest?.tileCountExpected ?? OfflineMapStatusService.getExpectedTileCount(),
      savedTiles,
    });
    await OfflineDataService.deleteAllMapData();
    await OfflineMapStatusService.clearManifest();
    await OfflineMapStatusService.setDownloadedFlag(false);
    setOfflineMapStatus('not_downloaded', 'Repair complete. You can download map data again.');
    safeSetDownloadState({ phase: 'idle', errorMessage: null, progress: 0, downloadedTiles: 0, totalTiles: 0 });
  }, [safeSetDownloadState, setOfflineMapStatus]);

  return {
    downloadState,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    continueToMain,
    continueWithVenueMapOnly,
    continueWithOnlineMode,
    repairDownload,
  };
}
