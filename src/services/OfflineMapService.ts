/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { IJTEMA_DATA } from '../constants/data';

const DB_NAME = 'offline_maps.db';
const TILE_DIR = `${FileSystem.documentDirectory}tiles/`;

export interface MapStatus {
  isDownloaded: boolean;
  tileCount: number;
  sizeMB: number;
  downloadDate: string | null;
}

export class OfflineMapService {
  private static db: SQLite.SQLiteDatabase | null = null;

  static async init() {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS map_data (id TEXT PRIMARY KEY, data TEXT, download_date TEXT);
      CREATE TABLE IF NOT EXISTS tiles (z INTEGER, x INTEGER, y INTEGER, local_uri TEXT, PRIMARY KEY (z, x, y));
    `);

    // Ensure tile directory exists
    const dirInfo = await FileSystem.getInfoAsync(TILE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(TILE_DIR, { intermediates: true });
    }
  }

  /**
   * Returns the real persisted map status by checking SQLite + filesystem.
   * Use this at splash time instead of relying solely on Zustand state.
   */
  static async getMapStatus(): Promise<MapStatus> {
    try {
      await this.init();

      const row = await this.db!.getFirstAsync<{ data: string; download_date: string | null }>(
        'SELECT data, download_date FROM map_data WHERE id = ?;',
        ['ijtema_2026']
      );
      if (!row) return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };

      const dirInfo = await FileSystem.getInfoAsync(TILE_DIR);
      if (!dirInfo.exists) return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };

      const countRow = await this.db!.getFirstAsync<{ cnt: number }>(
        'SELECT COUNT(*) AS cnt FROM tiles;'
      );
      const tileCount = countRow?.cnt ?? 0;
      if (tileCount === 0) return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };

      // Rough size estimate
      const sizeMB = parseFloat((tileCount * 0.08).toFixed(1));
      return {
        isDownloaded: true,
        tileCount,
        sizeMB,
        downloadDate: row.download_date ?? null,
      };
    } catch {
      return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };
    }
  }

  /**
   * Check whether a specific tile already exists on disk and in DB.
   * Used to implement download resume — skip tiles already saved.
   */
  static async tileExists(z: number, x: number, y: number): Promise<boolean> {
    try {
      await this.init();
      const row = await this.db!.getFirstAsync<{ local_uri: string }>(
        'SELECT local_uri FROM tiles WHERE z = ? AND x = ? AND y = ?;',
        [z, x, y]
      );
      if (!row) return false;
      const info = await FileSystem.getInfoAsync(row.local_uri);
      return info.exists;
    } catch {
      return false;
    }
  }

  static async saveMapData() {
    await this.init();
    const dataString = JSON.stringify(IJTEMA_DATA);
    await this.db!.runAsync(
      'INSERT OR REPLACE INTO map_data (id, data, download_date) VALUES (?, ?, ?);',
      ['ijtema_2026', dataString, new Date().toISOString()]
    );
  }

  static async getMapData() {
    await this.init();
    const result = await this.db!.getFirstAsync<{ data: string }>(
      'SELECT data FROM map_data WHERE id = ?;',
      ['ijtema_2026']
    );
    return result ? JSON.parse(result.data) : null;
  }

  static async downloadTile(z: number, x: number, y: number): Promise<string | null> {
    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    const localUri = `${TILE_DIR}${z}_${x}_${y}.png`;

    try {
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      await this.db!.runAsync(
        'INSERT OR REPLACE INTO tiles (z, x, y, local_uri) VALUES (?, ?, ?, ?);',
        [z, x, y, uri]
      );
      return uri;
    } catch (error) {
      console.error(`Failed to download tile ${z}/${x}/${y}:`, error);
      return null;
    }
  }

  static async getLocalTileUri(z: number, x: number, y: number): Promise<string | null> {
    await this.init();
    const result = await this.db!.getFirstAsync<{ local_uri: string }>(
      'SELECT local_uri FROM tiles WHERE z = ? AND x = ? AND y = ?;',
      [z, x, y]
    );
    return result ? result.local_uri : null;
  }

  static async deleteMapData() {
    await this.init();
    await this.db!.runAsync('DELETE FROM map_data WHERE id = ?;', ['ijtema_2026']);
    await this.db!.runAsync('DELETE FROM tiles;');

    // Delete tile directory
    const dirInfo = await FileSystem.getInfoAsync(TILE_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(TILE_DIR, { idempotent: true });
    }
  }
}
