/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IJTEMA_GATES } from './gates';
import { distanceMeters } from './graphBuilder';
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
