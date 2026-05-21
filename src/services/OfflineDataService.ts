/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OfflineMapService } from './OfflineMapService';
import { OfflineMapStatusService } from './OfflineMapStatusService';
import { useAppStore } from '../store/useAppStore';

export class OfflineDataService {
  private static deleteInFlight: Promise<void> | null = null;

  static async deleteAllMapData(): Promise<void> {
    if (this.deleteInFlight) return this.deleteInFlight;

    this.deleteInFlight = (async () => {
      try {
        await OfflineMapService.deleteMapData();
        await OfflineMapService.closeDatabase();
        await OfflineMapStatusService.clearManifest();
        await OfflineMapStatusService.setDownloadedFlag(false);
      } finally {
        const {
          setOfflineMapAvailable,
          setOfflineMapStatus,
          updateOfflineData,
          resetDownloadState,
        } = useAppStore.getState();

        setOfflineMapAvailable(false);
        setOfflineMapStatus('not_downloaded', null);
        updateOfflineData({ isDownloaded: false, sizeMB: 0, downloadDate: undefined });
        resetDownloadState();
      }
    })().finally(() => {
      this.deleteInFlight = null;
    });

    return this.deleteInFlight;
  }
}
