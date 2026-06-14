/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Block,
  Gate,
  GraphEdge,
  GraphNode,
  IJTEMA_BLOCKS,
  IJTEMA_GATES,
  IJTEMA_NAVIGATION_GRAPH_V2,
  IJTEMA_RASTAS,
  IJTEMA_SPECIAL_ROUTES,
  getBlockEntryNodeIds,
} from '../data/ijtema';
import {
  Coordinate as AppCoordinate,
  NavigationInstruction,
  RoutePreview,
  RouteSegment,
} from '../models/types';
import { EntryGateRoutingService, RouteStartResolutionV2 } from './EntryGateRoutingService';

export type RoutingStartV2 =
  | { type: 'gate'; gateId: string }
  | { type: 'block'; blockId: string }
  | { type: 'rasta'; rastaId: string }
  | { type: 'special_route'; routeId: string }
  | { type: 'inside_coordinate'; coordinate: AppCoordinate }
  | { type: 'outside_coordinate'; coordinate: AppCoordinate; manualGateId?: string };

export type RoutingDestinationV2 =
  | { type: 'gate'; gateId: string }
  | { type: 'block'; blockId: string }
  | { type: 'rasta'; rastaId: string }
  | { type: 'special_route'; routeId: string };

export interface CalculateRouteV2Options {
  start: RoutingStartV2;
  destination: RoutingDestinationV2;
  walkingSpeedMs?: number;
}

export interface RoutePreviewV2 extends RoutePreview {
  instructions: NavigationInstruction[];
  startLabel: string;
  destinationLabel: string;
  startResolution?: RouteStartResolutionV2;
  destinationEntryNodeId?: string;
}

interface RouteCandidateSet {
  nodeIds: string[];
  label: string;
  startResolution?: RouteStartResolutionV2;
}

interface ShortestPathResult {
  nodes: string[];
  edges: GraphEdge[];
  distanceM: number;
}

const DEFAULT_WALKING_SPEED_MS = 1.4;

const toAppCoordinate = (node: GraphNode): AppCoordinate => ({
  latitude: node.coordinate.lat,
  longitude: node.coordinate.lng,
});

const routeNodeTypes = new Set(['rasta_point', 'special_route_point', 'central_point', 'gate', 'block_entry']);

const getBlock = (blockId: string): Block | undefined => IJTEMA_BLOCKS.find((block) => block.id === blockId);
const getGate = (gateId: string): Gate | undefined => IJTEMA_GATES.find((gate) => gate.id === gateId);

const isRoutableGraphNode = (nodeId: string): boolean => {
  const node = IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId];
  return Boolean(node && routeNodeTypes.has(node.type));
};

const getConnectedCandidates = (nodeIds: string[]): string[] =>
  nodeIds.filter((nodeId) => isRoutableGraphNode(nodeId) && IJTEMA_NAVIGATION_GRAPH_V2.adjacency[nodeId]?.length > 0);

const getBlockEntryCandidates = (blockId: string): string[] => getConnectedCandidates(getBlockEntryNodeIds(blockId));

const getRastaCandidates = (rastaId: string): string[] => {
  const rasta = IJTEMA_RASTAS.find((item) => item.id === rastaId);
  return getConnectedCandidates(rasta?.points.map((point) => point.id) ?? []);
};

const getSpecialRouteCandidates = (routeId: string): string[] => {
  const route = IJTEMA_SPECIAL_ROUTES.find((item) => item.id === routeId);
  return getConnectedCandidates(route?.points.map((point) => point.id) ?? []);
};

const friendlyNodeName = (nodeId: string): string => {
  const node = IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId];
  if (!node) return 'the route';

  if (node.type === 'central_point') return 'central junction';
  if (node.type === 'block_entry') return node.name.en;
  if (node.type === 'gate') return node.name.en;
  if (node.type === 'rasta_point') {
    const rastaId = node.sourceId;
    const rasta = IJTEMA_RASTAS.find((item) => item.id === rastaId);
    return rasta?.name.en ?? 'rasta';
  }
  if (node.type === 'special_route_point') {
    return node.name.en.replace(/\s+Point\s+\d+$/i, '');
  }

  return node.name.en;
};

const instructionTextForEdge = (edge: GraphEdge): string => {
  if (edge.pathType === 'gate_connector') return `Continue from ${edge.name.en}`;
  if (edge.pathType === 'block_connector') return `Continue to ${edge.name.en}`;
  if (edge.pathType === 'perimeter_connector') return 'Continue along the connector path';
  if (edge.pathType === 'intersection_connector' || edge.pathType === 'central_connector') return 'Continue through the junction';
  return `Continue on ${edge.name.en}`;
};

