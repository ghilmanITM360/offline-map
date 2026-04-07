/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { ConnectivityService } from '../services/ConnectivityService';

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

  const startDownload = useCallback(
    async (navigation: any) => {
      cancelledRef.current = false;
      pausedRef.current = false;

      setDownloadState({ phase: 'connecting', errorMessage: null });

      const connected = await ConnectivityService.isConnected();
      if (!connected) {
        setDownloadState({
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

        setDownloadState({
          phase: 'downloading',
          totalTiles,
          downloadedTiles: alreadyDone,
          progress: alreadyDone / totalTiles,
          resumable: alreadyDone > 0,
        });

        let downloaded = alreadyDone;

        for (const tile of allTiles) {
          if (cancelledRef.current) {
            setDownloadState({ phase: 'paused', resumable: true });
            return;
          }

          // Wait while paused — use 1 s interval to reduce CPU wake-ups
          while (pausedRef.current) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (cancelledRef.current) {
              setDownloadState({ phase: 'paused', resumable: true });
              return;
            }
          }

          // Skip tiles already downloaded
          const exists = await OfflineMapService.tileExists(tile.z, tile.x, tile.y);
          if (!exists) {
            await OfflineMapService.downloadTile(tile.z, tile.x, tile.y);
          }

          downloaded++;
          setDownloadState({
            downloadedTiles: downloaded,
            progress: downloaded / totalTiles,
          });
        }

        // Finalise
        updateOfflineData({
          isDownloaded: true,
          sizeMB: parseFloat((downloaded * 0.08).toFixed(1)),
          downloadDate: new Date().toISOString(),
        });
        setOfflineMapAvailable(true);
        setDownloadState({ phase: 'complete', progress: 1, downloadedTiles: downloaded });

        setTimeout(() => {
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }, 1200);
      } catch (err) {
        console.error('Download error:', err);
        setDownloadState({
          phase: 'error',
          errorMessage: 'Download failed. Tap Retry to continue.',
          resumable: true,
        });
      }
    },
    [setDownloadState, updateOfflineData, setOfflineMapAvailable]
  );

  const pauseDownload = useCallback(() => {
    pausedRef.current = true;
    setDownloadState({ phase: 'paused', resumable: true });
  }, [setDownloadState]);

  const resumeDownload = useCallback(
    (navigation: any) => {
      pausedRef.current = false;
      startDownload(navigation);
    },
    [startDownload]
  );

  const cancelDownload = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;
    resetDownloadState();
  }, [resetDownloadState]);

  const retryDownload = useCallback(
    (navigation: any) => {
      cancelledRef.current = false;
      pausedRef.current = false;
      setDownloadState({ phase: 'idle', errorMessage: null });
      startDownload(navigation);
    },
    [startDownload, setDownloadState]
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
