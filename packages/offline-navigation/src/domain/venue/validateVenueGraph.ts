/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidCoordinate } from '../geo/isValidCoordinate';
import { VenueRoutingGraph } from './VenueDataSource';

const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Structural checks a consumer can run before trusting a graph. Returns human-readable problems (empty = ok).
 * This is NOT pack authentication; signed/verified pack installation is a later milestone (B9).
 * Note A* itself still assumes finite, non-negative weights - this is where that is enforced.
 */
export const validateVenueGraph = (graph: VenueRoutingGraph): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const id of graph.nodeIds()) {
    if (RESERVED_IDS.has(id)) problems.push(`reserved node id '${id}'`);
    if (seen.has(id)) problems.push(`duplicate node id '${id}'`);
    seen.add(id);
    const node = graph.getNode(id);
    if (!node) { problems.push(`node '${id}' listed but not resolvable`); continue; }
    if (!isValidCoordinate({ latitude: node.coordinate.lat, longitude: node.coordinate.lng })) problems.push(`invalid coordinate on '${id}'`);
    for (const e of graph.edgesFrom(id)) {
      if (!Number.isFinite(e.distanceM) || e.distanceM < 0) problems.push(`bad distance on ${id}->${e.to}`);
      if (e.weightMultiplier !== undefined && (!Number.isFinite(e.weightMultiplier) || e.weightMultiplier < 0)) problems.push(`bad multiplier on ${id}->${e.to}`);
      if (!graph.getNode(e.to)) problems.push(`edge ${id}->${e.to} references a missing node`);
    }
  }
  return problems;
};
