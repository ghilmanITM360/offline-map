import { strict as assert } from 'node:assert';
import { IJTEMA_DATA } from '../src/constants/data';
import { RoutingService } from '../src/services/RoutingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';

type Coord = { latitude: number; longitude: number };

const blockIds = Object.keys(IJTEMA_DATA.blocks);
assert(blockIds.length > 1, 'Expected multiple blocks for routing tests');

let testedPairs = 0;
let nonDegeneratePairs = 0;
for (const fromId of blockIds) {
  for (const toId of blockIds) {
    if (fromId === toId) continue;
    const fromBlock = IJTEMA_DATA.blocks[fromId];
    const toBlock = IJTEMA_DATA.blocks[toId];
    const origin: Coord = fromBlock.center;
    const destNodeIds = RoutingService.resolveDestinationNodesFromPlace({
      id: toId,
      name: toBlock.name,
      category: 'Block',
      description: toBlock.name,
      coordinate: toBlock.center,
      sourceVersion: 'v1',
    });

    const alternatives = RoutingService.calculateRoutes(origin, destNodeIds, 1.4);
    const route = alternatives[0]?.route ?? RoutingService.calculateRoute(origin, destNodeIds, undefined, 1.4);

    assert(route, `No route found from ${fromId} to ${toId}`);
    assert(route.totalDistance > 0, `Non-positive distance from ${fromId} to ${toId}`);
    assert(route.nodes.length > 1, `Route nodes missing for ${fromId} to ${toId}`);
    assert(route.segments.length > 0, `Route segments missing for ${fromId} to ${toId}`);
    assert(route.nodes[0] !== route.nodes[route.nodes.length - 1], `Degenerate same-node route from ${fromId} to ${toId}`);
    assert(route.coordinates.length === route.nodes.length, `Coordinate count mismatch from ${fromId} to ${toId}`);

    for (const nodeId of route.nodes) {
      assert(IJTEMA_DATA.nodes[nodeId], `Missing node ${nodeId} in route ${fromId}->${toId}`);
    }

    for (const coord of route.coordinates) {
      assert(typeof coord.latitude === 'number' && Number.isFinite(coord.latitude), `Invalid latitude in ${fromId}->${toId}`);
      assert(typeof coord.longitude === 'number' && Number.isFinite(coord.longitude), `Invalid longitude in ${fromId}->${toId}`);
    }

    testedPairs += 1;
    nonDegeneratePairs += 1;
  }
}

const historicalProblemPairs: Array<[string, string]> = [
  ['B12', 'B17'],
  ['B21', 'B22'],
  ['B5', 'B9'],
  ['B6', 'B10'],
  ['B14', 'B15'],
  ['B14', 'B20'],
  ['B15', 'B20'],
];

for (const [fromId, toId] of historicalProblemPairs) {
  const from = IJTEMA_DATA.blocks[fromId];
  const to = IJTEMA_DATA.blocks[toId];
  const route = RoutingService.calculateRoute(
    from.center,
    RoutingService.resolveDestinationNodesFromPlace({
      id: toId,
      name: to.name,
      category: 'Block',
      description: to.name,
      coordinate: to.center,
      sourceVersion: 'v1',
    }, from.center),
    undefined,
    1.4,
  );
  assert(route, `Expected route for historical problem pair ${fromId}->${toId}`);
  assert(route.totalDistance > 0, `Historical pair still has non-positive distance: ${fromId}->${toId}`);
  assert(route.segments.length > 0, `Historical pair has empty steps: ${fromId}->${toId}`);
}

const start = IJTEMA_DATA.blocks.B1?.center ?? IJTEMA_DATA.blocks[blockIds[0]].center;
const destinationBlock = IJTEMA_DATA.blocks.B24 ?? IJTEMA_DATA.blocks[blockIds[blockIds.length - 1]];
const destinationNodeIds = RoutingService.resolveDestinationNodesFromPlace({
  id: destinationBlock.id,
  name: destinationBlock.name,
  category: 'Block',
  description: destinationBlock.name,
  coordinate: destinationBlock.center,
  sourceVersion: 'v1',
});

const slowRoute = RoutingService.calculateRoute(start, destinationNodeIds, undefined, 0.8);
const fastRoute = RoutingService.calculateRoute(start, destinationNodeIds, undefined, 1.6);
assert(slowRoute && fastRoute, 'Expected routes for walking speed ETA test');
assert(
  fastRoute.estimatedTimeMin <= slowRoute.estimatedTimeMin,
  `Walking speed did not improve ETA (slow=${slowRoute.estimatedTimeMin}, fast=${fastRoute.estimatedTimeMin})`,
);

console.log(`Routing tests passed: ${testedPairs} block-to-block routes verified (${nonDegeneratePairs} non-degenerate pairs).`);
