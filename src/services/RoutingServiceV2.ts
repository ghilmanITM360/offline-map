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
  RouteSegment,
  V2RoutePreview,
} from '../models/types';
import { EntryGateRoutingService, RouteStartResolutionV2 } from './EntryGateRoutingService';
import { AStarNeighbor, reconstructAStarPath, runAStar } from '../utils/AStar';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
import { gatePenaltyM, isWithinStreetGraphRadius, selectStreetGraphOutsidePath } from './OutsideStreetRoutingService';
import { generateStreetInstructions } from './StreetInstructionService';

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

export interface RoutePreviewV2 extends V2RoutePreview {
  instructions: NavigationInstruction[];
  startLabel: string;
  destinationLabel: string;
  startResolution?: RouteStartResolutionV2;
  destinationEntryNodeId?: string;
  routeCostM?: number;
  startConnectorDistanceM?: number;
  /** How many leading entries of `coordinates` belong to the outside (pre-gate) leg — 0 when the leg is a plain beeline. */
  outsideLegCoordinateCount?: number;
  outsideLegSanityCapExceeded?: boolean;
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
  /** Road-following outside-leg coordinates (street graph), when used instead of a straight beeline. */
  outsideLegCoordinates?: Array<{ lat: number; lng: number }>;
  outsideLegSanityCapExceeded?: boolean;
  /** Real decision-point sequence for turn-by-turn generation (subset of outsideLegCoordinates) — street-graph routes only. */
  outsideLegTopologyCoordinates?: AppCoordinate[];
  outsideLegTopologyDistancesM?: number[];
  outsideLegTopologyNames?: Array<string | undefined>;
}

const DEFAULT_WALKING_SPEED_MS = 1.4;
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

const heuristicCostM = (fromNodeId: string, toNodeId: string): number => {
  const from = IJTEMA_NAVIGATION_GRAPH_V2.nodes[fromNodeId];
  const to = IJTEMA_NAVIGATION_GRAPH_V2.nodes[toNodeId];
  if (!from || !to) return 0;
  return distanceMeters(from.coordinate, to.coordinate);
};

// Every weighted edge (distanceM * (weightMultiplier ?? 1)) is >= its
// straight-line endpoint distance — no weightMultiplier below 1 is used
// anywhere in the v2 graph today — so haversine-based heuristics below stay
// admissible.
const internalGraphNeighbors = (nodeId: string): AStarNeighbor<GraphEdge>[] =>
  (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[nodeId] ?? []).map((edge) => ({
    to: edge.to,
    weight: edge.distanceM * (edge.weightMultiplier ?? 1),
    edge,
  }));

