/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Network from 'expo-network';

export class ConnectivityService {
  static async isConnected(): Promise<boolean> {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected && state.isInternetReachable;
  }
}
