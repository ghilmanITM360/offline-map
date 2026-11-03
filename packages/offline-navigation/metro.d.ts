/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/** Returns the Metro config with `pmtiles` and `packfile` registered as asset extensions. */
export function withOfflineNavigation<T extends { resolver?: { assetExts?: readonly string[] } }>(config: T): T;
export const ASSET_EXTENSIONS: readonly string[];
