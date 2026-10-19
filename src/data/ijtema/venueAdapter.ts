/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VenueDataSource, VenuePlace } from '../../../packages/offline-navigation/src/domain/venue';
import { IJTEMA_BLOCKS } from './blocks';
import { IJTEMA_GATES } from './gates';
import { getBlockEntryNodeIds } from './graphBuilder';
import { IJTEMA_NAVIGATION_GRAPH_V2 } from './navigationGraph';
import type { GraphEdge, NavigationGraphV2 } from './graphTypes';

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Read-only view over the existing Ijtema records. Nothing is copied: edges/nodes are the graph's own objects. */
export const createIjtemaVenueSource = (graph: NavigationGraphV2 = IJTEMA_NAVIGATION_GRAPH_V2): VenueDataSource<GraphEdge> => {
  const connected = (ids: string[]): string[] => ids.filter((id) => own(graph.nodes, id));
  const places = new Map<string, VenuePlace>();
  for (const gate of IJTEMA_GATES) {
    const nodeIds = connected([gate.id]);
    if (nodeIds.length) places.set(gate.id, { id: gate.id, kind: 'gate', nodeIds });
  }
  for (const block of IJTEMA_BLOCKS) {
    const nodeIds = connected(getBlockEntryNodeIds(block.id));
    if (nodeIds.length) places.set(block.id, { id: block.id, kind: 'block', nodeIds });
  }
  return {
    venueId: 'karachi-ijtema',
    dataVersion: graph.metadata.version,
    graph: {
      nodeIds: () => Object.keys(graph.nodes),
      getNode: (id) => (own(graph.nodes, id) ? graph.nodes[id] : undefined),
      edgesFrom: (id) => (own(graph.adjacency, id) ? graph.adjacency[id] : []),
    },
    placeIds: () => [...places.keys()],
    getPlace: (id) => places.get(id),
  };
};

export const IJTEMA_VENUE_SOURCE = createIjtemaVenueSource();
