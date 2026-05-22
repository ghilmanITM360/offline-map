/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { IJTEMA_DATA } from '../constants/data';
import { ConnectivityService } from './ConnectivityService';

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

export type TileDownloadFailureStage = 'network' | 'filesystem' | 'database' | 'unknown';
export type TileSourceMode = 'osm' | 'mock' | 'bundled' | 'package';
export type OfflineDownloadFailureType =
  | 'no_internet'
  | 'dns_failed'
  | 'tile_server_unreachable'
  | 'http_403'
  | 'http_404'
  | 'timeout'
  | 'file_write_failed'
  | 'db_write_failed'
  | 'unknown';

export interface TileDownloadResult {
  ok: boolean;
  uri: string | null;
  url: string;
  attempts: number;
  statusCode: number | null;
  errorMessage: string | null;
  failureStage: TileDownloadFailureStage | null;
  usedSource: TileSourceMode;
  failureType: OfflineDownloadFailureType | null;
}

export interface OfflineDownloadDiagnostics {
  ok: boolean;
  failureType: OfflineDownloadFailureType | null;
  userMessage: string | null;
  firstTileUrl: string;
  tileBaseUrl: string;
  statusCode: number | null;
  stage: 'internet' | 'dns' | 'tile_server' | 'first_tile' | 'unknown';
  technicalMessage: string | null;
}

type TileDownloadOptions = {
  retries?: number;
  retryDelayMs?: number;
};

const TILE_DOWNLOAD_RETRIES_DEFAULT = 2;
const TILE_DOWNLOAD_RETRY_DELAY_MS_DEFAULT = 600;
const MOCK_TILE_1PX_TRANSPARENT_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

