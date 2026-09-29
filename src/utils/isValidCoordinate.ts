/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #147: finite and in-range. Shared by GPSManagerService (before any listener/store sees a fix)
// and useAppStore.setCurrentLocation (other writers).
export const isValidCoordinate = (c: { latitude: number; longitude: number }): boolean =>
  Number.isFinite(c.latitude) && Number.isFinite(c.longitude) &&
  Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
