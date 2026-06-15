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
  distanceMeters,
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
  routeCostM?: number;
  startConnectorDistanceM?: number;
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
  costM: number;
}

interface SelectedRoutePath {
  path: ShortestPathResult;
  startLabel: string;
  startResolution?: RouteStartResolutionV2;
  startCoordinate?: AppCoordinate;
  startConnectorDistanceM: number;
  routeCostM: number;
}

const DEFAULT_WALKING_SPEED_MS = 1.4;
const NEEDS_VERIFICATION_GATE_PENALTY_M = 120;
const COORDINATE_DEDUP_TOLERANCE_M = 2;

const toAppCoordinate = (node: GraphNode): AppCoordinate => ({
  latitude: node.coordinate.lat,
  longitude: node.coordinate.lng,
});

const appToV2Coordinate = (coordinate: AppCoordinate) => ({
  lat: coordinate.latitude,
  lng: coordinate.longitude,
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
  if (startNodeId === destinationNodeId) {
    return {
      nodes: [startNodeId],
      edges: [],
      distanceM: 0,
      costM: 0,
    };
  }

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
    costM: distances[destinationNodeId],
  };
};

const findBestPath = (startNodeIds: string[], destinationNodeIds: string[]): ShortestPathResult | undefined => {
  let bestPath: ShortestPathResult | undefined;

  for (const startNodeId of startNodeIds) {
    for (const destinationNodeId of destinationNodeIds) {
      const path = calculateShortestPath(startNodeId, destinationNodeId);
      if (!path) continue;
      if (!bestPath || path.costM < bestPath.costM) {
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

const prependOutsideApproachInstruction = (
  instructions: NavigationInstruction[],
  selected: SelectedRoutePath,
): NavigationInstruction[] => {
  if (selected.startResolution?.mode !== 'outside' || selected.startConnectorDistanceM <= 0 || !selected.startCoordinate) {
    return instructions;
  }

  const gateLabel = selected.startResolution.gate?.name.en ?? selected.startLabel;
  return [
    {
      id: 'v2-outside-approach',
      text: `Walk ${selected.startConnectorDistanceM} meters to enter through ${gateLabel}.`,
      urduText: `${gateLabel} سے داخل ہونے کے لیے ${selected.startConnectorDistanceM} میٹر چلیں۔`,
      distance: selected.startConnectorDistanceM,
      type: 'straight',
      coordinate: selected.startCoordinate,
    },
    ...instructions.map((instruction, index) => ({
      ...instruction,
      id: instruction.id === 'v2-start' ? 'v2-entry-start' : instruction.id.replace(/^v2-step-(\d+)$/, (_match, step) => `v2-step-${Number(step) + 1}`),
      ...(index === 0
        ? {
            text: `Enter through ${gateLabel}.`,
            urduText: `${gateLabel} سے داخل ہوں۔`,
          }
        : {}),
    })),
  ];
};

const gatePenaltyM = (gate: Gate | undefined): number => (gate?.status === 'needs_verification' ? NEEDS_VERIFICATION_GATE_PENALTY_M : 0);

const appendCoordinate = (coordinates: AppCoordinate[], coordinate: AppCoordinate): void => {
  const previous = coordinates[coordinates.length - 1];
  if (
    previous &&
    distanceMeters(appToV2Coordinate(previous), appToV2Coordinate(coordinate)) <= COORDINATE_DEDUP_TOLERANCE_M
  ) {
    return;
  }
  coordinates.push(coordinate);
};

const pathCoordinates = (path: ShortestPathResult, startCoordinate?: AppCoordinate): AppCoordinate[] => {
  const coordinates: AppCoordinate[] = [];
  if (startCoordinate) appendCoordinate(coordinates, startCoordinate);
  path.nodes.forEach((nodeId) => appendCoordinate(coordinates, toAppCoordinate(IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId])));
  return coordinates;
};

const selectOutsidePath = (
  start: Extract<RoutingStartV2, { type: 'outside_coordinate' }>,
  destinationNodeIds: string[],
): SelectedRoutePath | undefined => {
  const startPoint = appToV2Coordinate(start.coordinate);
  const gates = start.manualGateId
    ? IJTEMA_GATES.filter((gate) => gate.id === start.manualGateId)
    : IJTEMA_GATES;
  let selected: SelectedRoutePath | undefined;

  for (const gate of gates) {
    if (!gate.coordinate || gate.routingStatus !== 'routable' || !gate.canStartRouteFromOutside) continue;
    if (getConnectedCandidates([gate.id]).length === 0) continue;

    const path = findBestPath([gate.id], destinationNodeIds);
    if (!path) continue;

    const connectorDistanceM = Math.round(distanceMeters(startPoint, gate.coordinate));
    const routeCostM = connectorDistanceM + path.costM + gatePenaltyM(gate);
    const startResolution: RouteStartResolutionV2 = {
      mode: 'outside',
      startType: start.manualGateId ? 'selected_official_gate' : 'nearest_official_gate',
      coordinate: { latitude: gate.coordinate!.lat, longitude: gate.coordinate!.lng },
      candidateNodes: [gate.id],
      gate,
    };

    if (!selected || routeCostM < selected.routeCostM) {
      selected = {
        path,
        startLabel: gate.name.en,
        startResolution,
        startCoordinate: start.coordinate,
        startConnectorDistanceM: connectorDistanceM,
        routeCostM,
      };
    }
  }

  return selected;
};

const selectDefaultPath = (start: RoutingStartV2, destinationNodeIds: string[]): SelectedRoutePath | undefined => {
  const startCandidates = resolveStartCandidates(start);
  if (startCandidates.nodeIds.length === 0) return undefined;

  const path = findBestPath(startCandidates.nodeIds, destinationNodeIds);
  if (!path) return undefined;

  const firstNode = IJTEMA_NAVIGATION_GRAPH_V2.nodes[path.nodes[0]];
  const startCoordinate =
    start.type === 'inside_coordinate' || start.type === 'outside_coordinate'
      ? start.coordinate
      : undefined;
  const startConnectorDistanceM = startCoordinate && firstNode
    ? Math.round(distanceMeters(appToV2Coordinate(startCoordinate), firstNode.coordinate))
    : 0;

  return {
    path,
    startLabel: startCandidates.label,
    startResolution: startCandidates.startResolution,
    startCoordinate,
    startConnectorDistanceM,
    routeCostM: startConnectorDistanceM + path.costM,
  };
};

export class RoutingServiceV2 {
  static calculateRoute(options: CalculateRouteV2Options): RoutePreviewV2 | null {
    const walkingSpeedMs = options.walkingSpeedMs ?? DEFAULT_WALKING_SPEED_MS;
    const destinationCandidates = resolveDestinationCandidates(options.destination);

    if (destinationCandidates.nodeIds.length === 0) {
      return null;
    }

    const selected = options.start.type === 'outside_coordinate'
      ? selectOutsidePath(options.start, destinationCandidates.nodeIds)
      : selectDefaultPath(options.start, destinationCandidates.nodeIds);
    if (!selected) return null;

    const { path } = selected;
    const coordinates = pathCoordinates(path, selected.startCoordinate);
    const totalDistance = Math.round(selected.startConnectorDistanceM + path.distanceM);
    const estimatedTimeMin = Math.max(1, Math.ceil(totalDistance / walkingSpeedMs / 60));
    const instructions = prependOutsideApproachInstruction(generateInstructions(path, destinationCandidates.label), selected);

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
      startLabel: selected.startLabel,
      destinationLabel: destinationCandidates.label,
      startResolution: selected.startResolution,
      destinationEntryNodeId: options.destination.type === 'block' ? path.nodes[path.nodes.length - 1] : undefined,
      routeCostM: Math.round(selected.routeCostM),
      startConnectorDistanceM: selected.startConnectorDistanceM,
    };
  }
}
