/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StreetRoutingGraph } from '../../../packages/offline-navigation/src/domain/street';
import { SpatialGrid } from '../../utils/SpatialGrid';
import { findNearestStreetNode, getStreetNavigationGraph } from './streetGraphBuilder';
import type { StreetGraphEdge, StreetGraphNode, StreetNavigationGraph } from './streetGraphTypes';

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

const gridNearest = (graph: StreetNavigationGraph) => {
  const index = new SpatialGrid(Object.values(graph.nodes));
  return (point: { lat: number; lng: number }) => {
    const nearest = index.nearest(point.lat, point.lng);
    return nearest && { node: graph.nodes[nearest.point.id], distanceM: nearest.distanceM };
  };
};

/**
 * Read-only street-routing view over an expanded street graph. Nothing is copied: nodes, adjacency lists and
 * edges (including the builder's pre-reversed two-way copies) are the graph's own objects.
 */
export const createStreetRoutingGraph = (
  graph: StreetNavigationGraph,
  nearestNode: StreetRoutingGraph<StreetGraphEdge, StreetGraphNode>['nearestNode'] = gridNearest(graph),
): StreetRoutingGraph<StreetGraphEdge, StreetGraphNode> => ({
  getNode: (id) => (own(graph.nodes, id) ? graph.nodes[id] : undefined),
  edgesFrom: (id) => (own(graph.adjacency, id) ? graph.adjacency[id] : []),
  nearestNode,
  connectorFor: (placeId) => (own(graph.gateConnectors, placeId) ? graph.gateConnectors[placeId] : undefined),
});

let ijtemaStreetGraph: StreetRoutingGraph<StreetGraphEdge, StreetGraphNode> | undefined;

/**
 * The bundled Karachi Ijtema street graph, bound lazily so it is still only built on first outside route.
 * Nearest-node lookup stays with the builder's own cached spatial index.
 */
export const getIjtemaStreetRoutingGraph = (): StreetRoutingGraph<StreetGraphEdge, StreetGraphNode> =>
  (ijtemaStreetGraph ??= createStreetRoutingGraph(getStreetNavigationGraph(), findNearestStreetNode));
