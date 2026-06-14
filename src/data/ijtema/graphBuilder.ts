/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_BLOCKS } from './blocks';
import { IJTEMA_CENTRAL_POINTS } from './centralPoints';
import { IJTEMA_GATES } from './gates';
import { IJTEMA_RASTAS } from './rastas';
import { IJTEMA_SPECIAL_ROUTES } from './specialRoutes';
import {
  Block,
  Coordinate,
  LocalizedLabel,
  Rasta,
  RastaPoint,
  SpecialRoute,
  SpecialRoutePoint,
} from './types';
import {
  BlockEntryConnectorReport,
  GateConnectorReport,
  GraphEdge,
  GraphEdgePathType,
  GraphNode,
  GraphNodeType,
  IntersectionConnectorReport,
  NavigationGraphV2,
  NavigationGraphV2Report,
} from './graphTypes';

export const NAVIGATION_GRAPH_V2_VERSION = '2026-06-ijtema-v2-navigation-graph';

const INTERSECTION_THRESHOLD_M = 12;
const CENTRAL_CONNECTOR_THRESHOLD_M = 18;
const GATE_CONNECTOR_MAX_M = 320;
const BLOCK_CONNECTOR_MAX_M = 230;

const routeGroupForNode = (nodeId: string): string => {
  const rastaMatch = nodeId.match(/^R\d+-/);
  if (rastaMatch) return nodeId.split('-')[0];
  if (nodeId.startsWith('SPNP-')) return 'SPNP';
  if (nodeId.startsWith('SPSP-')) return 'SPSP';
  if (nodeId.startsWith('SPWP-')) return 'SPWP';
  if (nodeId.startsWith('P')) return 'CENTRAL';
  return nodeId;
};

const emptyTypeCounts = (): Record<GraphNodeType, number> => ({
  rasta_point: 0,
  gate: 0,
  block_entry: 0,
  special_route_point: 0,
  central_point: 0,
  intersection: 0,
});

const emptyEdgeCounts = (): Record<GraphEdgePathType, number> => ({
  rasta: 0,
  gate_connector: 0,
  block_connector: 0,
  special_route: 0,
  central_connector: 0,
  intersection_connector: 0,
});

export const getBlockEntryNodeIds = (blockId: string): string[] => [`${blockId}_C1`, `${blockId}_C2`, `${blockId}_C3`, `${blockId}_C4`];

