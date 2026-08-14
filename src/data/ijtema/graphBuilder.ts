/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_BLOCKS } from './blocks';
import { IJTEMA_CENTRAL_POINTS } from './centralPoints';
import { IJTEMA_GATES } from './gates';
import { IJTEMA_PERIMETER_CONNECTORS, PerimeterConnector } from './perimeterConnectors';
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
  perimeter_connector: 0,
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

const addRastaJunctions = (
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
  edgeKeys: Set<string>,
  rasta: Rasta,
  report: IntersectionConnectorReport[],
): void => {
  for (const junction of rasta.junctions) {
    const from = nodes[junction.fromPointId];
    const to = nodes[junction.toPointId];
    if (!from || !to) {
      throw new Error(`${rasta.id} junction references a missing point: ${junction.fromPointId} -> ${junction.toPointId}`);
    }
    const distanceM = distanceMeters(from.coordinate, to.coordinate);
    addEdge(
      edges,
      {
        from: from.id,
        to: to.id,
        distanceM: Math.max(1, Math.round(distanceM)),
        bidirectional: true,
        pathType: 'intersection_connector',
        name: {
          en: 'Rasta intersection',
          ur: 'راستہ چوراہا',
          romanUrdu: 'Rasta intersection',
        },
        developerLabel: `${from.id} -> ${to.id}`,
      },
      edgeKeys,
    );
    report.push({
      from: from.id,
      to: to.id,
      distanceM: Math.round(distanceM),
      name: 'Rasta intersection',
    });
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

const pointInPolygon = (point: Coordinate, polygon: Coordinate[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.lng > point.lng !== previous.lng > point.lng &&
      point.lat < ((previous.lat - current.lat) * (point.lng - current.lng)) / (previous.lng - current.lng) + current.lat;
    if (intersects) inside = !inside;
  }
  return inside;
};

const orientation = (a: Coordinate, b: Coordinate, c: Coordinate): number => {
  const value = (b.lng - a.lng) * (c.lat - b.lat) - (b.lat - a.lat) * (c.lng - b.lng);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
};

const onSegment = (a: Coordinate, b: Coordinate, c: Coordinate): boolean =>
  b.lng <= Math.max(a.lng, c.lng) + 1e-12 &&
  b.lng + 1e-12 >= Math.min(a.lng, c.lng) &&
  b.lat <= Math.max(a.lat, c.lat) + 1e-12 &&
  b.lat + 1e-12 >= Math.min(a.lat, c.lat);

const segmentsIntersect = (a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean => {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
};

const segmentCrossesPolygonInterior = (start: Coordinate, end: Coordinate, polygon: Coordinate[]): boolean => {
  for (let index = 1; index < 8; index += 1) {
    const t = index / 8;
    if (pointInPolygon({ lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t }, polygon)) {
      return true;
    }
  }

  return polygon.some((point, index) => segmentsIntersect(start, end, point, polygon[(index + 1) % polygon.length]));
};

const crossesOtherBlock = (from: Coordinate, to: Coordinate, sourceBlockId: string): boolean =>
  IJTEMA_BLOCKS.some((block) => block.id !== sourceBlockId && segmentCrossesPolygonInterior(from, to, block.polygon));

const findNearestBlockConnectorNode = (
  coordinate: Coordinate,
  candidates: GraphNode[],
  sourceBlockId: string,
): { node: GraphNode; distanceM: number } | undefined =>
  candidates
    .map((node) => ({ node, distanceM: distanceMeters(coordinate, node.coordinate) }))
    .sort((left, right) => left.distanceM - right.distanceM)
    .find((candidate) => !crossesOtherBlock(coordinate, candidate.node.coordinate, sourceBlockId));

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

const addPerimeterConnector = (
  nodes: Record<string, GraphNode>,
  edges: GraphEdge[],
  edgeKeys: Set<string>,
  connector: PerimeterConnector,
): void => {
  const label: LocalizedLabel = {
    en: 'Perimeter connector',
    ur: 'رابطہ راستہ',
    romanUrdu: 'Perimeter connector',
  };

  for (const point of connector.points) {
    addNode(nodes, {
      id: point.id,
      coordinate: point.coordinate,
      type: 'rasta_point',
      name: { en: point.developerLabel, ur: point.developerLabel, romanUrdu: point.developerLabel },
      developerLabel: point.developerLabel,
      sourceId: connector.id,
    });
  }

  for (let i = 0; i < connector.points.length - 1; i += 1) {
    const from = connector.points[i];
    const to = connector.points[i + 1];
    addEdge(
      edges,
      {
        from: from.id,
        to: to.id,
        distanceM: Math.round(distanceMeters(from.coordinate, to.coordinate)),
        bidirectional: true,
        pathType: 'perimeter_connector',
        name: label,
        developerLabel: `${from.id} -> ${to.id}`,
      },
      edgeKeys,
    );
  }
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
    const pointById = new Map(rasta.points.map((point) => [point.id, point]));
    for (const segment of rasta.segments) {
      const segmentPoints = segment.pointIds.map((pointId) => {
        const point = pointById.get(pointId);
        if (!point) throw new Error(`${segment.id} references missing point ${pointId}`);
        return point;
      });
      addSequentialEdges(edges, edgeKeys, rasta, segmentPoints, 'rasta');
    }
    addRastaJunctions(nodes, edges, edgeKeys, rasta, intersectionConnectors);
  }

  for (const connector of IJTEMA_PERIMETER_CONNECTORS) {
    addPerimeterConnector(nodes, edges, edgeKeys, connector);
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

    if (gate.connectorStatus === 'ground_truth_required') {
      report.warning = 'Physical ground truth is required before enabling this gate connector.';
      warnings.push(`${gate.id}: ${report.warning}`);
      gateConnectors.push(report);
      continue;
    }

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
      const nearest = findNearestBlockConnectorNode(entryNode.coordinate, walkableConnectorNodes, block.id);
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
