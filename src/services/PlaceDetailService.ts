/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';
import { IJTEMA_DATA } from '../constants/data';
import { Coordinate, BlockEntryPoint } from '../models/types';

/** Maps a raw entry_node ID to its cardinal side relative to the block. */
const ENTRY_SIDE_MAP: Record<string, BlockEntryPoint['side']> = {
  // Rasta-09 (north boundary of middle row → 'north' entrances)
  P1: 'north', P2: 'north', P3: 'north', P4: 'north', P5: 'north',
  // Rasta-11 (south boundary)
  P8: 'south', P9: 'south', P10: 'south', P11: 'south', P12: 'south',
  // West boundary
  S13: 'west', S14: 'west', T1: 'west', T2: 'west',
  // East boundary
  S15: 'east', S16: 'east', S17: 'east',
  // South road
  S2: 'south', S8: 'south', S9: 'south', S10: 'south', S11: 'south', S12: 'south',
  // North road
  S1: 'north', S3: 'north', S4: 'north', S5: 'north', S6: 'north',
};

const SIDE_LABEL: Record<BlockEntryPoint['side'], { en: string; ur: string }> = {
  north: { en: 'North Entrance', ur: 'شمالی دروازہ' },
  south: { en: 'South Entrance', ur: 'جنوبی دروازہ' },
  east:  { en: 'East Entrance',  ur: 'مشرقی دروازہ' },
  west:  { en: 'West Entrance',  ur: 'مغربی دروازہ' },
};

export class PlaceDetailService {
  /**
   * Returns typed entry points for a block with friendly labels.
   */
  static getEntryPoints(blockId: string): BlockEntryPoint[] {
    const block = (IJTEMA_DATA.blocks as any)[blockId];
    if (!block) return [];

    return (block.entry_nodes as string[]).map((nodeId) => {
      const side: BlockEntryPoint['side'] = ENTRY_SIDE_MAP[nodeId] ?? 'north';
      const label = SIDE_LABEL[side];
      return {
        nodeId,
        side,
        friendlyName: label.en,
        urduName: label.ur,
      };
    });
  }

  /**
   * Returns the nearest entry point to the user's current location.
   */
  static getNearestEntry(blockId: string, userLocation: Coordinate): BlockEntryPoint | null {
    const entries = this.getEntryPoints(blockId);
    if (entries.length === 0) return null;

    let nearest: BlockEntryPoint = entries[0];
    let minDist = Infinity;

    for (const entry of entries) {
      const node = (IJTEMA_DATA.nodes as any)[entry.nodeId];
      if (!node) continue;
      const dist = getDistance(
        { latitude: userLocation.latitude, longitude: userLocation.longitude },
        { latitude: node.lat, longitude: node.lng }
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = entry;
      }
    }

    return nearest;
  }

  /**
   * Estimates walking time in minutes given distance in metres.
   * Uses 5 km/h ≈ 83 m/min typical crowd walking speed.
   */
  static estimateWalkingTime(distanceM: number, walkingSpeedMs = 1.38): number {
    return Math.ceil(distanceM / (walkingSpeedMs * 60));
  }

  /**
   * Returns the straight-line distance from userLocation to the block center.
   */
  static distanceToBlock(blockId: string, userLocation: Coordinate): number {
    const block = (IJTEMA_DATA.blocks as any)[blockId];
    if (!block) return Infinity;
    return getDistance(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: block.center.latitude, longitude: block.center.longitude }
    );
  }
}