export const distanceMeters = (from: Coordinate, to: Coordinate): number => {
  const earthRadiusMeters = 6371000;
  const fromLat = degreesToRadians(from.lat);
  const toLat = degreesToRadians(to.lat);
  const deltaLat = degreesToRadians(to.lat - from.lat);
  const deltaLng = degreesToRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const addNode = (nodes: Record<string, GraphNode>, node: GraphNode): void => {
  if (nodes[node.id]) {
    throw new Error(`Duplicate v2 graph node ID: ${node.id}`);
  }
  nodes[node.id] = node;
};

const edgeKey = (from: string, to: string, pathType: GraphEdgePathType): string => `${pathType}:${from}->${to}`;

const addEdge = (edges: GraphEdge[], edge: Omit<GraphEdge, 'id'>, edgeKeys: Set<string>): void => {
  const forwardKey = edgeKey(edge.from, edge.to, edge.pathType);
  const reverseKey = edgeKey(edge.to, edge.from, edge.pathType);
  if (edgeKeys.has(forwardKey) || (edge.bidirectional && edgeKeys.has(reverseKey))) return;

  edgeKeys.add(forwardKey);
  edges.push({
    id: `V2_EDGE_${edges.length + 1}_${edge.pathType}_${edge.from}_${edge.to}`.replace(/[^A-Za-z0-9_]+/g, '_'),
    ...edge,
  });
};

const routeEdgeName = (route: Rasta | SpecialRoute): LocalizedLabel => ({
  en: route.name.en,
  ur: route.name.ur,
  romanUrdu: route.name.romanUrdu,
});

const pointNode = (point: RastaPoint): GraphNode => ({
  id: point.id,
  coordinate: point.coordinate,
  type: 'rasta_point',
  name: point.name,
  developerLabel: point.developerLabel ?? point.id,
  sourceId: point.rastaId,
});

const specialPointNode = (point: SpecialRoutePoint): GraphNode => ({
  id: point.id,
  coordinate: point.coordinate,
  type: 'special_route_point',
  name: point.name,
  developerLabel: point.developerLabel ?? point.id,
  sourceId: point.group,
});

const blockEntryName = (block: Block): LocalizedLabel => ({
  en: `${block.name.en} entrance`,
  ur: `${block.name.ur} داخلہ`,
  romanUrdu: `${block.name.romanUrdu} entrance`,
});

const buildAdjacency = (nodes: Record<string, GraphNode>, edges: GraphEdge[]): Record<string, GraphEdge[]> => {
  const adjacency = Object.fromEntries(Object.keys(nodes).map((nodeId) => [nodeId, [] as GraphEdge[]]));

  for (const edge of edges) {
    adjacency[edge.from].push(edge);
    if (edge.bidirectional) {
      adjacency[edge.to].push({
        ...edge,
        id: `${edge.id}_REVERSE`,
        from: edge.to,
        to: edge.from,
      });
    }
  }

  return adjacency;
};

const getWalkableConnectorNodes = (nodes: Record<string, GraphNode>): GraphNode[] =>
  Object.values(nodes).filter((node) => ['rasta_point', 'special_route_point', 'central_point'].includes(node.type));

export const findNearestGraphNode = (
  coordinate: Coordinate,
  nodes: Record<string, GraphNode>,
  allowedTypes: GraphNodeType[] = ['rasta_point', 'special_route_point', 'central_point'],
): { node: GraphNode; distanceM: number } | undefined => {
  let nearest: { node: GraphNode; distanceM: number } | undefined;

  for (const node of Object.values(nodes)) {
    if (!allowedTypes.includes(node.type)) continue;
    const distanceM = distanceMeters(coordinate, node.coordinate);
    if (!nearest || distanceM < nearest.distanceM) {
      nearest = { node, distanceM };
    }
  }

  return nearest;
};

const addSequentialEdges = (
  edges: GraphEdge[],
  edgeKeys: Set<string>,
  route: Rasta | SpecialRoute,
  points: Array<RastaPoint | SpecialRoutePoint>,
  pathType: 'rasta' | 'special_route',
): void => {
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    addEdge(
      edges,
      {
        from: from.id,
        to: to.id,
        distanceM: Math.round(distanceMeters(from.coordinate, to.coordinate)),
        bidirectional: true,
        pathType,
        name: routeEdgeName(route),
        developerLabel: `${from.id} -> ${to.id}`,
      },
      edgeKeys,
    );
  }
};

const addCentralConnectors = (
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
  edgeKeys: Set<string>,
  report: IntersectionConnectorReport[],
): void => {
  const nonCentralWalkNodes = getWalkableConnectorNodes(nodes).filter((node) => node.type !== 'central_point');

  for (const centralNode of Object.values(nodes).filter((node) => node.type === 'central_point')) {
    const nearest = findNearestFromList(centralNode.coordinate, nonCentralWalkNodes);
    if (!nearest || nearest.distanceM > CENTRAL_CONNECTOR_THRESHOLD_M) continue;

    addEdge(
      edges,
      {
        from: centralNode.id,
        to: nearest.node.id,
        distanceM: Math.max(1, Math.round(nearest.distanceM)),
        bidirectional: true,
        pathType: 'central_connector',
        name: {
          en: 'Central junction connector',
          ur: 'مرکزی جنکشن رابطہ',
          romanUrdu: 'Central junction connector',
        },
        developerLabel: `${centralNode.id} -> ${nearest.node.id}`,
      },
      edgeKeys,
    );
    report.push({
      from: centralNode.id,
      to: nearest.node.id,
      distanceM: Math.round(nearest.distanceM),
      name: 'Central junction connector',
    });
  }
};

