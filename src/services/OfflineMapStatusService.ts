/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { IJTEMA_MAP_BOUNDS } from '../data/ijtema/mapBounds';
import { OfflineMapManifest, OfflineMapStatus } from '../models/types';
import { OfflineMapService } from './OfflineMapService';

export const OFFLINE_MAP_MANIFEST_KEY = 'ijtema.offline_map.manifest.v1';
export const OFFLINE_MAP_DOWNLOADED_FLAG_KEY = 'ijtema.offline_map.downloaded.v1';
export const OFFLINE_MAP_GRAPH_ONLY_MODE_KEY = 'ijtema.offline_map.graph_only_mode.v1';
export const OFFLINE_MAP_SKIPPED_KEY = 'ijtema.offline_map.skipped_online_mode.v1';
export const OFFLINE_MAP_ID = 'ijtema_2026';
export const OFFLINE_MAP_MANIFEST_VERSION = 1;
export const OFFLINE_MAP_ZOOM_LEVELS = [14, 15, 16, 17, 18];

const STALE_DOWNLOADING_MS = 5 * 60 * 1000;

type TileRef = { z: number; x: number; y: number };

const lon2tile = (lon: number, zoom: number) =>
  Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
const lat2tile = (lat: number, zoom: number) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );

function buildTileList(): TileRef[] {
  const tiles: TileRef[] = [];
  for (const z of OFFLINE_MAP_ZOOM_LEVELS) {
    const xMin = lon2tile(IJTEMA_MAP_BOUNDS.minLng, z);
    const xMax = lon2tile(IJTEMA_MAP_BOUNDS.maxLng, z);
    const yMin = lat2tile(IJTEMA_MAP_BOUNDS.maxLat, z);
    const yMax = lat2tile(IJTEMA_MAP_BOUNDS.minLat, z);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

const CACHED_TILE_LIST = buildTileList();

function checksumFor(manifest: Pick<OfflineMapManifest, 'mapId' | 'tileCountExpected' | 'tileCountSaved' | 'version'>): string {
  return `${manifest.mapId}:${manifest.version}:${manifest.tileCountExpected}:${manifest.tileCountSaved}`;
}

export class OfflineMapStatusService {
  static getTileList(): TileRef[] {
    return CACHED_TILE_LIST;
  }

  static getExpectedTileCount(): number {
    return CACHED_TILE_LIST.length;
  }

  static getBounds() {
    return IJTEMA_MAP_BOUNDS;
  }

  static async readManifest(): Promise<OfflineMapManifest | null> {
    const raw = await AsyncStorage.getItem(OFFLINE_MAP_MANIFEST_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OfflineMapManifest;
    } catch {
      return null;
    }
  }

  static async clearManifest(): Promise<void> {
    await AsyncStorage.removeItem(OFFLINE_MAP_MANIFEST_KEY);
  }

  static async setDownloadedFlag(isDownloaded: boolean): Promise<void> {
    await AsyncStorage.setItem(OFFLINE_MAP_DOWNLOADED_FLAG_KEY, isDownloaded ? 'true' : 'false');
  }

  static async setGraphOnlyMode(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(OFFLINE_MAP_GRAPH_ONLY_MODE_KEY, enabled ? 'true' : 'false');
  }

  static async isGraphOnlyModeEnabled(): Promise<boolean> {
    return (await AsyncStorage.getItem(OFFLINE_MAP_GRAPH_ONLY_MODE_KEY)) === 'true';
  }

  static async setSkippedOnlineMode(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(OFFLINE_MAP_SKIPPED_KEY, enabled ? 'true' : 'false');
  }

  static async isSkippedOnlineModeEnabled(): Promise<boolean> {
    return (await AsyncStorage.getItem(OFFLINE_MAP_SKIPPED_KEY)) === 'true';
  }

  static async getDownloadedFlag(): Promise<boolean> {
    return (await AsyncStorage.getItem(OFFLINE_MAP_DOWNLOADED_FLAG_KEY)) === 'true';
  }

  static async writeManifest(manifest: OfflineMapManifest): Promise<void> {
    await AsyncStorage.setItem(OFFLINE_MAP_MANIFEST_KEY, JSON.stringify(manifest));
  }

  static async markDownloading(tileCountSaved: number): Promise<OfflineMapManifest> {
    const manifest: OfflineMapManifest = {
      version: OFFLINE_MAP_MANIFEST_VERSION,
      mapId: OFFLINE_MAP_ID,
      zoomLevels: OFFLINE_MAP_ZOOM_LEVELS,
      tileCountExpected: this.getExpectedTileCount(),
      tileCountSaved,
      status: 'downloading',
      bounds: IJTEMA_MAP_BOUNDS,
      checksum: checksumFor({
        version: OFFLINE_MAP_MANIFEST_VERSION,
        mapId: OFFLINE_MAP_ID,
        tileCountExpected: this.getExpectedTileCount(),
        tileCountSaved,
      }),
      updatedAt: new Date().toISOString(),
    };

    await this.writeManifest(manifest);
    return manifest;
  }

  static async markDownloaded(tileCountSaved: number): Promise<OfflineMapManifest> {
    const manifest: OfflineMapManifest = {
      version: OFFLINE_MAP_MANIFEST_VERSION,
      mapId: OFFLINE_MAP_ID,
      zoomLevels: OFFLINE_MAP_ZOOM_LEVELS,
      tileCountExpected: this.getExpectedTileCount(),
      tileCountSaved,
      completedAt: new Date().toISOString(),
      status: 'downloaded',
      bounds: IJTEMA_MAP_BOUNDS,
      checksum: checksumFor({
        version: OFFLINE_MAP_MANIFEST_VERSION,
        mapId: OFFLINE_MAP_ID,
        tileCountExpected: this.getExpectedTileCount(),
        tileCountSaved,
      }),
      updatedAt: new Date().toISOString(),
    };

    await this.writeManifest(manifest);
    await this.setGraphOnlyMode(false);
    await this.setSkippedOnlineMode(false);
    return manifest;
  }

  static async markCorrupt(message: string, existing?: OfflineMapManifest | null): Promise<OfflineMapManifest> {
    const base = existing ?? (await this.readManifest());
    const manifest: OfflineMapManifest = {
      version: base?.version ?? OFFLINE_MAP_MANIFEST_VERSION,
      mapId: base?.mapId ?? OFFLINE_MAP_ID,
      zoomLevels: base?.zoomLevels ?? OFFLINE_MAP_ZOOM_LEVELS,
      tileCountExpected: base?.tileCountExpected ?? this.getExpectedTileCount(),
      tileCountSaved: base?.tileCountSaved ?? 0,
      completedAt: base?.completedAt,
      status: 'corrupt',
      bounds: base?.bounds ?? IJTEMA_MAP_BOUNDS,
      checksum: base?.checksum,
      updatedAt: new Date().toISOString(),
      errorMessage: message,
    };

    await this.writeManifest(manifest);
    return manifest;
  }

  static async validateAtStartup(): Promise<{
    status: OfflineMapStatus;
    manifest: OfflineMapManifest | null;
    reason?: string;
  }> {
    const manifest = await this.readManifest();
    if (!manifest) {
      return { status: 'not_downloaded', manifest: null, reason: 'Manifest missing' };
    }

    if (manifest.mapId !== OFFLINE_MAP_ID || manifest.version !== OFFLINE_MAP_MANIFEST_VERSION) {
      await this.markCorrupt('Map manifest version mismatch', manifest);
      return { status: 'needs_update', manifest, reason: 'Manifest version/map mismatch' };
    }

    if (manifest.status === 'downloading') {
      const updatedAtMs = new Date(manifest.updatedAt).getTime();
      const stale = Number.isNaN(updatedAtMs) || Date.now() - updatedAtMs > STALE_DOWNLOADING_MS;
      if (stale) {
        await this.clearManifest();
        return { status: 'not_downloaded', manifest: null, reason: 'Stale downloading state cleared' };
      }
      return { status: 'downloading', manifest, reason: 'Download still in progress' };
    }

    const expected = manifest.tileCountExpected;
    const savedInManifest = manifest.tileCountSaved;
    const savedInDb = await OfflineMapService.getStoredTileCount();
    const countSaved = Math.min(savedInDb, savedInManifest);

    if (manifest.status === 'downloaded') {
      if (expected <= 0 || countSaved < expected) {
        await this.markCorrupt(`Expected ${expected} tiles, found ${countSaved}`, manifest);
        return { status: 'corrupt', manifest, reason: 'Incomplete tile set' };
      }

      return { status: 'downloaded', manifest, reason: 'Valid manifest and tile data' };
    }

    if (manifest.status === 'corrupt') {
      return { status: 'corrupt', manifest, reason: manifest.errorMessage ?? 'Corrupt manifest' };
    }

    if (manifest.status === 'needs_update') {
      return { status: 'needs_update', manifest, reason: manifest.errorMessage ?? 'Map update required' };
    }

    return { status: 'not_downloaded', manifest, reason: 'Fallback status' };
  }
}
