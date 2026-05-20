/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';
import { IJTEMA_DATA } from '../constants/data';
import { Coordinate, BlockEntryPoint, Gate } from '../models/types';

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
  S7: 'south', S8: 'south', S9: 'south', S10: 'south', S11: 'south', S12: 'south',
  // North road
  S1: 'north', S2: 'north', S3: 'north', S4: 'north', S5: 'north', S6: 'north',
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

    // Deduplicate entry_nodes by nodeId to prevent duplicate cards
    const seen = new Set<string>();
    const uniqueNodes = (block.entry_nodes as string[]).filter((nodeId) => {
      if (seen.has(nodeId)) return false;
      seen.add(nodeId);
      return true;
    });

    // Count occurrences per side so that "North Entrance 1 / 2" labels are generated
    const sideCounts: Record<string, number> = {};
    const sideIndex: Record<string, number> = {};

    // First pass: count totals per side
    uniqueNodes.forEach((nodeId) => {
      const side: BlockEntryPoint['side'] = ENTRY_SIDE_MAP[nodeId] ?? 'north';
      sideCounts[side] = (sideCounts[side] ?? 0) + 1;
    });

    return uniqueNodes.map((nodeId) => {
      const side: BlockEntryPoint['side'] = ENTRY_SIDE_MAP[nodeId] ?? 'north';
      const label = SIDE_LABEL[side];
      sideIndex[side] = (sideIndex[side] ?? 0) + 1;
      const needsOrdinal = sideCounts[side] > 1;
      return {
        nodeId,
        side,
        friendlyName: needsOrdinal ? `${label.en} ${sideIndex[side]}` : label.en,
        urduName: label.ur,
      };
    });
  }

  static getBlockGates(blockId: string): Gate[] {
    const block = (IJTEMA_DATA.blocks as any)[blockId];
    if (!block?.gates?.length) return [];

    const gates: Gate[] = [];
    for (const nodeId of block.gates as string[]) {
      const node = (IJTEMA_DATA.nodes as any)[nodeId];
      if (!node || node.type !== 'gate') continue;
      gates.push({
        id: nodeId,
        name: node.name ?? nodeId,
        urduName: node.urduName,
        coordinate: { latitude: node.lat, longitude: node.lng },
        blockId,
      });
    }
    return gates;
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
   * Pass the user's persisted walkingSpeed (m/s) from settings; defaults to
   * typical crowd speed 1.38 m/s if not provided.
   */
  static estimateWalkingTime(distanceM: number, walkingSpeedMs = 1.38): number {
    const speed = walkingSpeedMs > 0 ? walkingSpeedMs : 1.38;
    return Math.ceil(distanceM / (speed * 60));
  }

  /**
   * Returns the straight-line distance from userLocation to the nearest
   * entry_node of the block (not the center), giving a more accurate ETA.
   */
  static distanceToBlock(blockId: string, userLocation: Coordinate): number {
    const block = (IJTEMA_DATA.blocks as any)[blockId];
    if (!block) return Infinity;

    // Try nearest entry_node first for accuracy
    if (block.entry_nodes?.length) {
      let minDist = Infinity;
      for (const nodeId of block.entry_nodes as string[]) {
        const node = (IJTEMA_DATA.nodes as any)[nodeId];
        if (!node) continue;
        const d = getDistance(
          { latitude: userLocation.latitude, longitude: userLocation.longitude },
          { latitude: node.lat, longitude: node.lng },
        );
        if (d < minDist) minDist = d;
      }
      if (minDist < Infinity) return minDist;
    }

    return getDistance(
      { latitude: userLocation.latitude, longitude: userLocation.longitude },
      { latitude: block.center.latitude, longitude: block.center.longitude }
    );
  }
}
