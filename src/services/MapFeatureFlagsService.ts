/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const truthyValues = new Set(['1', 'true', 'yes', 'on']);
const falseyValues = new Set(['0', 'false', 'no', 'off']);

function readFlag(value: string | undefined, defaultValue = true): boolean {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falseyValues.has(normalized)) return false;
  return defaultValue;
}

export class MapFeatureFlagsService {
  static useIjtemaV2Map(): boolean {
    return readFlag(process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP);
  }

  static useIjtemaV2Routing(): boolean {
    return readFlag(process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING);
  }

  static useIjtemaV2Navigation(): boolean {
    return readFlag(process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION);
  }

  static useOutsideStreetGraph(): boolean {
    return readFlag(process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH, true);
  }
}
