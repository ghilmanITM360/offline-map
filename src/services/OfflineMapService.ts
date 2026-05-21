/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system'; // fixed: migrate to current file-system Paths API
import { IJTEMA_DATA } from '../constants/data';

const DB_NAME = 'offline_maps.db';
let _tileDir: Directory | null = null;
const getTileDir = (): Directory => {
  if (!_tileDir) _tileDir = new Directory(Paths.document, 'tiles'); // fixed: defer Directory construction to first call so Paths.document is only read after native module init
  return _tileDir;
};

export interface MapStatus {
  isDownloaded: boolean;
  tileCount: number;
  sizeMB: number;
  downloadDate: string | null;
}

export class OfflineMapService {
  private static db: SQLite.SQLiteDatabase | null = null;
  private static initPromise: Promise<void> | null = null;
  private static operationQueue: Promise<void> = Promise.resolve();

  private static runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const waitForTurn = this.operationQueue;
    const nextTurn = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.operationQueue = waitForTurn.then(() => nextTurn, () => nextTurn);

    return (async () => {
      await waitForTurn;
      try {
        return await operation();
      } finally {
        release();
      }
    })();
  }

  private static async getDatabaseOrThrow(): Promise<SQLite.SQLiteDatabase> {
    await this.init();
    if (!this.db) {
      throw new Error('Offline map database is unavailable');
    }
    return this.db;
  }

  static async init() {
    if (this.db) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.db = await SQLite.openDatabaseAsync(DB_NAME);
        await this.db.execAsync(`
          CREATE TABLE IF NOT EXISTS map_data (id TEXT PRIMARY KEY, data TEXT, download_date TEXT);
          CREATE TABLE IF NOT EXISTS tiles (z INTEGER, x INTEGER, y INTEGER, local_uri TEXT, PRIMARY KEY (z, x, y));
        `);

        if (!getTileDir().exists) {
          getTileDir().create({ idempotent: true, intermediates: true });
        }
      })().catch((error) => {
        this.db = null;
        throw error;
      }).finally(() => {
        this.initPromise = null;
      });
    }
    await this.initPromise;
  }

  /**
   * Returns the real persisted map status by checking SQLite + filesystem.
   * Use this at splash time instead of relying solely on Zustand state.
   */
  static async getMapStatus(): Promise<MapStatus> {
    try {
      return await this.runExclusive(async () => {
        const db = await this.getDatabaseOrThrow();
        const row = await db.getFirstAsync<{ data: string; download_date: string | null }>(
          'SELECT data, download_date FROM map_data WHERE id = ?;',
          ['ijtema_2026']
        );
        if (!row) return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };

        if (!getTileDir().exists) return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };

        const countRow = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM tiles;');
        const tileCount = countRow?.cnt ?? 0;
        if (tileCount === 0) return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };

        const sizeMB = parseFloat((tileCount * 0.08).toFixed(1));
        return {
          isDownloaded: true,
          tileCount,
          sizeMB,
          downloadDate: row.download_date ?? null,
        };
      });
    } catch {
      return { isDownloaded: false, tileCount: 0, sizeMB: 0, downloadDate: null };
    }
  }

  static async getStoredTileCount(): Promise<number> {
    try {
      return await this.runExclusive(async () => {
        const db = await this.getDatabaseOrThrow();
        const countRow = await db.getFirstAsync<{ cnt: number }>(
          'SELECT COUNT(*) AS cnt FROM tiles;'
        );
        return countRow?.cnt ?? 0;
      });
    } catch (error) {
      console.warn('[OfflineMapService] getStoredTileCount failed', error);
      return 0;
    }
  }

  /**
   * Check whether a specific tile already exists on disk and in DB.
   * Used to implement download resume — skip tiles already saved.
   */
  static async tileExists(z: number, x: number, y: number): Promise<boolean> {
    try {
      return await this.runExclusive(async () => {
        const db = await this.getDatabaseOrThrow();
        const row = await db.getFirstAsync<{ local_uri: string }>(
          'SELECT local_uri FROM tiles WHERE z = ? AND x = ? AND y = ?;',
          [z, x, y]
        );
        if (!row) return false;
        return new File(row.local_uri).exists;
      });
    } catch {
      return false;
    }
  }

  static async saveMapData() {
    await this.runExclusive(async () => {
      const db = await this.getDatabaseOrThrow();
      const dataString = JSON.stringify(IJTEMA_DATA);
      await db.runAsync(
        'INSERT OR REPLACE INTO map_data (id, data, download_date) VALUES (?, ?, ?);',
        ['ijtema_2026', dataString, new Date().toISOString()]
      );
    });
  }

  static async getMapData() {
    return this.runExclusive(async () => {
      const db = await this.getDatabaseOrThrow();
      const result = await db.getFirstAsync<{ data: string }>(
        'SELECT data FROM map_data WHERE id = ?;',
        ['ijtema_2026']
      );
      return result ? JSON.parse(result.data) : null;
    });
  }

  static async downloadTile(z: number, x: number, y: number): Promise<string | null> {
    const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    const file = new File(getTileDir(), `${z}_${x}_${y}.png`);

    try {
      const downloadedFile = await File.downloadFileAsync(url, file, { idempotent: true });
      if (!downloadedFile.exists) return null;
      return await this.runExclusive(async () => {
        const db = await this.getDatabaseOrThrow();
        await db.runAsync(
          'INSERT OR REPLACE INTO tiles (z, x, y, local_uri) VALUES (?, ?, ?, ?);',
          [z, x, y, downloadedFile.uri]
        );
        return downloadedFile.uri;
      });
    } catch (error) {
      console.error(`Failed to download tile ${z}/${x}/${y}:`, error);
      return null;
    }
  }

  static async getLocalTileUri(z: number, x: number, y: number): Promise<string | null> {
    return this.runExclusive(async () => {
      const db = await this.getDatabaseOrThrow();
      const result = await db.getFirstAsync<{ local_uri: string }>(
        'SELECT local_uri FROM tiles WHERE z = ? AND x = ? AND y = ?;',
        [z, x, y]
      );
      return result ? result.local_uri : null;
    });
  }

  static async deleteMapData() {
    await this.runExclusive(async () => {
      try {
        const db = await this.getDatabaseOrThrow();
        await db.runAsync('DELETE FROM map_data WHERE id = ?;', ['ijtema_2026']);
        await db.runAsync('DELETE FROM tiles;');
      } catch (error) {
        console.warn('[OfflineMapService] SQLite cleanup skipped or failed', error);
      }
    });

    try {
      if (getTileDir().exists) {
        getTileDir().delete();
      }
    } catch (error) {
      console.warn('[OfflineMapService] Tile directory cleanup skipped or failed', error);
    }
  }

  static async closeDatabase(): Promise<void> {
    await this.runExclusive(async () => {
      if (!this.db) return;
      try {
        await this.db.closeAsync();
      } catch (error) {
        console.warn('[OfflineMapService] closeDatabase failed', error);
      } finally {
        this.db = null;
      }
    });
  }
}
