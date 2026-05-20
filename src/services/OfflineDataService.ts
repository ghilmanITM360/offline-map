/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OfflineMapService } from './OfflineMapService';
import { OfflineMapStatusService } from './OfflineMapStatusService';
import { useAppStore } from '../store/useAppStore';

export class OfflineDataService {
  static async deleteAllMapData(): Promise<void> {
    await OfflineMapService.deleteMapData();
    await OfflineMapService.closeDatabase();
    await OfflineMapStatusService.clearManifest();
    await OfflineMapStatusService.setDownloadedFlag(false);

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
}