const instructionUrduForEdge = (edge: GraphEdge): string => {
  if (edge.pathType === 'gate_connector') return `${edge.name.ur ?? edge.name.en} سے آگے بڑھیں`;
  if (edge.pathType === 'block_connector') return `${edge.name.ur ?? edge.name.en} تک جائیں`;
  if (edge.pathType === 'perimeter_connector') return 'رابطہ راستے پر چلتے رہیں';
  if (edge.pathType === 'intersection_connector' || edge.pathType === 'central_connector') return 'جنکشن سے آگے بڑھیں';
  return `${edge.name.ur ?? edge.name.en} پر چلتے رہیں`;
};

const generateInstructions = (path: ShortestPathResult, destinationLabel: string): NavigationInstruction[] => {
  const instructions: NavigationInstruction[] = [];
  const firstNode = IJTEMA_NAVIGATION_GRAPH_V2.nodes[path.nodes[0]];

  instructions.push({
    id: 'v2-start',
    text: `Start from ${friendlyNodeName(path.nodes[0])}.`,
    urduText: `${firstNode?.name.ur ?? friendlyNodeName(path.nodes[0])} سے شروع کریں۔`,
    distance: 0,
    type: 'straight',
    coordinate: firstNode ? toAppCoordinate(firstNode) : { latitude: 0, longitude: 0 },
  });

  path.edges.forEach((edge, index) => {
    const toNode = IJTEMA_NAVIGATION_GRAPH_V2.nodes[edge.to];
    instructions.push({
      id: `v2-step-${index + 1}`,
      text: `${instructionTextForEdge(edge)} for ${Math.round(edge.distanceM)} meters.`,
      urduText: `${instructionUrduForEdge(edge)} (${Math.round(edge.distanceM)} میٹر)۔`,
      distance: edge.distanceM,
      type: 'straight',
      coordinate: toNode ? toAppCoordinate(toNode) : { latitude: 0, longitude: 0 },
    });
  });

  const finalNode = IJTEMA_NAVIGATION_GRAPH_V2.nodes[path.nodes[path.nodes.length - 1]];
  instructions.push({
    id: 'v2-arrival',
    text: `You have reached ${destinationLabel}.`,
    urduText: `آپ ${destinationLabel} پہنچ گئے ہیں۔`,
    distance: 0,
    type: 'arrival',
    coordinate: finalNode ? toAppCoordinate(finalNode) : { latitude: 0, longitude: 0 },
  });

  return instructions;
};

const resolveStartCandidates = (start: RoutingStartV2): RouteCandidateSet => {
  if (start.type === 'gate') {
    const gate = getGate(start.gateId);
    return {
      nodeIds: gate?.routingStatus === 'routable' ? getConnectedCandidates([start.gateId]) : [],
      label: gate?.name.en ?? start.gateId,
    };
  }

  if (start.type === 'block') {
    const block = getBlock(start.blockId);
    return {
      nodeIds: getBlockEntryCandidates(start.blockId),
      label: block?.name.en ?? start.blockId,
    };
  }

  if (start.type === 'rasta') {
    const rasta = IJTEMA_RASTAS.find((item) => item.id === start.rastaId);
    return {
      nodeIds: getRastaCandidates(start.rastaId),
      label: rasta?.name.en ?? start.rastaId,
    };
  }

  if (start.type === 'special_route') {
    const route = IJTEMA_SPECIAL_ROUTES.find((item) => item.id === start.routeId);
    return {
      nodeIds: getSpecialRouteCandidates(start.routeId),
      label: route?.name.en ?? start.routeId,
    };
  }

  if (start.type === 'outside_coordinate') {
    const startResolution = EntryGateRoutingService.resolveRouteStartForUser(start.coordinate, {
      manualGateId: start.manualGateId,
      forceOutside: true,
    });
    return {
      nodeIds: getConnectedCandidates(startResolution.candidateNodes),
      label: startResolution.gate?.name.en ?? 'Official entry gate',
      startResolution,
    };
  }

  const startResolution = EntryGateRoutingService.resolveRouteStartForUser(start.coordinate);
  return {
    nodeIds: getConnectedCandidates(startResolution.candidateNodes),
    label: 'Current location',
    startResolution,
  };
};

const resolveDestinationCandidates = (destination: RoutingDestinationV2): RouteCandidateSet => {
  if (destination.type === 'gate') {
    const gate = getGate(destination.gateId);
    return {
      nodeIds: gate?.routingStatus === 'routable' ? getConnectedCandidates([destination.gateId]) : [],
      label: gate?.name.en ?? destination.gateId,
    };
  }

  if (destination.type === 'rasta') {
    const rasta = IJTEMA_RASTAS.find((item) => item.id === destination.rastaId);
    return {
      nodeIds: getRastaCandidates(destination.rastaId),
      label: rasta?.name.en ?? destination.rastaId,
    };
  }

  if (destination.type === 'special_route') {
    const route = IJTEMA_SPECIAL_ROUTES.find((item) => item.id === destination.routeId);
    return {
      nodeIds: getSpecialRouteCandidates(destination.routeId),
      label: route?.name.en ?? destination.routeId,
    };
  }

  const block = getBlock(destination.blockId);
  return {
    nodeIds: getBlockEntryCandidates(destination.blockId),
    label: block?.name.en ?? destination.blockId,
  };
};

