/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpatialGrid } from '../../utils/SpatialGrid';
import { IJTEMA_STREET_GRAPH_DATA } from './streetGraph';
import {
  StreetGateConnector,
  StreetGraphData,
  StreetGraphEdge,
  StreetGraphNode,
  StreetNavigationGraph,
} from './streetGraphTypes';

const nodeId = (index: number): string => `S${index}`;
const edgeId = (index: number): string => `SE${index}`;

/**
 * Expands the compact columnar StreetGraphData into the runtime graph shape
 * (string-keyed nodes/adjacency, like IJTEMA_NAVIGATION_GRAPH_V2) plus a
 * SpatialGrid nearest-node index. Runs once at module load — the venue graph
 * uses the same "build once at import" pattern (graphBuilder.ts).
 */
export const buildStreetNavigationGraph = (data: StreetGraphData): StreetNavigationGraph => {
  const nodes: Record<string, StreetGraphNode> = {};
  const gridPoints: Array<{ id: string; lat: number; lng: number }> = [];

  for (let i = 0; i < data.nodeLat.length; i += 1) {
    const id = nodeId(i);
    nodes[id] = { id, lat: data.nodeLat[i], lng: data.nodeLng[i] };
    gridPoints.push({ id, lat: data.nodeLat[i], lng: data.nodeLng[i] });
  }

  const edges: StreetGraphEdge[] = data.edgeFrom.map((fromIndex, i) => {
    const toIndex = data.edgeTo[i];
    const nameIndex = data.edgeNameIndex[i];
    const geometryFlat = data.edgeGeometry[i] ?? [];
    const geometry =
      geometryFlat.length > 0
        ? Array.from({ length: geometryFlat.length / 2 }, (_, pointIndex) => ({
            lat: geometryFlat[pointIndex * 2],
            lng: geometryFlat[pointIndex * 2 + 1],
          }))
        : undefined;
    const directionCode = data.edgeDirection?.[i] ?? 0;
    const direction = directionCode === 1 ? 'forward' : directionCode === 2 ? 'reverse' : 'both';
    const profileIndex = data.edgeProfileIndex?.[i] ?? -1;

    return {
      id: edgeId(i),
      from: nodeId(fromIndex),
      to: nodeId(toIndex),
      distanceM: data.edgeDistanceM[i],
      direction,
      ...(profileIndex >= 0 && data.profiles?.[profileIndex] ? { profile: data.profiles[profileIndex] } : {}),
      ...(nameIndex >= 0 ? { name: data.names[nameIndex] } : {}),
      ...(geometry ? { geometry } : {}),
    };
  });

  const adjacency: Record<string, StreetGraphEdge[]> = {};
  const addAdjacency = (from: string, edge: StreetGraphEdge) => {
    if (!adjacency[from]) adjacency[from] = [];
    adjacency[from].push(edge);
  };
  for (const edge of edges) {
    if (edge.direction !== 'reverse') {
      addAdjacency(edge.from, edge);
    }
    if (edge.from !== edge.to && edge.direction !== 'forward') {
      // Reverse direction: geometry must be reversed too, or a route walking
      // this edge `to`-to-`from` would render its polyline out of order.
      addAdjacency(edge.to, {
        ...edge,
        from: edge.to,
        to: edge.from,
        ...(edge.geometry ? { geometry: [...edge.geometry].reverse() } : {}),
      });
    }
  }

  const gateConnectors: Record<string, StreetGateConnector> = {};
  data.gateConnectorGateIds.forEach((gateId, i) => {
    gateConnectors[gateId] = {
      gateId,
      nodeId: nodeId(data.gateConnectorNodeIndex[i]),
      distanceM: data.gateConnectorDistanceM[i],
    };
  });

  return {
    nodes,
    edges,
    adjacency,
    gateConnectors,
    metadata: data.metadata,
  };
};

let cachedGraph: StreetNavigationGraph | undefined;
let cachedIndex: SpatialGrid | undefined;

/** Lazy singleton — only built the first time outside-venue routing is actually used. */
export const getStreetNavigationGraph = (): StreetNavigationGraph => {
  if (!cachedGraph) cachedGraph = buildStreetNavigationGraph(IJTEMA_STREET_GRAPH_DATA);
  return cachedGraph;
};

export const getStreetGraphSpatialIndex = (): SpatialGrid => {
  if (!cachedIndex) {
    const graph = getStreetNavigationGraph();
    cachedIndex = new SpatialGrid(
      Object.values(graph.nodes).map((node) => ({ id: node.id, lat: node.lat, lng: node.lng })),
    );
  }
  return cachedIndex;
};

/** Nearest street-graph node to an arbitrary coordinate, or undefined if the graph is empty. */
export const findNearestStreetNode = (
  coordinate: { lat: number; lng: number },
): { node: StreetGraphNode; distanceM: number } | undefined => {
  const graph = getStreetNavigationGraph();
  const nearest = getStreetGraphSpatialIndex().nearest(coordinate.lat, coordinate.lng);
  if (!nearest) return undefined;
  return { node: graph.nodes[nearest.point.id], distanceM: nearest.distanceM };
};
