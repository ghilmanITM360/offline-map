/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Network from 'expo-network';

export interface ConnectivitySnapshot {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
}

export class ConnectivityService {
  static async getSnapshot(): Promise<ConnectivitySnapshot> {
    try {
      const state = await Network.getNetworkStateAsync();
      return {
        isConnected: !!state.isConnected,
        isInternetReachable: !!state.isInternetReachable,
        type: state.type ?? 'unknown',
      };
    } catch {
      return {
        isConnected: false,
        isInternetReachable: false,
        type: 'unknown',
      };
    }
  }

  static async isConnected(): Promise<boolean> {
    const state = await this.getSnapshot();
    return state.isConnected && state.isInternetReachable;
  }
}
