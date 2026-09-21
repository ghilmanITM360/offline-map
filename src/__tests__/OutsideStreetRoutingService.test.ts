/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Issue #69: on street-graph-routed outside legs, the raw-GPS-origin-to-nearest-street-node
// snap distance (`nearestUser.distanceM` in selectStreetGraphOutsidePath) is folded into
// `totalDistanceM` (used for live distance / gate-selection cost, already correct per #61/#68)
// but NEVER appears in `topologyCoordinates`/`topologyEdgeDistancesM` — the data
// generateStreetInstructions (src/services/StreetInstructionService.ts) turns into
// turn-by-turn text. Result: the first leg's walking distance is silently absent from the
// generated instructions, even though the live/total distance already accounts for it.
//
// Uses a synthetic 2-node street graph (mocking streetGraphBuilder) instead of the bundled
// Karachi OSM extract, so exact expected distances are known and don't depend on real-world
// geometry — the same synthetic-fixture approach scripts/test-outside-street-routing-v2.ts
// uses against the real graph, but deterministic. Fixture identifiers are `mock`-prefixed
// because jest.mock()'s factory may only close over `mock`-prefixed out-of-scope variables.

import { haversineM } from '../utils/SpatialGrid';
import { generateStreetInstructions } from '../services/StreetInstructionService';
import { Gate } from '../data/ijtema/types';

const mockUser = { lat: 24.0, lng: 67.0 };
const mockSnapNode = { id: 'S0', lat: 24.0002, lng: 67.0 }; // nearest street node to mockUser
const mockFarNode = { id: 'S1', lat: 24.001, lng: 67.0 }; // one real street hop from mockSnapNode
const mockGateCoord = { lat: 24.0015, lng: 67.0 };

const mockSnapDistanceM = haversineM(mockUser.lat, mockUser.lng, mockSnapNode.lat, mockSnapNode.lng);
const mockEdgeDistanceM = haversineM(mockSnapNode.lat, mockSnapNode.lng, mockFarNode.lat, mockFarNode.lng);
const mockConnectorDistanceM = haversineM(mockFarNode.lat, mockFarNode.lng, mockGateCoord.lat, mockGateCoord.lng);

const mockGate: Gate = {
  id: 'GATE_TEST',
  number: 1,
  name: { en: 'Test Gate', ur: 'ٹیسٹ گیٹ' },
  coordinate: mockGateCoord,
  aliases: [],
  category: 'gate',
  status: 'provided',
  entryRole: 'official_entry_exit',
  routingStatus: 'routable',
  isOfficialEntry: true,
  canStartRouteFromOutside: true,
  connectorStatus: 'verified_by_geometry',
  userFacingBehavior: { normalSearch: 'searchable', mapDisplay: 'visible', routeSelection: 'enabled' },
};

function mockBuildGraph() {
  return {
    nodes: { [mockSnapNode.id]: mockSnapNode, [mockFarNode.id]: mockFarNode },
    edges: [{ id: 'SE0', from: mockSnapNode.id, to: mockFarNode.id, distanceM: mockEdgeDistanceM, direction: 'both' }],
    adjacency: {
      [mockSnapNode.id]: [
        { id: 'SE0', from: mockSnapNode.id, to: mockFarNode.id, distanceM: mockEdgeDistanceM, direction: 'both' },
      ],
    },
    gateConnectors: {
      [mockGate.id]: { gateId: mockGate.id, nodeId: mockFarNode.id, distanceM: mockConnectorDistanceM },
    },
    metadata: {
      version: 'test',
      source: 'osm_overpass',
      centerLat: 24.0,
      centerLng: 67.0,
      radiusM: 5000,
      generatedAt: '2026-01-01T00:00:00Z',
      rawNodeCount: 2,
      rawEdgeCount: 1,
      simplifiedNodeCount: 2,
      simplifiedEdgeCount: 1,
      excludedDisconnectedNodeCount: 0,
      excludedConstructionWayCount: 0,
    },
  };
}

jest.mock('../data/ijtema/streetGraphBuilder', () => ({
  getStreetNavigationGraph: () => mockBuildGraph(),
  findNearestStreetNode: () => ({ node: mockSnapNode, distanceM: mockSnapDistanceM }),
}));

const { selectStreetGraphOutsidePath } = require('../services/OutsideStreetRoutingService');

describe('OutsideStreetRoutingService — outside-approach connector distance (#69)', () => {
  test('totalDistanceM includes the raw-GPS-to-street-node snap leg', () => {
    const result = selectStreetGraphOutsidePath(mockUser, [mockGate]);
    expect(result).toBeDefined();
    expect(result!.totalDistanceM).toBeCloseTo(mockSnapDistanceM + mockEdgeDistanceM + mockConnectorDistanceM, 6);
  });

  // CONNECT-05 / CONNECT-06: this is the actual #69 defect — topology data feeds
  // turn-by-turn generation, and must account for the same snap leg totalDistanceM does.
  test('topologyEdgeDistancesM sums to the same total as totalDistanceM (no dropped leg)', () => {
    const result = selectStreetGraphOutsidePath(mockUser, [mockGate]);
    const topologySum = result!.topologyEdgeDistancesM.reduce((sum: number, hop: number) => sum + hop, 0);
    expect(topologySum).toBeCloseTo(result!.totalDistanceM, 6);
  });

  test('topologyCoordinates starts at the raw user coordinate, not the snapped node', () => {
    const result = selectStreetGraphOutsidePath(mockUser, [mockGate]);
    expect(result!.topologyCoordinates[0]).toEqual(mockUser);
  });

  // CONNECT-01 analog at the actual consumer: the generated instruction text's total
  // distance must match the route's real total distance — this is the user-visible bug.
  test('generateStreetInstructions total distance matches totalDistanceM', () => {
    const result = selectStreetGraphOutsidePath(mockUser, [mockGate]);
    const steps = generateStreetInstructions(
      result!.topologyCoordinates.map((c: { lat: number; lng: number }) => ({ latitude: c.lat, longitude: c.lng })),
      result!.topologyEdgeDistancesM,
      result!.topologyEdgeNames,
      { en: 'Test Gate', ur: 'ٹیسٹ گیٹ' },
    );
    const instructionTotal = steps.reduce((sum, step) => sum + step.distanceM, 0);
    expect(Math.round(instructionTotal)).toBe(Math.round(result!.totalDistanceM));
  });

  // CONNECT-07: user already essentially on the street node — no artificial hop/distance.
  test('a negligible snap gap does not add a spurious zero-length topology hop', () => {
    jest.resetModules();
    jest.doMock('../data/ijtema/streetGraphBuilder', () => ({
      getStreetNavigationGraph: () => mockBuildGraph(),
      findNearestStreetNode: () => ({ node: mockSnapNode, distanceM: 0 }),
    }));
    const { selectStreetGraphOutsidePath: selectWithZeroGap } = require('../services/OutsideStreetRoutingService');
    const result = selectWithZeroGap(mockSnapNode, [mockGate]);
    expect(result!.topologyCoordinates[0]).toEqual({ lat: mockSnapNode.lat, lng: mockSnapNode.lng });
    expect(result!.topologyEdgeDistancesM.length).toBe(2); // graph edge + gate connector only
    jest.resetModules();
  });
});
