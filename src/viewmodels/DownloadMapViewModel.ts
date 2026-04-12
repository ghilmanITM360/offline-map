/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { ConnectivityService } from '../services/ConnectivityService';
import { RootStackParamList } from '../navigation/RootNavigator'; // fixed: use typed navigation params
import { NativeStackNavigationProp } from '@react-navigation/native-stack'; // fixed: type navigation passed into the viewmodel

const lon2tile = (lon: number, zoom: number) =>
  Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
const lat2tile = (lat: number, zoom: number) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );

/** Karachi Ijtema bounding box */
const BOUNDS = {
  minLat: 24.960,
  maxLat: 24.975,
  minLng: 66.996,
  maxLng: 67.012,
};
const ZOOM_LEVELS = [14, 15, 16];

function buildTileList(): { z: number; x: number; y: number }[] {
  const tiles: { z: number; x: number; y: number }[] = [];
  for (const z of ZOOM_LEVELS) {
    const xMin = lon2tile(BOUNDS.minLng, z);
    const xMax = lon2tile(BOUNDS.maxLng, z);
    const yMin = lat2tile(BOUNDS.maxLat, z);
    const yMax = lat2tile(BOUNDS.minLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

export function useDownloadMapViewModel() {
  const {
    downloadState,
    setDownloadState,
    resetDownloadState,
    updateOfflineData,
    setOfflineMapAvailable,
  } = useAppStore();

  // Use a ref to allow the download loop to read current cancel/pause state
  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  const isMountedRef = useRef(true); // fixed: guard store writes and navigation after unmount
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // fixed: clean up delayed navigation

  useEffect(() => {
    return () => {
      isMountedRef.current = false; // fixed: stop work from mutating state after unmount
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current); // fixed: cancel pending navigation timeout
      }
    };
  }, []);

  const safeSetDownloadState = useCallback((partial: Parameters<typeof setDownloadState>[0]) => {
    if (isMountedRef.current) {
      setDownloadState(partial); // fixed: only update persisted download state while mounted
    }
  }, [setDownloadState]);

  const safeFinalizeDownload = useCallback((downloaded: number) => {
    if (!isMountedRef.current) {
      return;
    }
    updateOfflineData({
      isDownloaded: true,
      sizeMB: parseFloat((downloaded * 0.08).toFixed(1)),
      downloadDate: new Date().toISOString(),
    }); // fixed: persist complete download metadata only while mounted
    setOfflineMapAvailable(true); // fixed: only mark offline data available when still mounted
    safeSetDownloadState({ phase: 'complete', progress: 1, downloadedTiles: downloaded }); // fixed: clamp completion progress to 1
  }, [safeSetDownloadState, setOfflineMapAvailable, updateOfflineData]);

  const startDownload = useCallback(
    async (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      cancelledRef.current = false;
      pausedRef.current = false;
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current); // fixed: cancel stale redirects before starting a new job
      }

      safeSetDownloadState({ phase: 'connecting', errorMessage: null }); // fixed: guard initial state write

      const connected = await ConnectivityService.isConnected();
      if (!connected) {
        safeSetDownloadState({
          phase: 'error',
          errorMessage: 'No internet connection. Please connect and try again.',
        });
        return;
      }

      try {
        await OfflineMapService.init();
        await OfflineMapService.saveMapData();

        const allTiles = buildTileList();
        const totalTiles = allTiles.length;

        // Count tiles already on disk (resume support)
        let alreadyDone = 0;
        for (const t of allTiles) {
          const exists = await OfflineMapService.tileExists(t.z, t.x, t.y);
          if (exists) alreadyDone++;
        }

        safeSetDownloadState({
          phase: 'downloading',
          totalTiles,
          downloadedTiles: alreadyDone,
          progress: Math.min(alreadyDone / totalTiles, 1), // fixed: keep progress bounded to 1.0
          resumable: alreadyDone > 0,
        });

        let downloaded = alreadyDone;

        for (const tile of allTiles) {
          if (cancelledRef.current) {
            return; // fixed: exit immediately on cancel so pause state cannot overwrite cancel/reset
          }

          // Wait while paused — use 1 s interval to reduce CPU wake-ups
          while (pausedRef.current) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (cancelledRef.current) {
              return; // fixed: exit immediately on cancel from the paused loop as well
            }
          }

          // Skip tiles already downloaded
          const exists = await OfflineMapService.tileExists(tile.z, tile.x, tile.y);
          if (exists) {
            continue; // fixed: skip pre-existing tiles without inflating progress
          }

          const downloadedUri = await OfflineMapService.downloadTile(tile.z, tile.x, tile.y);
          if (!downloadedUri) {
            throw new Error(`Tile download failed for ${tile.z}/${tile.x}/${tile.y}`); // fixed: fail fast on tile download errors
          }

          const confirmed = await OfflineMapService.tileExists(tile.z, tile.x, tile.y);
          if (!confirmed) {
            throw new Error(`Tile missing on disk after download for ${tile.z}/${tile.x}/${tile.y}`); // fixed: only count tiles that are confirmed on disk
          }

          downloaded++;
          safeSetDownloadState({
            downloadedTiles: downloaded,
            progress: Math.min(downloaded / totalTiles, 1), // fixed: keep incremental progress bounded to 1.0
          });
        }

        if (downloaded !== totalTiles) {
          throw new Error(`Incomplete download: expected ${totalTiles} tiles, found ${downloaded}`); // fixed: only complete when every tile has been verified
        }

        safeFinalizeDownload(downloaded);

        redirectTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) {
            return;
          }
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); // fixed: guard delayed navigation against unmount
        }, 1200);
      } catch (err) {
        console.error('Download error:', err);
        safeSetDownloadState({
          phase: 'error',
          errorMessage: 'Download failed. Tap Retry to continue.',
          resumable: true,
        });
      }
    },
    [safeFinalizeDownload, safeSetDownloadState]
  );

  const pauseDownload = useCallback(() => {
    pausedRef.current = true;
    safeSetDownloadState({ phase: 'paused', resumable: true }); // fixed: guard paused state writes after unmount
  }, [safeSetDownloadState]);

  const resumeDownload = useCallback(
    (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      pausedRef.current = false;
      void startDownload(navigation); // fixed: resume through the guarded download flow
    },
    [startDownload]
  );

  const cancelDownload = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current); // fixed: cancel delayed redirects when the user cancels the download
    }
    if (isMountedRef.current) {
      resetDownloadState(); // fixed: avoid resetting state after the screen unmounts
    }
  }, [resetDownloadState]);

  const retryDownload = useCallback(
    (navigation: NativeStackNavigationProp<RootStackParamList, 'DownloadMap'>) => {
      cancelledRef.current = false;
      pausedRef.current = false;
      safeSetDownloadState({ phase: 'idle', errorMessage: null }); // fixed: reset the error state through the mount guard
      void startDownload(navigation); // fixed: restart through the guarded download flow
    },
    [safeSetDownloadState, startDownload]
  );

  return {
    downloadState,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
  };
}