const calculateShortestPath = (startNodeId: string, destinationNodeId: string): ShortestPathResult | undefined => {
  if (startNodeId === destinationNodeId) {
    return {
      nodes: [startNodeId],
      edges: [],
      distanceM: 0,
      costM: 0,
    };
  }

  const result = runAStar<GraphEdge>({
    seeds: [{ id: startNodeId, gScore: 0 }],
    heuristic: (nodeId) => heuristicCostM(nodeId, destinationNodeId),
    neighbors: internalGraphNeighbors,
    isGoal: (nodeId) => nodeId === destinationNodeId,
  });
  if (!result) return undefined;

  const { nodes, edges } = reconstructAStarPath(result, result.goalId);
  if (nodes[0] !== startNodeId || nodes.length < 2) return undefined;

  return {
    nodes,
    edges,
    distanceM: edges.reduce((sum, edge) => sum + edge.distanceM, 0),
    costM: result.gScore[result.goalId],
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

const renumberAndRewriteEntry = (
  instructions: NavigationInstruction[],
  outsideStepCount: number,
  gateLabel: string,
): NavigationInstruction[] =>
  instructions.map((instruction, index) => ({
    ...instruction,
    id: instruction.id === 'v2-start' ? 'v2-entry-start' : instruction.id.replace(/^v2-step-(\d+)$/, (_match, step) => `v2-step-${Number(step) + outsideStepCount}`),
    ...(index === 0
      ? {
          text: `Enter through ${gateLabel}.`,
          urduText: `${gateLabel} سے داخل ہوں۔`,
        }
      : {}),
  }));

const prependOutsideApproachInstruction = (
  instructions: NavigationInstruction[],
  selected: SelectedRoutePath,
): NavigationInstruction[] => {
  if (selected.startResolution?.mode !== 'outside' || selected.startConnectorDistanceM <= 0 || !selected.startCoordinate) {
    return instructions;
  }

  const gateLabel = selected.startResolution.gate?.name.en ?? selected.startLabel;

  // Road-following outside leg: real turn-by-turn from the street graph,
  // one instruction per topology hop instead of a single distance blob.
  if (selected.outsideLegTopologyCoordinates && selected.outsideLegTopologyDistancesM && selected.outsideLegTopologyNames) {
    const streetSteps = generateStreetInstructions(
      selected.outsideLegTopologyCoordinates,
      selected.outsideLegTopologyDistancesM,
      selected.outsideLegTopologyNames,
      gateLabel,
    );
    if (streetSteps.length > 0) {
      return [...streetSteps, ...renumberAndRewriteEntry(instructions, streetSteps.length, gateLabel)];
    }
    // Fall through to the beeline-style single instruction if street
    // instruction generation produced nothing (e.g. malformed topology data).
  }

  return [
    {
      id: 'v2-outside-approach',
      text: `Walk ${selected.startConnectorDistanceM} meters to enter through ${gateLabel}.`,
      urduText: `${gateLabel} سے داخل ہونے کے لیے ${selected.startConnectorDistanceM} میٹر چلیں۔`,
      distance: selected.startConnectorDistanceM,
      type: 'straight',
      coordinate: selected.startCoordinate,
    },
    ...renumberAndRewriteEntry(instructions, 1, gateLabel),
  ];
};

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

const pathCoordinates = (
  path: ShortestPathResult,
  startCoordinate?: AppCoordinate,
  outsideLegCoordinates?: Array<{ lat: number; lng: number }>,
): { coordinates: AppCoordinate[]; outsideLegCoordinateCount: number } => {
  const coordinates: AppCoordinate[] = [];
  if (startCoordinate) appendCoordinate(coordinates, startCoordinate);
  outsideLegCoordinates?.forEach((coordinate) =>
    appendCoordinate(coordinates, { latitude: coordinate.lat, longitude: coordinate.lng }),
  );

  // path.nodes[0] is the shared boundary node (the entry gate for an
  // outside-venue route). Append it explicitly and read back its real index —
  // appendCoordinate may dedup it onto the outside leg's already-appended gate
  // coordinate (street-graph legs end on the gate's exact coordinate too), in
  // which case the boundary is the existing last index, not a new one.
  if (path.nodes.length > 0) {
    appendCoordinate(coordinates, toAppCoordinate(IJTEMA_NAVIGATION_GRAPH_V2.nodes[path.nodes[0]]));
  }
  const outsideLegCoordinateCount = Math.max(0, coordinates.length - 1);

  path.nodes.slice(1).forEach((nodeId) => appendCoordinate(coordinates, toAppCoordinate(IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId])));
  return { coordinates, outsideLegCoordinateCount };
};

interface OutsideGateSeed {
  gate: Gate;
  connectorDistanceM: number;
  seedCostM: number;
}

const resolveOutsideGateSeeds = (
  startPoint: { lat: number; lng: number },
  gates: Gate[],
): OutsideGateSeed[] =>
  gates
    .filter((gate) => gate.coordinate && gate.routingStatus === 'routable' && gate.canStartRouteFromOutside)
    .filter((gate) => getConnectedCandidates([gate.id]).length > 0)
    .map((gate) => {
      const connectorDistanceM = Math.round(distanceMeters(startPoint, gate.coordinate!));
      return { gate, connectorDistanceM, seedCostM: connectorDistanceM + gatePenaltyM(gate) };
    });

const heuristicToNearestDestination = (nodeId: string, destinationNodeIds: string[]): number => {
  const node = IJTEMA_NAVIGATION_GRAPH_V2.nodes[nodeId];
  if (!node) return 0;
  let min = Infinity;
  for (const destinationId of destinationNodeIds) {
    const destination = IJTEMA_NAVIGATION_GRAPH_V2.nodes[destinationId];
    if (!destination) continue;
    const distance = distanceMeters(node.coordinate, destination.coordinate);
    if (distance < min) min = distance;
  }
  return min === Infinity ? 0 : min;
};

// Multi-source A*: seeds the heap with every candidate gate simultaneously
// (priority = connector distance + gate penalty) instead of running a full
// graph search once per gate. First destination pop is optimal because the
// heuristic (straight-line distance to the nearest destination candidate) is
// admissible for every source, same invariant as single-source A*. The
// winning seed is recovered by walking the reconstructed path back to its
// root — seeds are never reached via a relaxation (they're pre-seeded
// directly into gScore), so the root of any path is always the seed it
// actually originated from, even if the path passes through another gate's
// node along the way.
const findBestOutsidePath = (
  seeds: OutsideGateSeed[],
  destinationNodeIds: string[],
): { path: ShortestPathResult; seed: OutsideGateSeed } | undefined => {
  if (seeds.length === 0 || destinationNodeIds.length === 0) return undefined;

  const destinationSet = new Set(destinationNodeIds);

  const result = runAStar<GraphEdge>({
    seeds: seeds.map((seed) => ({ id: seed.gate.id, gScore: seed.seedCostM })),
    heuristic: (nodeId) => heuristicToNearestDestination(nodeId, destinationNodeIds),
    neighbors: internalGraphNeighbors,
    isGoal: (nodeId) => destinationSet.has(nodeId),
  });
  if (!result) return undefined;

  const { nodes, edges } = reconstructAStarPath(result, result.goalId);

  const seed = seeds.find((candidate) => candidate.gate.id === nodes[0]);
  if (!seed) return undefined;

  return {
    path: {
      nodes,
      edges,
      distanceM: edges.reduce((sum, edge) => sum + edge.distanceM, 0),
      costM: result.gScore[result.goalId] - seed.seedCostM,
    },
    seed,
  };
};

// Beeline fallback: always available offline, no dependency on the bundled
// street graph. Used beyond the street graph's radius, when the flag is off,
// or as a safety net if street-graph routing fails for any reason — see
// Decision 1 in docs/OFFLINE_OUTSIDE_ROUTING_FINAL_SPEC.md.
const selectOutsidePathViaBeeline = (
  start: Extract<RoutingStartV2, { type: 'outside_coordinate' }>,
  destinationNodeIds: string[],
): SelectedRoutePath | undefined => {
  const startPoint = appToV2Coordinate(start.coordinate);
  const gates = start.manualGateId
    ? IJTEMA_GATES.filter((gate) => gate.id === start.manualGateId)
    : IJTEMA_GATES;

  const seeds = resolveOutsideGateSeeds(startPoint, gates);
  const best = findBestOutsidePath(seeds, destinationNodeIds);
  if (!best) return undefined;

  const { path, seed } = best;
  const routeCostM = seed.seedCostM + path.costM;
  const startResolution: RouteStartResolutionV2 = {
    mode: 'outside',
    startType: start.manualGateId ? 'selected_official_gate' : 'nearest_official_gate',
    coordinate: { latitude: seed.gate.coordinate!.lat, longitude: seed.gate.coordinate!.lng },
    candidateNodes: [seed.gate.id],
    gate: seed.gate,
  };

  return {
    path,
    startLabel: seed.gate.name.en,
    startResolution,
    startCoordinate: start.coordinate,
    startConnectorDistanceM: seed.connectorDistanceM,
    routeCostM,
  };
};

// Road-following outside leg over the bundled OSM street graph, behind
// EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH. Reuses the same internal-graph
// findBestPath from the selected gate onward — only the outside-of-venue leg
// changes.
const selectOutsidePathViaStreetGraph = (
  start: Extract<RoutingStartV2, { type: 'outside_coordinate' }>,
  destinationNodeIds: string[],
): SelectedRoutePath | undefined => {
  const gates = start.manualGateId
    ? IJTEMA_GATES.filter((gate) => gate.id === start.manualGateId)
    : IJTEMA_GATES;
  const candidateGates = gates
    .filter((gate) => gate.coordinate && gate.routingStatus === 'routable' && gate.canStartRouteFromOutside)
    // Reject internally-disconnected gates (e.g. GATE_03) up front, same as
    // resolveOutsideGateSeeds does for the beeline path — otherwise the
    // street-graph search below can "win" with a gate that has no path
    // through the internal graph, discarding the whole street-following
    // result to full beeline instead of trying the next-best connected gate.
    .filter((gate) => getConnectedCandidates([gate.id]).length > 0);
  if (candidateGates.length === 0) return undefined;

  const streetResult = selectStreetGraphOutsidePath(appToV2Coordinate(start.coordinate), candidateGates);
  if (!streetResult) return undefined;

  const internalPath = findBestPath([streetResult.gate.id], destinationNodeIds);
  if (!internalPath) return undefined;

  if (streetResult.sanityCapExceeded) {
    // Production enforcement per Decision 2 in FINAL_SPEC: warn-log + flag,
    // never reject the route. scripts/test-outside-street-routing-v2.ts and
    // the street-graph generator's own validation are where this is a hard
    // gate instead.
    console.warn(
      `[OutsideStreetRouting] Sanity cap exceeded for ${streetResult.gate.id}: graph-routed ${streetResult.graphRoutedDistanceM.toFixed(1)}m`,
    );
  }

  const routeCostM = streetResult.totalDistanceM + internalPath.costM + gatePenaltyM(streetResult.gate);
  const startResolution: RouteStartResolutionV2 = {
    mode: 'outside',
    startType: start.manualGateId ? 'selected_official_gate' : 'nearest_official_gate',
    coordinate: { latitude: streetResult.gate.coordinate!.lat, longitude: streetResult.gate.coordinate!.lng },
    candidateNodes: [streetResult.gate.id],
    gate: streetResult.gate,
  };

  return {
    path: internalPath,
    startLabel: streetResult.gate.name.en,
    startResolution,
    startCoordinate: start.coordinate,
    startConnectorDistanceM: Math.round(streetResult.totalDistanceM),
    routeCostM,
    outsideLegCoordinates: streetResult.coordinates,
    outsideLegSanityCapExceeded: streetResult.sanityCapExceeded,
    outsideLegTopologyCoordinates: streetResult.topologyCoordinates.map((coordinate) => ({
      latitude: coordinate.lat,
      longitude: coordinate.lng,
    })),
    outsideLegTopologyDistancesM: streetResult.topologyEdgeDistancesM,
    outsideLegTopologyNames: streetResult.topologyEdgeNames,
  };
};

const selectOutsidePath = (
  start: Extract<RoutingStartV2, { type: 'outside_coordinate' }>,
  destinationNodeIds: string[],
): SelectedRoutePath | undefined => {
  if (MapFeatureFlagsService.useOutsideStreetGraph() && isWithinStreetGraphRadius(appToV2Coordinate(start.coordinate))) {
    const streetPath = selectOutsidePathViaStreetGraph(start, destinationNodeIds);
    if (streetPath) return streetPath;
    // Street-graph routing found nothing usable (e.g. a locally disconnected
    // pocket) — beeline is always available offline, so fall through rather
    // than surface a dead end.
  }

  return selectOutsidePathViaBeeline(start, destinationNodeIds);
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
  /**
   * Single source of truth for "which official gate should an outside user enter
   * through" — reuses the exact same outside-path selection (`selectOutsidePath`)
   * that `calculateRoute` uses, so a caller with a known destination can never
   * disagree with the route that would actually be computed for it. Falls back to
   * nearest-gate-by-distance only when no destination is known yet (nothing to
   * optimise total cost against).
   */
  static recommendOutsideEntryGate(coordinate: AppCoordinate, destination?: RoutingDestinationV2 | null): Gate | undefined {
    if (destination) {
      const destinationCandidates = resolveDestinationCandidates(destination);
      if (destinationCandidates.nodeIds.length > 0) {
        const selected = selectOutsidePath({ type: 'outside_coordinate', coordinate }, destinationCandidates.nodeIds);
        if (selected?.startResolution?.gate) return selected.startResolution.gate;
      }
    }
    return EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser(coordinate);
  }

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
    const { coordinates, outsideLegCoordinateCount } = pathCoordinates(
      path,
      selected.startCoordinate,
      selected.outsideLegCoordinates,
    );
    const totalDistance = Math.round(selected.startConnectorDistanceM + path.distanceM);
    const estimatedTimeMin = Math.max(1, Math.ceil(totalDistance / walkingSpeedMs / 60));
    const instructions = prependOutsideApproachInstruction(generateInstructions(path, destinationCandidates.label), selected);

    return {
      id: `v2_route_${path.nodes[0]}_${path.nodes[path.nodes.length - 1]}`.replace(/[^A-Za-z0-9_]+/g, '_'),
      sourceVersion: 'v2',
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
      // Non-zero only for a true outside-venue start (mode 'outside') — an
      // inside_coordinate start also carries a leading startCoordinate in
      // `coordinates` but that's a "you're inside, walk to the graph" leg,
      // not the outside/inside split this field describes.
      outsideLegCoordinateCount: selected.startResolution?.mode === 'outside' ? outsideLegCoordinateCount : 0,
      outsideLegSanityCapExceeded: selected.outsideLegSanityCapExceeded ?? false,
    };
  }
}
