/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_GATES } from './gates';
import { IJTEMA_NAVIGATION_GRAPH_V2 } from './navigationGraph';
import { Coordinate, Gate } from './types';

export const IJTEMA_OFFICIAL_ENTRY_POLICY = {
  outsideUser: {
    mustEnterThroughOfficialGate: true,
    mustNotSnapDirectlyToInternalGraph: true,
    suggestNearestOfficialGate: true,
    allowManualOfficialGateChoice: true,
    internalRouteStartsFromSelectedGate: true,
    missingCoordinateGatesCannotBeSuggested: true,
    flow: 'Outside user -> nearest official gate -> internal graph -> destination block/rasta/gate',
  },
  insideUser: {
    maySnapToInternalGraph: true,
    flow: 'Inside user -> nearest internal rasta/graph node -> destination',
  },
} as const;

const hasGateGraphConnection = (gate: Gate): boolean =>
  Boolean(IJTEMA_NAVIGATION_GRAPH_V2.nodes[gate.id] && (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[gate.id] ?? []).length > 0);

export const getRoutableOfficialGates = (): Gate[] =>
  IJTEMA_GATES.filter(
    (gate) =>
      gate.isOfficialEntry &&
      gate.routingStatus === 'routable' &&
      gate.canStartRouteFromOutside &&
      Boolean(gate.coordinate) &&
      hasGateGraphConnection(gate),
  );

export const getNormalUserSearchableGates = (): Gate[] =>
  IJTEMA_GATES.filter((gate) => gate.userFacingBehavior.normalSearch === 'searchable' && gate.routingStatus === 'routable' && hasGateGraphConnection(gate));

export const findNearestOfficialEntryGate = (coordinate: Coordinate): Gate | undefined => {
  let nearestGate: Gate | undefined;
  let nearestDistance = Infinity;

  for (const gate of getRoutableOfficialGates()) {
    if (!gate.coordinate) continue;

    const distance = distanceMeters(coordinate, gate.coordinate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestGate = gate;
    }
  }

  return nearestGate;
};

const distanceMeters = (from: Coordinate, to: Coordinate): number => {
  const earthRadiusMeters = 6371000;
  const fromLat = degreesToRadians(from.lat);
  const toLat = degreesToRadians(to.lat);
  const deltaLat = degreesToRadians(to.lat - from.lat);
  const deltaLng = degreesToRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
};

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;
