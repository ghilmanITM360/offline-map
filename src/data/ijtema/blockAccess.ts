/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { counterClockwise, type GeoPoint } from '@muslim-ummah/offline-navigation';
import { IJTEMA_BLOCKS } from './blocks';
import { getBlockEntryNodeIds } from './graphBuilder';
import type { Block, BlockCorners } from './types';

// Four surveyed corners DEFINE a block's shape. They are not entrances. The routing graph nevertheless still routes to four corner-derived
// nodes per block (`B12_C1`..`B12_C4`) because no entrance has been surveyed yet; that is kept, because removing it would strand every block,
// but it is labelled for what it is: a LEGACY_UNVERIFIED access alias. `verifiedAccessPoints` is empty for every block until a field survey
// supplies real ones; nothing here is ever invented.
export type AccessVerification = 'VERIFIED' | 'LEGACY_UNVERIFIED';
export interface BlockAccessPoint {
  readonly id: string;
  readonly blockId: string;
  readonly coordinate: GeoPoint;
  readonly verification: AccessVerification;
  /** The routing-graph node a route to this block can end at. */
  readonly nodeId: string;
  readonly cornerKey?: keyof BlockCorners;
}
export interface BlockGeometryModel {
  readonly blockId: string;
  /** Counter-clockwise simple ring built from the surveyed corners (never trusting the order they were listed in). */
  readonly boundary: readonly GeoPoint[];
  /** The surveyed reference centre. */
  readonly referenceCenter: GeoPoint;
  /** Where the block's own marker is drawn: the centre, never a corner or a route node. */
  readonly destinationDisplay: GeoPoint;
  readonly verifiedAccessPoints: readonly BlockAccessPoint[];
  readonly legacyAccessAliases: readonly BlockAccessPoint[];
}

const CORNERS: Array<keyof BlockCorners> = ['c1', 'c2', 'c3', 'c4'];

export const blockGeometryModel = (block: Block, verifiedAccessPoints: readonly BlockAccessPoint[] = []): BlockGeometryModel => {
  const nodeIds = getBlockEntryNodeIds(block.id);
  return {
    blockId: block.id,
    boundary: counterClockwise(block.polygon),
    referenceCenter: block.center,
    destinationDisplay: block.center,
    verifiedAccessPoints,
    legacyAccessAliases: CORNERS.map((key, i) => ({
      id: `${block.id}#${key.toUpperCase()}`, blockId: block.id, coordinate: block.entryPoints[key], verification: 'LEGACY_UNVERIFIED' as const, nodeId: nodeIds[i], cornerKey: key,
    })),
  };
};

export const IJTEMA_BLOCK_GEOMETRY: ReadonlyMap<string, BlockGeometryModel> = new Map(IJTEMA_BLOCKS.map((b) => [b.id, blockGeometryModel(b)]));
