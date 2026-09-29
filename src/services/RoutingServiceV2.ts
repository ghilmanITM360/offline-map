/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRhumbLineBearing } from 'geolib';
import {
  Block,
  Coordinate as V2Coordinate,
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
import type {
  NormalizedOutsideCandidate,
  OutsideRouteCandidateSet,
} from '../models/outsideRouting';
import { EntryGateRoutingService, RouteStartResolutionV2 } from './EntryGateRoutingService';
import { AStarNeighbor, reconstructAStarPath, runAStar } from '../utils/AStar';
import { MapFeatureFlagsService } from './MapFeatureFlagsService';
import {
  gatePenaltyM,
  isWithinStreetGraphRadius,
  selectStreetGraphOutsidePath,
  TIE_BREAK_EPSILON_M,
} from './OutsideStreetRoutingService';
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
  | { type: 'special_route'; routeId: string }
  | { type: 'facility'; facilityId: string; nodeId: string; label: string };

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
  /**
   * Set only by `finalizeOutsideRoutingPlan` — echoes the exact winning provider
   * route candidate identity so callers can attach its geometry and metadata
   * without re-deriving an alternative from `startResolution` or gate id alone.
   */
  selectedOutsideCandidateId?: string;
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

// ─── Core/provider two-phase outside-routing contract ──────────────────────
//
// Codex's provider track (e.g. a Google Directions integration) needs to
// compute the *outside* leg (user -> gate) with a provider that core has no
// business knowing about, while core keeps sole ownership of gate
// eligibility, connector/penalty/internal cost, the complete-journey
// comparison across candidates, manual override, and deterministic
// tie-breaking — the same policy `calculateRoute`'s street-graph path
// already enforces (selectOutsidePathViaStreetGraph), reused here rather
// than duplicated so the two call paths can never disagree.
//
// Phase 1 (`prepareOutsideRoutingPlan`): core resolves destination + gate
// eligibility and returns one candidate per eligible, internally-reachable
// gate, each carrying the exact coordinate a provider should route to and
// the core-owned cost components for that gate. Provider layer computes
// only `NormalizedOutsideCandidate.distanceM` plus outside route metadata — it must
// never add connector/penalty/internal cost itself, and must never pick a
// winner.
//
// Phase 2 (`finalizeOutsideRoutingPlan`): core combines each returned
// candidate's provider distance with its own connector/penalty/internal
// cost, selects the argmin (deterministic tie-break, never exposed as
// user-visible distance), rebuilds the matching internal route for that same
// gate, and returns a normal `RoutePreviewV2` — the same shape
// `calculateRoute` returns, so existing downstream consumers work unchanged.

/**
 * `providerRouteTargetCoordinate` is always the gate's own literal
 * coordinate (not a graph-discretized approach point) — any provider can
 * route directly to an arbitrary lat/lng, so there is no snapping gap for
 * core to bridge. `connectorCostM` is therefore correctly 0 today for every
 * candidate; the field stays in the contract (rather than being omitted)
 * because the cost boundary in Task 3 requires it to exist as a real,
 * core-owned line item, not because a nonzero value is being withheld. If a
 * future provider integration needs to route to a different point than the
 * gate's own coordinate, this is the field that would carry the real gap —
 * inventing a nonzero value for it today, with no surveyed offset to back
 * it, would violate "do not invent graph connectivity."
 * (Displacement of an accepted provider route's own endpoints is per route, not per
 * gate: `finalizeOutsideRoutingPlan` measures it — see `providerEndpointJoinM`, #161.)
 *
 * `internalCostM` is the gate's best pedestrian cost (via `findBestPath`) to
 * the request's destination, precomputed here so a gate with no valid
 * internal route is excluded before the provider ever sees it (never
 * silently included at cost 0).
 */
export interface CoreOutsideCandidateGate {
  /** Stable core-plan identity for this gate — equal to `gateId`; distinct from provider route-alternative IDs. */
  candidateId: string;
  gateId: string;
  gateLabel: string;
  providerRouteTargetCoordinate: AppCoordinate;
  connectorCostM: number;
  penaltyM: number;
  internalCostM: number;
}

export interface CoreOutsideRoutingPlan {
  /** Deterministic, derived from the request inputs — stable across repeated calls with the same inputs (e.g. reroute ticks), not time-based. */
  requestId: string;
  userCoordinate: AppCoordinate;
  destination: RoutingDestinationV2;
  destinationLabel: string;
  /** Present only when the user explicitly picked a gate — `candidates` then contains at most that one gate, so finalize can never select a different one. */
  manualGateId?: string;
  walkingSpeedMs: number;
  /** Only eligible (routable, connected, outside-startable) AND internally-reachable-to-destination gates. */
  candidates: CoreOutsideCandidateGate[];
  /** Opaque plumbing for `finalizeOutsideRoutingPlan` to rebuild the matching internal route — treat as an internal implementation detail, not a field to interpret. */
  destinationNodeIds: string[];
}

export interface PrepareOutsideRoutingPlanInput {
  userCoordinate: AppCoordinate;
  destination: RoutingDestinationV2;
  /** Restricts `candidates` to exactly this one gate when set (manual override), same semantics as `RoutingStartV2`'s outside_coordinate.manualGateId. */
  manualGateId?: string;
  walkingSpeedMs?: number;
}

/**
 * Internal raw result from bundled per-gate OSM resolution. Production adapter
 * normalizes this into `NormalizedOutsideCandidate`, including provider route
 * identity and generated walking steps, before core finalization.
 */
export interface OfflineOsmOutsideCandidate {
  candidateId: string;
  outsideDistanceM: number;
  outsideCoordinates?: AppCoordinate[];
  topologyCoordinates: AppCoordinate[];
  topologyEdgeDistancesM: number[];
  topologyEdgeNames: Array<string | undefined>;
  /** Optional: providers that can detect an implausible route (e.g. the offline OSM resolver's distance-ratio check) may set this; omitted/false otherwise. */
  sanityCapExceeded?: boolean;
}

export interface FinalizeOutsideRoutingPlanInput {
  plan: CoreOutsideRoutingPlan;
  outsideCandidates: OutsideRouteCandidateSet;
  walkingSpeedMs: number;
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

const v2ToAppCoordinate = (coordinate: { lat: number; lng: number }): AppCoordinate => ({
  latitude: coordinate.lat,
  longitude: coordinate.lng,
});

const destinationRequestKey = (destination: RoutingDestinationV2): string => {
  switch (destination.type) {
    case 'gate':
      return `gate:${destination.gateId}`;
    case 'block':
      return `block:${destination.blockId}`;
    case 'rasta':
      return `rasta:${destination.rastaId}`;
    case 'special_route':
      return `special_route:${destination.routeId}`;
    case 'facility':
      return `facility:${destination.facilityId}:${destination.nodeId}`;
  }
};

const buildPlanRequestId = (userCoordinate: AppCoordinate, destination: RoutingDestinationV2, manualGateId?: string): string => {
  const lat = userCoordinate.latitude.toFixed(6);
  const lng = userCoordinate.longitude.toFixed(6);
  const manualSuffix = manualGateId ? `_manual_${manualGateId}` : '';
  return `plan_${lat}_${lng}_to_${destinationRequestKey(destination)}${manualSuffix}`;
};

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

/**
 * Single cutoff, matching the venue's historical classifier (src/services/InstructionService.ts,
 * v1) rather than the outside street graph's finer-grained thresholds (StreetInstructionService)
 * — the internal graph is a mostly-orthogonal rasta grid, and NavigationInstruction.type only
 * models straight/left/right/arrival, so finer buckets would have nowhere to go.
 */
const JUNCTION_TURN_THRESHOLD_DEG = 30;

const rhumbBearingDeg = (from: V2Coordinate, to: V2Coordinate): number =>
  getRhumbLineBearing(
    { latitude: from.lat, longitude: from.lng },
    { latitude: to.lat, longitude: to.lng },
  );

const normalizeAngleDeg = (deg: number): number => {
  let diff = deg;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
};

/**
 * Turn at `junction` between the incoming edge (from `previous`) and outgoing edge (to
 * `next`). Falls back to 'straight' when either segment is at/below the coordinate-dedup
 * tolerance — too short to yield a reliable bearing — instead of inventing a direction
 * from an ambiguous fix. Exported for direct unit testing against known coordinates.
 */
export const classifyJunctionTurn = (previous: V2Coordinate, junction: V2Coordinate, next: V2Coordinate): 'straight' | 'left' | 'right' => {
  if (
    distanceMeters(previous, junction) <= COORDINATE_DEDUP_TOLERANCE_M ||
    distanceMeters(junction, next) <= COORDINATE_DEDUP_TOLERANCE_M
  ) {
    return 'straight';
  }

  const diff = normalizeAngleDeg(rhumbBearingDeg(junction, next) - rhumbBearingDeg(previous, junction));
  if (Math.abs(diff) < JUNCTION_TURN_THRESHOLD_DEG) return 'straight';
  return diff > 0 ? 'right' : 'left';
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
    const junctionNode = IJTEMA_NAVIGATION_GRAPH_V2.nodes[path.nodes[index]];
    const previousNode = index > 0 ? IJTEMA_NAVIGATION_GRAPH_V2.nodes[path.nodes[index - 1]] : undefined;
    const maneuverType =
      previousNode && junctionNode && toNode
        ? classifyJunctionTurn(previousNode.coordinate, junctionNode.coordinate, toNode.coordinate)
        : 'straight';
    instructions.push({
      id: `v2-step-${index + 1}`,
      text: `${instructionTextForEdge(edge)} for ${Math.round(edge.distanceM)} meters.`,
      urduText: `${instructionUrduForEdge(edge)} (${Math.round(edge.distanceM)} میٹر)۔`,
      distance: edge.distanceM,
      type: maneuverType,
      coordinate: toNode ? toAppCoordinate(toNode) : { latitude: 0, longitude: 0 },
      roadName: edge.name.en,
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
  if (destination.type === 'facility') {
    return {
      nodeIds: getConnectedCandidates([destination.nodeId]),
      label: destination.label,
    };
  }

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
  gateLabel: { en: string; ur: string },
): NavigationInstruction[] =>
  instructions.map((instruction, index) => ({
    ...instruction,
    id: instruction.id === 'v2-start' ? 'v2-entry-start' : instruction.id.replace(/^v2-step-(\d+)$/, (_match, step) => `v2-step-${Number(step) + outsideStepCount}`),
    ...(index === 0
      ? {
          text: `Enter through ${gateLabel.en}.`,
          urduText: `${gateLabel.ur} سے داخل ہوں۔`,
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

  const gateLabel = {
    en: selected.startResolution.gate?.name.en ?? selected.startLabel,
    ur: selected.startResolution.gate?.name.ur ?? selected.startLabel,
  };

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
      text: `Walk ${selected.startConnectorDistanceM} meters to enter through ${gateLabel.en}.`,
      urduText: `${gateLabel.ur} سے داخل ہونے کے لیے ${selected.startConnectorDistanceM} میٹر چلیں۔`,
      distance: selected.startConnectorDistanceM,
      type: 'straight',
      coordinate: selected.startCoordinate,
    },
    ...renumberAndRewriteEntry(instructions, 1, gateLabel),
  ];
};

// #161: an accepted Google route may start/end up to MAX_ROUTE_ENDPOINT_OFFSET_M from the exact
// origin/gate, and pathCoordinates() draws join segments for that gap. Google's distanceM excludes
// them, so measure them here. offline-osm's distanceM already includes its own origin/gate
// connectors (adding them again would double-count) and a direct guide's endpoints are exact.
const providerEndpointJoinM = (
  outside: NormalizedOutsideCandidate,
  userCoordinate: AppCoordinate,
  gateCoordinate: { lat: number; lng: number },
): number => {
  if (outside.provider !== 'google' || outside.coordinates.length === 0) return 0;
  const first = outside.coordinates[0];
  const last = outside.coordinates[outside.coordinates.length - 1];
  return (
    distanceMeters(appToV2Coordinate(userCoordinate), appToV2Coordinate(first)) +
    distanceMeters(appToV2Coordinate(last), gateCoordinate)
  );
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

  // #103: a same-node degenerate path (start and destination resolve to the
  // identical graph node, e.g. two Rasta/SpecialRoute labels sharing a
  // junction) has no second node to append, leaving a 1-point array that
  // Polyline consumers can't render. Duplicate the single point so callers
  // always get a valid (possibly zero-length) line.
  if (coordinates.length === 1) coordinates.push({ ...coordinates[0] });

  return { coordinates, outsideLegCoordinateCount };
};

interface OutsideGateSeed {
  gate: Gate;
  connectorDistanceM: number;
  seedCostM: number;
}

// Canonical outside-gate eligibility filter — routable + coordinate +
// canStartRouteFromOutside + internally connected. Shared by every outside
// routing path (beeline, street-graph, and the core/provider plan) so none
// of them can drift onto a looser or different policy.
const isEligibleOutsideGate = (gate: Gate): boolean =>
  Boolean(gate.coordinate && gate.routingStatus === 'routable' && gate.canStartRouteFromOutside)
  && getConnectedCandidates([gate.id]).length > 0;

const resolveOutsideGateSeeds = (
  startPoint: { lat: number; lng: number },
  gates: Gate[],
): OutsideGateSeed[] =>
  gates
    .filter(isEligibleOutsideGate)
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
// Decision 1 in docs/OFFLINE_NAVIGATION_AND_ROUTING.md.
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
// EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH.
//
// Destination-aware weighted virtual sink: each candidate gate's best
// internal route to the destination is computed BEFORE the street search
// picks a winner, so gate selection minimizes the complete pedestrian
// journey (outside street cost + gate connector cost + gate penalty +
// internal cost to the destination) as one combined objective, the same way
// the beeline path's findBestOutsidePath already does — not "pick the
// cheapest outside leg, then see where it leads." Gates with no valid
// internal route to the destination are excluded before the street search
// ever sees them. The winning gate's internal path is the one already
// computed here (not a second findBestPath call), so the outside and
// internal legs returned below can never disagree about which gate they
// belong to.
const selectOutsidePathViaStreetGraph = (
  start: Extract<RoutingStartV2, { type: 'outside_coordinate' }>,
  destinationNodeIds: string[],
): SelectedRoutePath | undefined => {
  const gates = start.manualGateId
    ? IJTEMA_GATES.filter((gate) => gate.id === start.manualGateId)
    : IJTEMA_GATES;
  const candidateGates = gates.filter(isEligibleOutsideGate);
  if (candidateGates.length === 0) return undefined;

  const internalPathByGateId = new Map<string, ShortestPathResult>();
  for (const gate of candidateGates) {
    const internalPath = findBestPath([gate.id], destinationNodeIds);
    if (internalPath) internalPathByGateId.set(gate.id, internalPath);
  }
  const reachableGates = candidateGates.filter((gate) => internalPathByGateId.has(gate.id));
  if (reachableGates.length === 0) return undefined;

  const extraCostByGateId = new Map(reachableGates.map((gate) => [gate.id, internalPathByGateId.get(gate.id)!.costM]));

  const streetResult = selectStreetGraphOutsidePath(appToV2Coordinate(start.coordinate), reachableGates, extraCostByGateId);
  if (!streetResult) return undefined;

  const internalPath = internalPathByGateId.get(streetResult.gate.id);
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
      destinationEntryNodeId:
        options.destination.type === 'block' || options.destination.type === 'facility'
          ? path.nodes[path.nodes.length - 1]
          : undefined,
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

  /**
   * Phase 1 of the core/provider outside-routing contract — see the block
   * comment above `CoreOutsideCandidateGate`. Reuses the exact same gate
   * eligibility filter (routable + coordinate + canStartRouteFromOutside +
   * internally connected) and `findBestPath` internal-cost computation that
   * `selectOutsidePathViaStreetGraph` uses for the default offline flow, so
   * a provider-driven route can never apply a looser or different policy
   * than the one already governing initial routing and rerouting.
   */
  static prepareOutsideRoutingPlan(input: PrepareOutsideRoutingPlanInput): CoreOutsideRoutingPlan | null {
    const destinationCandidates = resolveDestinationCandidates(input.destination);
    if (destinationCandidates.nodeIds.length === 0) return null;

    const gatesInScope = input.manualGateId
      ? IJTEMA_GATES.filter((gate) => gate.id === input.manualGateId)
      : IJTEMA_GATES;
    const eligibleGates = gatesInScope.filter(isEligibleOutsideGate);
    if (eligibleGates.length === 0) return null;

    const candidates: CoreOutsideCandidateGate[] = [];
    for (const gate of eligibleGates) {
      const internalPath = findBestPath([gate.id], destinationCandidates.nodeIds);
      if (!internalPath) continue; // no valid internal route to this destination — excluded, never included at cost 0

      candidates.push({
        candidateId: gate.id,
        gateId: gate.id,
        gateLabel: gate.name.en,
        providerRouteTargetCoordinate: v2ToAppCoordinate(gate.coordinate!),
        connectorCostM: 0,
        penaltyM: gatePenaltyM(gate),
        internalCostM: internalPath.costM,
      });
    }
    if (candidates.length === 0) return null;

    return {
      requestId: buildPlanRequestId(input.userCoordinate, input.destination, input.manualGateId),
      userCoordinate: input.userCoordinate,
      destination: input.destination,
      destinationLabel: destinationCandidates.label,
      manualGateId: input.manualGateId,
      walkingSpeedMs: input.walkingSpeedMs ?? DEFAULT_WALKING_SPEED_MS,
      candidates,
      destinationNodeIds: destinationCandidates.nodeIds,
    };
  }

  /**
   * Phase 2 — combines each supplied provider candidate with its
   * corresponding plan candidate's core-owned costs (connector + penalty +
   * internal), selects the complete-journey argmin (deterministic
   * tie-break, never surfaced as user-visible distance), and rebuilds the
   * matching internal route for the winning gate so the outside and inside
   * legs of the returned preview can never disagree about which gate they
   * belong to. Unknown gates, gate-mismatched routes, and non-finite/negative
   * distances are ignored; an empty or fully-invalid set returns null so the
   * caller can retain its last valid route. Production callers validate request
   * identity and complete per-gate outcomes before invoking this method.
   */
  static finalizeOutsideRoutingPlan(input: FinalizeOutsideRoutingPlanInput): RoutePreviewV2 | null {
    const { plan, outsideCandidates } = input;
    const walkingSpeedMs = input.walkingSpeedMs ?? plan.walkingSpeedMs ?? DEFAULT_WALKING_SPEED_MS;
    if (!plan || plan.candidates.length === 0) return null;

    const planByCandidateId = new Map(plan.candidates.map((candidate) => [candidate.candidateId, candidate]));

    let winner: { planCandidate: CoreOutsideCandidateGate; outside: NormalizedOutsideCandidate; joinM: number; totalCostM: number } | undefined;
    for (const outcome of outsideCandidates.outcomes) {
      if (outcome.status !== 'routed') continue;
      const planCandidate = planByCandidateId.get(outcome.gateId);
      if (!planCandidate) continue;
      for (const outside of outcome.routes) {
        if (outside.gateId !== planCandidate.gateId) continue;
        if (!Number.isFinite(outside.distanceM) || outside.distanceM < 0) continue;

        const gate = getGate(planCandidate.gateId);
        if (!gate) continue;

        const joinM = providerEndpointJoinM(outside, plan.userCoordinate, gate.coordinate!);
        const totalCostM =
          outside.distanceM +
          joinM +
          planCandidate.connectorCostM +
          planCandidate.penaltyM +
          planCandidate.internalCostM +
          gate.number * TIE_BREAK_EPSILON_M;

        if (
          !winner ||
          totalCostM < winner.totalCostM ||
          (totalCostM === winner.totalCostM && outside.candidateId.localeCompare(winner.outside.candidateId) < 0)
        ) {
          winner = { planCandidate, outside, joinM, totalCostM };
        }
      }
    }
    if (!winner) return null;

    const gate = getGate(winner.planCandidate.gateId);
    if (!gate) return null;

    const internalPath = findBestPath([gate.id], plan.destinationNodeIds);
    if (!internalPath) return null;

    const startResolution: RouteStartResolutionV2 = {
      mode: 'outside',
      startType: plan.manualGateId ? 'selected_official_gate' : 'nearest_official_gate',
      coordinate: v2ToAppCoordinate(gate.coordinate!),
      candidateNodes: [gate.id],
      gate,
    };

    const selected: SelectedRoutePath = {
      path: internalPath,
      startLabel: gate.name.en,
      startResolution,
      startCoordinate: plan.userCoordinate,
      startConnectorDistanceM: Math.round(winner.outside.distanceM + winner.joinM + winner.planCandidate.connectorCostM),
      routeCostM: winner.outside.distanceM + winner.joinM + winner.planCandidate.connectorCostM + winner.planCandidate.penaltyM + internalPath.costM,
      outsideLegCoordinates: winner.outside.coordinates.map(appToV2Coordinate),
      outsideLegSanityCapExceeded: winner.outside.warnings.some((warning) => warning.code === 'distance-sanity-cap-exceeded'),
    };

    const { path } = selected;
    const { coordinates, outsideLegCoordinateCount } = pathCoordinates(path, selected.startCoordinate, selected.outsideLegCoordinates);
    const totalDistance = Math.round(selected.startConnectorDistanceM + path.distanceM);
    const estimatedTimeMin = Math.max(1, Math.ceil(totalDistance / walkingSpeedMs / 60));
    const instructions = prependOutsideApproachInstruction(generateInstructions(path, plan.destinationLabel), selected);

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
      destinationLabel: plan.destinationLabel,
      startResolution: selected.startResolution,
      destinationEntryNodeId:
        plan.destination.type === 'block' || plan.destination.type === 'facility'
          ? path.nodes[path.nodes.length - 1]
          : undefined,
      routeCostM: Math.round(selected.routeCostM),
      startConnectorDistanceM: selected.startConnectorDistanceM,
      outsideLegCoordinateCount,
      outsideLegSanityCapExceeded: selected.outsideLegSanityCapExceeded ?? false,
      selectedOutsideCandidateId: winner.outside.candidateId,
      outsideRoute: winner.outside,
    };
  }

  /**
   * Narrow per-gate offline OSM candidate resolver — produces a
   * `NormalizedOutsideCandidate` for exactly one gate using the bundled
   * street graph, in the same shape a provider (e.g. Google) would supply.
   * Lets a caller build an offline-fallback `OutsideRouteCandidateSet`
   * for `finalizeOutsideRoutingPlan` by calling this once per
   * `plan.candidates` entry — reusing the same finalize() combination logic
   * regardless of whether distances came from a network provider or from
   * this offline graph. Returns null outside the bundled graph's radius or
   * when the gate has no street connector (mirrors `isWithinStreetGraphRadius`
   * / `selectStreetGraphOutsidePath`'s own null cases — never throws).
   *
   * `outsideDistanceM` here is the OSM graph's full user -> gate distance
   * (nearest street node + graph traversal + that graph's own internal
   * node-to-gate connector). It is intentionally NOT split into a separate
   * connector figure: `CoreOutsideCandidateGate.connectorCostM` is 0 for
   * every candidate (see that type's doc comment), so folding the street
   * graph's own connector into `outsideDistanceM` — rather than exposing it
   * a second time as `connectorCostM` — is what keeps this path from
   * double-counting it.
   */
  static resolveOfflineOsmOutsideCandidate(userCoordinate: AppCoordinate, gateId: string): OfflineOsmOutsideCandidate | null {
    const gate = getGate(gateId);
    if (!gate || !gate.coordinate) return null;

    const v2Coordinate = appToV2Coordinate(userCoordinate);
    if (!isWithinStreetGraphRadius(v2Coordinate)) return null;

    const result = selectStreetGraphOutsidePath(v2Coordinate, [gate]);
    if (!result) return null;

    return {
      candidateId: gate.id,
      outsideDistanceM: result.totalDistanceM,
      outsideCoordinates: result.coordinates.map(v2ToAppCoordinate),
      topologyCoordinates: result.topologyCoordinates.map(v2ToAppCoordinate),
      topologyEdgeDistancesM: result.topologyEdgeDistancesM,
      topologyEdgeNames: result.topologyEdgeNames,
      sanityCapExceeded: result.sanityCapExceeded,
    };
  }
}
