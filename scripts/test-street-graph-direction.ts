import assert from 'node:assert/strict';

import { buildStreetNavigationGraph } from '../src/data/ijtema/streetGraphBuilder';
import type { StreetGraphData } from '../src/data/ijtema/streetGraphTypes';

const data = {
  nodeLat: [24, 24, 24, 24],
  nodeLng: [67, 67.001, 67.002, 67.003],
  edgeFrom: [0, 1, 2],
  edgeTo: [1, 2, 3],
  edgeDistanceM: [100, 100, 100],
  edgeNameIndex: [-1, -1, -1],
  edgeGeometry: [[], [], []],
  edgeDirection: [0, 1, 2],
  edgeProfileIndex: [0, 1, 1],
  profiles: ['residential:walkable-road', 'path:pedestrian-way'],
  names: [],
  gateConnectorGateIds: [],
  gateConnectorNodeIndex: [],
  gateConnectorDistanceM: [],
  metadata: {
    version: 'fixture',
    source: 'osm_overpass',
    centerLat: 24,
    centerLng: 67,
    radiusM: 3000,
    generatedAt: '2026-08-14T00:00:00.000Z',
    rawNodeCount: 4,
    rawEdgeCount: 3,
    simplifiedNodeCount: 4,
    simplifiedEdgeCount: 3,
    excludedDisconnectedNodeCount: 0,
    excludedConstructionWayCount: 0,
  },
} as StreetGraphData;

const graph = buildStreetNavigationGraph(data);
assert(graph.adjacency.S0.some((edge) => edge.to === 'S1'), 'bidirectional edge must allow forward traversal');
assert(graph.adjacency.S1.some((edge) => edge.to === 'S0'), 'bidirectional edge must allow reverse traversal');
assert(graph.adjacency.S1.some((edge) => edge.to === 'S2'), 'forward-only edge must allow forward traversal');
assert(!(graph.adjacency.S2 ?? []).some((edge) => edge.to === 'S1'), 'forward-only edge must reject reverse traversal');
assert(!(graph.adjacency.S2 ?? []).some((edge) => edge.to === 'S3'), 'reverse-only edge must reject stored forward traversal');
assert(graph.adjacency.S3.some((edge) => edge.to === 'S2'), 'reverse-only edge must allow stored reverse traversal');

console.log('Street-graph direction checks passed.');
