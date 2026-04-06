/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { OfflineMapService } from '../services/OfflineMapService';
import { ConnectivityService } from '../services/ConnectivityService';

export function useDownloadMapViewModel() {
  const { setOfflineMapAvailable, updateOfflineData } = useAppStore();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Checking internet connection...');
  const [error, setError] = useState<string | null>(null);

  const lon2tile = (lon: number, zoom: number) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const lat2tile = (lat: number, zoom: number) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

  const startDownload = async (navigation: any) => {
    setStatus('Connecting to server...');
    const connected = await ConnectivityService.isConnected();
    if (!connected) {
      setError('No internet connection. Please connect and try again.');
      return;
    }

    try {
      await OfflineMapService.init();
      setStatus('Downloading map data...');
      await OfflineMapService.saveMapData();
      setProgress(0.1);

      setStatus('Downloading map tiles...');
      
      // Karachi Ijtema Bounding Box
      const minLat = 24.960;
      const maxLat = 24.975;
      const minLng = 67.115;
      const maxLng = 67.130;
      
      const zoomLevels = [14, 15, 16];
      const tilesToDownload: { z: number, x: number, y: number }[] = [];

      for (const z of zoomLevels) {
        const xMin = lon2tile(minLng, z);
        const xMax = lon2tile(maxLng, z);
        const yMin = lat2tile(maxLat, z);
        const yMax = lat2tile(minLat, z);

        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            tilesToDownload.push({ z, x, y });
          }
        }
      }

      const totalTiles = tilesToDownload.length;
      let downloadedCount = 0;

      for (const tile of tilesToDownload) {
        await OfflineMapService.downloadTile(tile.z, tile.x, tile.y);
        downloadedCount++;
        setProgress(0.1 + (downloadedCount / totalTiles) * 0.9);
        setStatus(`Downloading tiles (${downloadedCount}/${totalTiles})...`);
      }

      await saveData(navigation);
    } catch (err) {
      console.error(err);
      setError('Download failed. Please try again.');
    }
  };

  const saveData = async (navigation: any) => {
    setStatus('Finalizing...');
    try {
      updateOfflineData({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        sizeMB: 12.5,
        isDownloaded: true
      });
      setOfflineMapAvailable(true);
      setStatus('Map ready!');
      setTimeout(() => {
        navigation.navigate('Main');
      }, 1000);
    } catch (err) {
      console.error(err);
      setError('Failed to save map data.');
    }
  };

  return {
    progress,
    status,
    error,
    startDownload,
  };
}
