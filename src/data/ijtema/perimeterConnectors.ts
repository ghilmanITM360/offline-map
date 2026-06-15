/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Coordinate } from './types';

export interface PerimeterConnectorPoint {
  id: string;
  connectorId: string;
  sequence: number;
  coordinate: Coordinate;
  developerLabel: string;
}

export interface PerimeterConnector {
  id: string;
  points: PerimeterConnectorPoint[];
}

const c = (lat: number, lng: number): Coordinate => ({ lat, lng });

// Internal graph-only bridge. NOT exported from index.ts -> not searchable/renderable.
// NPC-01 is ~9m from R7-01; NPC-02 is ~11m from R8-01.
// Intersection connectors auto-fire and merge east cluster into main graph.
export const IJTEMA_PERIMETER_CONNECTORS: PerimeterConnector[] = [
  {
    id: 'NORTH_PERIMETER_CONNECTOR',
    points: [
      {
        id: 'NPC-01',
        connectorId: 'NORTH_PERIMETER_CONNECTOR',
        sequence: 1,
        coordinate: c(24.975020, 67.007175),
        developerLabel: 'NPC-01',
      },
      {
        id: 'NPC-02',
        connectorId: 'NORTH_PERIMETER_CONNECTOR',
        sequence: 2,
        coordinate: c(24.975020, 67.008920),
        developerLabel: 'NPC-02',
      },
    ],
  },
];
