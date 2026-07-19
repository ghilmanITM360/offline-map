import { strict as assert } from 'node:assert';
import { IJTEMA_DATA } from '../src/constants/data';
import { RoutingService } from '../src/services/RoutingService';
import { InstructionService } from '../src/services/InstructionService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';

function placeForBlock(blockId: string) {
  const block = IJTEMA_DATA.blocks[blockId];
  return {
    id: blockId,
    name: block.name,
    category: 'Block' as const,
    description: block.name,
    coordinate: block.center,
    sourceVersion: 'v1' as const,
  };
}

const blockIds = Object.keys(IJTEMA_DATA.blocks);
const nearestByBlock = new Map<string, string>();
for (const blockId of blockIds) {
  nearestByBlock.set(blockId, RoutingService.findNearestNode(IJTEMA_DATA.blocks[blockId].center));
}

const sameNearestPairs: Array<{ from: string; to: string; nearestNode: string }> = [];
for (const fromId of blockIds) {
  for (const toId of blockIds) {
    if (fromId >= toId) continue;
    const fromNearest = nearestByBlock.get(fromId);
    const toNearest = nearestByBlock.get(toId);
    if (fromNearest && fromNearest === toNearest) {
      sameNearestPairs.push({ from: fromId, to: toId, nearestNode: fromNearest });
    }
  }
}

console.log(`Same-nearest-node pairs (naive center snapping): ${sameNearestPairs.length}`);

for (const pair of sameNearestPairs) {
  const fromBlock = IJTEMA_DATA.blocks[pair.from];

  const destinationNodes = RoutingService.resolveDestinationNodesFromPlace(placeForBlock(pair.to), fromBlock.center);
  const alternatives = RoutingService.calculateRoutes(fromBlock.center, destinationNodes, 1.4);
  const route = alternatives[0]?.route ?? RoutingService.calculateRoute(fromBlock.center, destinationNodes, undefined, 1.4);
  const instructions = route ? InstructionService.generateInstructions(route.nodes) : [];

  console.log(
    `${pair.from} -> ${pair.to} | naive=${pair.nearestNode} | startCandidates=${RoutingService
      .resolveOriginNodesForCoordinate(fromBlock.center)
      .join(',')} | destCandidates=${destinationNodes.join(',')} | distance=${route?.totalDistance ?? 0} | steps=${instructions.length}`,
  );

  assert(route, `No route for same-nearest pair ${pair.from} -> ${pair.to}`);
  assert(route.totalDistance > 0, `Non-positive route distance for same-nearest pair ${pair.from} -> ${pair.to}`);
  assert(route.nodes[0] !== route.nodes[route.nodes.length - 1], `Same-node route for ${pair.from} -> ${pair.to}`);
  assert(instructions.length > 0, `No route steps for same-nearest pair ${pair.from} -> ${pair.to}`);
}

console.log('Same-nearest-node handling checks passed.');