const addIntersectionConnectors = (
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
  edgeKeys: Set<string>,
  report: IntersectionConnectorReport[],
): void => {
  const walkNodes = getWalkableConnectorNodes(nodes);

  for (let leftIndex = 0; leftIndex < walkNodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < walkNodes.length; rightIndex += 1) {
      const left = walkNodes[leftIndex];
      const right = walkNodes[rightIndex];
      if (routeGroupForNode(left.id) === routeGroupForNode(right.id)) continue;

      const distanceM = distanceMeters(left.coordinate, right.coordinate);
      if (distanceM > INTERSECTION_THRESHOLD_M) continue;

      addEdge(
        edges,
        {
          from: left.id,
          to: right.id,
          distanceM: Math.max(1, Math.round(distanceM)),
          bidirectional: true,
          pathType: 'intersection_connector',
          name: {
            en: 'Rasta intersection',
            ur: 'راستہ چوراہا',
            romanUrdu: 'Rasta intersection',
          },
          developerLabel: `${left.id} -> ${right.id}`,
        },
        edgeKeys,
      );
      report.push({
        from: left.id,
        to: right.id,
        distanceM: Math.round(distanceM),
        name: 'Rasta intersection',
      });
    }
  }
};

const findNearestFromList = (coordinate: Coordinate, candidates: GraphNode[]): { node: GraphNode; distanceM: number } | undefined => {
  let nearest: { node: GraphNode; distanceM: number } | undefined;

  for (const node of candidates) {
    const distanceM = distanceMeters(coordinate, node.coordinate);
    if (!nearest || distanceM < nearest.distanceM) {
      nearest = { node, distanceM };
    }
  }

  return nearest;
};

const countNodesByType = (nodes: Record<string, GraphNode>): Record<GraphNodeType, number> => {
  const counts = emptyTypeCounts();
  for (const node of Object.values(nodes)) {
    counts[node.type] += 1;
  }
  return counts;
};

const countEdgesByPathType = (edges: GraphEdge[]): Record<GraphEdgePathType, number> => {
  const counts = emptyEdgeCounts();
  for (const edge of edges) {
    counts[edge.pathType] += 1;
  }
  return counts;
};

