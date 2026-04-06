/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { IJTEMA_DATA } from '../constants/data';

const DB_NAME = 'offline_maps.db';
const TILE_DIR = `${FileSystem.documentDirectory}tiles/`;

export class OfflineMapService {
  private static db: SQLite.SQLiteDatabase | null = null;

  static async init() {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS map_data (id TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS tiles (z INTEGER, x INTEGER, y INTEGER, local_uri TEXT, PRIMARY KEY (z, x, y));
    `);
    
    // Ensure tile directory exists
    const dirInfo = await FileSystem.getInfoAsync(TILE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(TILE_DIR, { intermediates: true });
    }
  }

  static async saveMapData() {
    await this.init();
    const dataString = JSON.stringify(IJTEMA_DATA);
    await this.db!.runAsync(
      'INSERT OR REPLACE INTO map_data (id, data) VALUES (?, ?);',
      ['ijtema_2026', dataString]
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