const calculateShortestPath = (startNodeId: string, destinationNodeId: string): ShortestPathResult | undefined => {
  if (startNodeId === destinationNodeId) return undefined;

  const distances: Record<string, number> = { [startNodeId]: 0 };
  const previousNode: Record<string, string | undefined> = {};
  const previousEdge: Record<string, GraphEdge | undefined> = {};
  const unvisited = new Set(Object.keys(IJTEMA_NAVIGATION_GRAPH_V2.nodes));

  while (unvisited.size > 0) {
    let current: string | undefined;
    let currentDistance = Infinity;

    for (const nodeId of unvisited) {
      const distance = distances[nodeId] ?? Infinity;
      if (distance < currentDistance) {
        current = nodeId;
        currentDistance = distance;
      }
    }

    if (!current || currentDistance === Infinity) break;
    if (current === destinationNodeId) break;
    unvisited.delete(current);

    for (const edge of IJTEMA_NAVIGATION_GRAPH_V2.adjacency[current] ?? []) {
      if (!unvisited.has(edge.to)) continue;
      const weight = edge.distanceM * (edge.weightMultiplier ?? 1);
      const nextDistance = currentDistance + weight;
      if (nextDistance < (distances[edge.to] ?? Infinity)) {
        distances[edge.to] = nextDistance;
        previousNode[edge.to] = current;
        previousEdge[edge.to] = edge;
      }
    }
  }

  if (distances[destinationNodeId] === undefined) return undefined;

  const nodes: string[] = [];
  const edges: GraphEdge[] = [];
  let cursor: string | undefined = destinationNodeId;

  while (cursor) {
    nodes.unshift(cursor);
    const edge = previousEdge[cursor];
    if (edge) edges.unshift(edge);
    cursor = previousNode[cursor];
  }

  if (nodes[0] !== startNodeId || nodes.length < 2) return undefined;

  return {
    nodes,
    edges,
    distanceM: edges.reduce((sum, edge) => sum + edge.distanceM, 0),
  };
};

const findBestPath = (startNodeIds: string[], destinationNodeIds: string[]): ShortestPathResult | undefined => {
  let bestPath: ShortestPathResult | undefined;

  for (const startNodeId of startNodeIds) {
    for (const destinationNodeId of destinationNodeIds) {
      const path = calculateShortestPath(startNodeId, destinationNodeId);
      if (!path) continue;
      if (!bestPath || path.distanceM < bestPath.distanceM) {
        bestPath = path;
      }
    }
  }

  return bestPath;
};

const routeSegmentsFromPath = (path: ShortestPathResult): RouteSegment[] =>
  path.edges.map((edge) => ({
    fromId: edge.from,
    toId: edge.to,
    distance: edge.distanceM,
    isRasta: edge.pathType === 'rasta' || edge.pathType === 'special_route',
    name: edge.name.en,
  }));

export class RoutingServiceV2 {
  static calculateRoute(options: CalculateRouteV2Options): RoutePreviewV2 | null {
    const walkingSpeedMs = options.walkingSpeedMs ?? DEFAULT_WALKING_SPEED_MS;
    const startCandidates = resolveStartCandidates(options.start);
    const destinationCandidates = resolveDestinationCandidates(options.destination);

    if (startCandidates.nodeIds.length === 0 || destinationCandidates.nodeIds.length === 0) {
      return null;
    }

    const path = findBestPath(startCandidates.nodeIds, destinationCandidates.nodeIds);
    if (!path) return null;

    const coordinates = path.nodes.map((nodeId) => toAppCoordinate(IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId]));
    const totalDistance = Math.round(path.distanceM);
    const estimatedTimeMin = Math.max(1, Math.ceil(totalDistance / walkingSpeedMs / 60));
    const instructions = generateInstructions(path, destinationCandidates.label);

    return {
      id: `v2_route_${path.nodes[0]}_${path.nodes[path.nodes.length - 1]}`.replace(/[^A-Za-z0-9_]+/g, '_'),
      coordinates,
      polyline: coordinates,
      nodes: path.nodes,
      totalDistance,
      totalTime: estimatedTimeMin,
      estimatedTimeMin,
      segments: routeSegmentsFromPath(path),
      instructions,
      startLabel: startCandidates.label,
      destinationLabel: destinationCandidates.label,
      startResolution: startCandidates.startResolution,
      destinationEntryNodeId: options.destination.type === 'block' ? path.nodes[path.nodes.length - 1] : undefined,
    };
  }
}