export const buildNavigationGraphV2 = (): { graph: NavigationGraphV2; report: NavigationGraphV2Report } => {
  const nodes: Record<string, GraphNode> = {};
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const gateConnectors: GateConnectorReport[] = [];
  const blockEntryConnectors: BlockEntryConnectorReport[] = [];
  const intersectionConnectors: IntersectionConnectorReport[] = [];
  const warnings: string[] = [];

  for (const rasta of IJTEMA_RASTAS) {
    rasta.points.forEach((point) => addNode(nodes, pointNode(point)));
    addSequentialEdges(edges, edgeKeys, rasta, rasta.points, 'rasta');
  }

  for (const route of IJTEMA_SPECIAL_ROUTES) {
    route.points.forEach((point) => addNode(nodes, specialPointNode(point)));
    addSequentialEdges(edges, edgeKeys, route, route.points, 'special_route');
  }

  for (const point of IJTEMA_CENTRAL_POINTS) {
    addNode(nodes, {
      id: point.id,
      coordinate: point.coordinate,
      type: 'central_point',
      name: point.name,
      developerLabel: point.developerLabel,
      sourceId: 'central_points',
    });
  }

  for (const gate of IJTEMA_GATES) {
    if (gate.routingStatus !== 'routable' || !gate.coordinate) continue;
    addNode(nodes, {
      id: gate.id,
      coordinate: gate.coordinate,
      type: 'gate',
      name: gate.name,
      developerLabel: gate.id,
      sourceId: 'official_gates',
    });
  }

  for (const block of IJTEMA_BLOCKS) {
    const entryCoordinates = [block.entryPoints.c1, block.entryPoints.c2, block.entryPoints.c3, block.entryPoints.c4];
    getBlockEntryNodeIds(block.id).forEach((entryId, index) =>
      addNode(nodes, {
        id: entryId,
        coordinate: entryCoordinates[index],
        type: 'block_entry',
        name: blockEntryName(block),
        developerLabel: entryId,
        sourceId: block.id,
      }),
    );
  }

  addIntersectionConnectors(nodes, edges, edgeKeys, intersectionConnectors);
  addCentralConnectors(nodes, edges, edgeKeys, intersectionConnectors);

  const walkableConnectorNodes = getWalkableConnectorNodes(nodes);

  for (const gate of IJTEMA_GATES.filter((item) => item.routingStatus === 'routable' && item.coordinate)) {
    const nearest = findNearestFromList(gate.coordinate!, walkableConnectorNodes);
    const report: GateConnectorReport = {
      gateId: gate.id,
      gateNumber: gate.number,
      connected: false,
      nearestNodeId: nearest?.node.id,
      distanceM: nearest ? Math.round(nearest.distanceM) : undefined,
    };

    if (!nearest || nearest.distanceM > GATE_CONNECTOR_MAX_M) {
      report.warning = `No valid graph connector within ${GATE_CONNECTOR_MAX_M}m.`;
      warnings.push(`${gate.id}: ${report.warning}`);
      gateConnectors.push(report);
      continue;
    }

    addEdge(
      edges,
      {
        from: gate.id,
        to: nearest.node.id,
        distanceM: Math.max(1, Math.round(nearest.distanceM)),
        bidirectional: true,
        pathType: 'gate_connector',
        name: {
          en: `${gate.name.en} approach`,
          ur: `${gate.name.ur} راستہ`,
          romanUrdu: `${gate.name.romanUrdu} approach`,
        },
        developerLabel: `${gate.id} -> ${nearest.node.id}`,
      },
      edgeKeys,
    );
    report.connected = true;
    gateConnectors.push(report);
  }

  for (const block of IJTEMA_BLOCKS) {
    for (const entryId of getBlockEntryNodeIds(block.id)) {
      const entryNode = nodes[entryId];
      const nearest = findNearestFromList(entryNode.coordinate, walkableConnectorNodes);
      const report: BlockEntryConnectorReport = {
        blockId: block.id,
        entryId,
        connected: false,
        nearestNodeId: nearest?.node.id,
        distanceM: nearest ? Math.round(nearest.distanceM) : undefined,
      };

      if (!nearest || nearest.distanceM > BLOCK_CONNECTOR_MAX_M) {
        report.warning = `No valid graph connector within ${BLOCK_CONNECTOR_MAX_M}m.`;
        warnings.push(`${entryId}: ${report.warning}`);
        blockEntryConnectors.push(report);
        continue;
      }

      addEdge(
        edges,
        {
          from: entryId,
          to: nearest.node.id,
          distanceM: Math.max(1, Math.round(nearest.distanceM)),
          bidirectional: true,
          pathType: 'block_connector',
          name: blockEntryName(block),
          developerLabel: `${entryId} -> ${nearest.node.id}`,
        },
        edgeKeys,
      );
      report.connected = true;
      blockEntryConnectors.push(report);
    }
  }

  const graph: NavigationGraphV2 = {
    nodes,
    edges,
    adjacency: buildAdjacency(nodes, edges),
    metadata: {
      version: NAVIGATION_GRAPH_V2_VERSION,
      source: 'ijtema_v2',
    },
  };

  const report: NavigationGraphV2Report = {
    nodeCountByType: countNodesByType(nodes),
    edgeCountByPathType: countEdgesByPathType(edges),
    gateConnectors,
    blockEntryConnectors,
    intersectionConnectors,
    warnings,
  };

  return { graph, report };
};