function debugOfflineMap(message: string, details?: unknown) {
  if (!__DEV__) return;
  if (details !== undefined) {
    console.log(`[OfflineMap] ${message}`, details);
    return;
  }
  console.log(`[OfflineMap] ${message}`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const result = await this.downloadTileWithDiagnostics(z, x, y);
    return result.ok ? result.uri : null;
  }

  static getTileBaseUrl(): string {
    const configured = process.env.EXPO_PUBLIC_TILE_BASE_URL?.trim();
    if (!configured) {
      return 'https://tile.openstreetmap.org';
    }
    return configured.endsWith('/') ? configured.slice(0, -1) : configured;
  }

  private static getBundledTileUrl(z: number, x: number, y: number): string {
    return `${this.getTileBaseUrl()}/${z}/${x}/${y}.png`;
  }

  private static getPackageTileUrl(z: number, x: number, y: number): string {
    return `${this.getTileBaseUrl()}/${z}/${x}/${y}.png`;
  }

  static getTileUrl(z: number, x: number, y: number): string {
    const mode = this.getTileSourceMode();
    if (mode === 'bundled') {
      return this.getBundledTileUrl(z, x, y);
    }
    if (mode === 'package') {
      return this.getPackageTileUrl(z, x, y);
    }
    return `${this.getTileBaseUrl()}/${z}/${x}/${y}.png`;
  }

  static getTileSourceMode(): TileSourceMode {
    const configured = process.env.EXPO_PUBLIC_OFFLINE_TILE_SOURCE?.toLowerCase();
    if (__DEV__ && configured === 'mock') {
      return 'mock';
    }
    if (configured === 'bundled') return 'bundled';
    if (configured === 'package') return 'package';
    return 'osm';
  }

  private static normalizeFailureTypeFromStatus(statusCode: number | null): OfflineDownloadFailureType | null {
    if (statusCode === 403) return 'http_403';
    if (statusCode === 404) return 'http_404';
    return null;
  }

  private static classifyFetchFailure(errorMessage: string, statusCode: number | null): OfflineDownloadFailureType {
    const normalized = errorMessage.toLowerCase();
    const fromStatus = this.normalizeFailureTypeFromStatus(statusCode);
    if (fromStatus) return fromStatus;
    if (
      normalized.includes('unable to resolve host') ||
      normalized.includes('unknownhostexception') ||
      normalized.includes('enotfound') ||
      normalized.includes('name or service not known')
    ) {
      return 'dns_failed';
    }
    if (
      normalized.includes('timed out') ||
      normalized.includes('timeout') ||
      normalized.includes('network request failed')
    ) {
      return 'timeout';
    }
    return 'tile_server_unreachable';
  }

  private static userMessageForFailureType(failureType: OfflineDownloadFailureType): string {
    switch (failureType) {
      case 'no_internet':
        return 'No internet connection.';
      case 'dns_failed':
        return 'DNS failed. Try another network or mobile data.';
      case 'http_403':
        return 'Map server rejected download.';
      case 'http_404':
        return 'Map tile not found on server.';
      case 'timeout':
        return 'Download timed out. Try again.';
      case 'tile_server_unreachable':
        return 'Map tile server could not be reached.';
      case 'file_write_failed':
        return 'Map tile write failed. Please free storage and retry.';
      case 'db_write_failed':
        return 'Map data save failed. Please retry download.';
      default:
        return 'Map download failed. Check internet connection and try again.';
    }
  }

  static getFailureUserMessage(failureType: OfflineDownloadFailureType): string {
    return this.userMessageForFailureType(failureType);
  }

  private static async fetchWithTimeout(
    url: string,
    timeoutMs = 9000,
  ): Promise<{ ok: boolean; statusCode: number | null; errorMessage: string | null }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { method: 'GET', signal: controller.signal });
      return { ok: response.ok, statusCode: response.status, errorMessage: null };
    } catch (error) {
      return {
        ok: false,
        statusCode: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  static async runNetworkDiagnostics(firstTile: { z: number; x: number; y: number }): Promise<OfflineDownloadDiagnostics> {
    const firstTileUrl = this.getTileUrl(firstTile.z, firstTile.x, firstTile.y);
    const tileBaseUrl = this.getTileBaseUrl();
    const connectivity = await ConnectivityService.getSnapshot();
    debugOfflineMap('diagnostics: connectivity', connectivity);

    if (!(connectivity.isConnected && connectivity.isInternetReachable)) {
      return {
        ok: false,
        failureType: 'no_internet',
        userMessage: this.userMessageForFailureType('no_internet'),
        firstTileUrl,
        tileBaseUrl,
        statusCode: null,
        stage: 'internet',
        technicalMessage: `connected=${connectivity.isConnected} internetReachable=${connectivity.isInternetReachable}`,
      };
    }

    const dnsProbe = await this.fetchWithTimeout('https://www.google.com/generate_204', 7000);
    if (!dnsProbe.ok && dnsProbe.errorMessage) {
      const failureType = this.classifyFetchFailure(dnsProbe.errorMessage, dnsProbe.statusCode);
      return {
        ok: false,
        failureType,
        userMessage: this.userMessageForFailureType(failureType),
        firstTileUrl,
        tileBaseUrl,
        statusCode: dnsProbe.statusCode,
        stage: 'dns',
        technicalMessage: dnsProbe.errorMessage,
      };
    }

    const tileServerProbe = await this.fetchWithTimeout(tileBaseUrl, 9000);
    if (!tileServerProbe.ok && tileServerProbe.statusCode === null) {
      const failureType = this.classifyFetchFailure(
        tileServerProbe.errorMessage ?? 'Tile server probe failed',
        tileServerProbe.statusCode,
      );
      return {
        ok: false,
        failureType,
        userMessage: this.userMessageForFailureType(failureType),
        firstTileUrl,
        tileBaseUrl,
        statusCode: tileServerProbe.statusCode,
        stage: 'tile_server',
        technicalMessage: tileServerProbe.errorMessage ?? 'Tile server probe failed',
      };
    }

    const tileProbe = await this.fetchWithTimeout(firstTileUrl, 9000);
    if (!tileProbe.ok || tileProbe.statusCode === 403 || tileProbe.statusCode === 404) {
      const failureType = this.classifyFetchFailure(tileProbe.errorMessage ?? `HTTP ${tileProbe.statusCode ?? 'unknown'}`, tileProbe.statusCode);
      return {
        ok: false,
        failureType,
        userMessage: this.userMessageForFailureType(failureType),
        firstTileUrl,
        tileBaseUrl,
        statusCode: tileProbe.statusCode,
        stage: 'first_tile',
        technicalMessage: tileProbe.errorMessage ?? `HTTP ${tileProbe.statusCode ?? 'unknown'}`,
      };
    }

    return {
      ok: true,
      failureType: null,
      userMessage: null,
      firstTileUrl,
      tileBaseUrl,
      statusCode: tileProbe.statusCode,
      stage: 'first_tile',
      technicalMessage: null,
    };
  }

  static async downloadTileWithDiagnostics(
    z: number,
    x: number,
    y: number,
    options: TileDownloadOptions = {},
  ): Promise<TileDownloadResult> {
    const url = this.getTileUrl(z, x, y);
    const file = new File(getTileDir(), `${z}_${x}_${y}.png`);
    const usedSource = this.getTileSourceMode();
    const retries = options.retries ?? TILE_DOWNLOAD_RETRIES_DEFAULT;
    const retryDelayMs = options.retryDelayMs ?? TILE_DOWNLOAD_RETRY_DELAY_MS_DEFAULT;
    const attemptsLimit = Math.max(1, retries + 1);

    if (!getTileDir().exists) {
      getTileDir().create({ idempotent: true, intermediates: true });
    }

    let lastErrorMessage: string | null = null;
    let lastFailureStage: TileDownloadFailureStage | null = null;
    let lastStatusCode: number | null = null;
    let lastFailureType: OfflineDownloadFailureType | null = null;

    for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
      try {
        if (usedSource === 'mock') {
          file.write(MOCK_TILE_1PX_TRANSPARENT_BASE64, { encoding: 'base64' });
          if (!file.exists) {
            throw new Error('Mock tile write did not create a file on disk');
          }
          await this.persistTileRecord(z, x, y, file.uri);
          debugOfflineMap('tile persisted', { tile: `${z}/${x}/${y}`, path: file.uri, attempt, usedSource });
          return {
            ok: true,
            uri: file.uri,
            url,
            attempts: attempt,
            statusCode: null,
            errorMessage: null,
            failureStage: null,
            usedSource,
            failureType: null,
          };
        } else if (usedSource === 'bundled') {
          lastFailureStage = 'network';
          lastFailureType = 'tile_server_unreachable';
          lastErrorMessage = 'Bundled tile source is not implemented for production yet.';
          lastStatusCode = null;
          break;
        } else if (usedSource === 'package') {
          lastFailureStage = 'network';
          lastFailureType = 'tile_server_unreachable';
          lastErrorMessage = 'Package tile source is not implemented for production yet.';
          lastStatusCode = null;
          break;
        } else {
          const downloadedFile = await File.downloadFileAsync(url, file, { idempotent: true });
          const downloadedUri =
            downloadedFile && typeof downloadedFile === 'object' && 'uri' in downloadedFile
              ? String(downloadedFile.uri)
              : file.uri;
          const fileExists =
            downloadedFile && typeof downloadedFile === 'object' && 'exists' in downloadedFile
              ? Boolean(downloadedFile.exists)
              : new File(downloadedUri).exists;

          if (!fileExists) {
            throw new Error('Downloaded tile file does not exist after write');
          }

          await this.persistTileRecord(z, x, y, downloadedUri);
          debugOfflineMap('tile persisted', { tile: `${z}/${x}/${y}`, path: downloadedUri, attempt, usedSource });
          return {
            ok: true,
            uri: downloadedUri,
            url,
            attempts: attempt,
            statusCode: null,
            errorMessage: null,
            failureStage: null,
            usedSource,
            failureType: null,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastErrorMessage = errorMessage;
        lastFailureStage = usedSource === 'mock' ? 'filesystem' : 'network';

        if (errorMessage.toLowerCase().includes('tile metadata write failed')) {
          lastFailureStage = 'database';
          lastFailureType = 'db_write_failed';
        } else if (errorMessage.toLowerCase().includes('exist after write') || errorMessage.toLowerCase().includes('file')) {
          lastFailureStage = 'filesystem';
          lastFailureType = 'file_write_failed';
        }

        if (usedSource === 'osm') {
          const probe = await this.probeTileEndpoint(url);
          lastStatusCode = probe.statusCode;
          if (!lastFailureType) {
            lastFailureType = this.classifyFetchFailure(probe.errorMessage ?? errorMessage, probe.statusCode);
          }
          if (probe.errorMessage) {
            lastErrorMessage = `${errorMessage}; probe=${probe.errorMessage}`;
          }
          debugOfflineMap('tile download failed', {
            tile: `${z}/${x}/${y}`,
            url,
            attempt,
            statusCode: probe.statusCode,
            probeError: probe.errorMessage,
            errorMessage,
          });
        } else {
          debugOfflineMap('mock tile write failed', {
            tile: `${z}/${x}/${y}`,
            path: file.uri,
            attempt,
            errorMessage,
          });
        }

        if (attempt < attemptsLimit) {
          await wait(retryDelayMs);
          continue;
        }
      }
    }

    return {
      ok: false,
      uri: null,
      url,
      attempts: attemptsLimit,
      statusCode: lastStatusCode,
      errorMessage: lastErrorMessage,
      failureStage: lastFailureStage,
      usedSource,
      failureType: lastFailureType ?? 'unknown',
    };
  }

  private static async persistTileRecord(z: number, x: number, y: number, localUri: string): Promise<void> {
    try {
      await this.runExclusive(async () => {
        const db = await this.getDatabaseOrThrow();
        await db.runAsync(
          'INSERT OR REPLACE INTO tiles (z, x, y, local_uri) VALUES (?, ?, ?, ?);',
          [z, x, y, localUri],
        );
      });
    } catch (error) {
      debugOfflineMap('db write failed', { tile: `${z}/${x}/${y}`, localUri, error });
      throw new Error(`Tile metadata write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static async probeTileEndpoint(url: string): Promise<{ statusCode: number | null; errorMessage: string | null }> {
    try {
      const response = await fetch(url, { method: 'GET' });
      return {
        statusCode: response.status,
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        statusCode: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
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
