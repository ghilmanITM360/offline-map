/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Copy-free turn-by-turn steps for any venue graph: kinds and distances only, so hosts choose the words and
// language. Collinear segments merge into one step. The 30 degree threshold and the left/right split match the
// Ijtema host's InstructionService, so a host moving onto the SDK keeps the same step boundaries.

import type { VenueCoordinate, VenueEdge, VenueRoutingGraph } from '../venue/VenueDataSource';

export type RouteStepKind = 'depart' | 'turn_left' | 'turn_right' | 'arrive';

export interface RouteStep {
  readonly kind: RouteStepKind;
  /** Node where the step starts (the corner for a turn, the final node for arrive). */
  readonly nodeId: string;
  /** Node where the step's straight walk ends: the next corner, or the final node. */
  readonly toNodeId: string;
  /** Walking distance of the step in metres; 0 for arrive. */
  readonly distanceM: number;
}

const TURN_THRESHOLD_DEG = 30;
const toRad = (d: number): number => (d * Math.PI) / 180;

// Local-tangent bearing, clockwise from north in (-180, 180]. Venue segments are tens of metres, so the
// difference from a great-circle or rhumb bearing is far below the turn threshold.
const bearingDeg = (from: VenueCoordinate, to: VenueCoordinate): number =>
  (Math.atan2((to.lng - from.lng) * Math.cos(toRad((from.lat + to.lat) / 2)), to.lat - from.lat) * 180) / Math.PI;

const turnAt = (graph: VenueRoutingGraph, prevId: string, atId: string, nextId: string): 'turn_left' | 'turn_right' | undefined => {
  const prev = graph.getNode(prevId);
  const at = graph.getNode(atId);
  const next = graph.getNode(nextId);
  if (!prev || !at || !next) return undefined; // unknown geometry cannot establish a turn
  let diff = bearingDeg(at.coordinate, next.coordinate) - bearingDeg(prev.coordinate, at.coordinate);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  if (Math.abs(diff) < TURN_THRESHOLD_DEG) return undefined;
  return diff > 0 ? 'turn_right' : 'turn_left';
};

export function buildRouteSteps(
  route: { readonly nodes: readonly string[]; readonly edges: readonly VenueEdge[] },
  graph: VenueRoutingGraph,
): RouteStep[] {
  const { nodes, edges } = route;
  const lastId = nodes[nodes.length - 1];
  const arrive: RouteStep = { kind: 'arrive', nodeId: lastId, toNodeId: lastId, distanceM: 0 };
  if (edges.length === 0) return [arrive];

  const steps: RouteStep[] = [];
  let kind: RouteStepKind = 'depart';
  let startId = nodes[0];
  let distanceM = 0;
  edges.forEach((edge, i) => {
    const turn = i > 0 ? turnAt(graph, nodes[i - 1], nodes[i], nodes[i + 1]) : undefined;
    if (turn) {
      steps.push({ kind, nodeId: startId, toNodeId: nodes[i], distanceM });
      kind = turn;
      startId = nodes[i];
      distanceM = 0;
    }
    distanceM += edge.distanceM;
  });
  steps.push({ kind, nodeId: startId, toNodeId: lastId, distanceM });
  steps.push(arrive);
  return steps;
}
