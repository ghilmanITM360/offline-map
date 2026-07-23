import { strict as assert } from 'node:assert';
import { IJTEMA_DATA, MAP_BOUNDS } from '../src/constants/data';
import { RoutingService } from '../src/services/RoutingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';

// v1 legacy routing must never let a user standing outside the mapped venue snap
// straight onto an interior graph node (P*/block entry node) — only the boundary/
// terminal nodes (T1/T2/S6/S12-S17), matching SnapToRoadService.resolveRoutingNode's
// existing reroute-time behavior. See RoutingService.resolveOriginNodeCandidates.
const BOUNDARY_NODE_IDS = /^(T1|T2|S6|S12|S13|S14|S15|S16|S17)$/;

const outsideCoord = { latitude: MAP_BOUNDS.minLat - 0.01, longitude: MAP_BOUNDS.minLng - 0.01 };
const insideBlockId = Object.keys(IJTEMA_DATA.blocks)[0];
const insideCoord = IJTEMA_DATA.blocks[insideBlockId].center;

// Outside-venue origin resolves only to boundary nodes, never interior nodes.
const outsideCandidates = RoutingService.resolveOriginNodesForCoordinate(outsideCoord);
assert(outsideCandidates.length > 0, 'Outside-venue origin must resolve to at least one boundary node');
for (const nodeId of outsideCandidates) {
  assert(
    BOUNDARY_NODE_IDS.test(nodeId),
    `Outside-venue origin must only resolve to boundary/terminal nodes, got interior node ${nodeId}`,
  );
}

// Inside-venue origin is unaffected — still resolves to nearest interior node.
const insideCandidates = RoutingService.resolveOriginNodesForCoordinate(insideCoord);
assert(insideCandidates.length > 0, 'Inside-venue origin must still resolve to a graph node');

// End-to-end: a full route from outside the venue to a block must start at a
// boundary node, not warp directly into the interior.
const destBlockId = Object.keys(IJTEMA_DATA.blocks)[1];
const destBlock = IJTEMA_DATA.blocks[destBlockId];
const destNodeIds = RoutingService.resolveDestinationNodesFromPlace({
  id: destBlockId,
  name: destBlock.name,
  category: 'Block',
  description: destBlock.name,
  coordinate: destBlock.center,
  sourceVersion: 'v1',
});
const outsideRoute = RoutingService.calculateRoute(outsideCoord, destNodeIds, undefined, 1.4);
assert(outsideRoute, 'Expected a route to be found from an outside-venue origin to a block');
assert(
  BOUNDARY_NODE_IDS.test(outsideRoute!.nodes[0]),
  `Route from outside the venue must start at a boundary node, got ${outsideRoute!.nodes[0]}`,
);

console.log('Outside-origin v1 routing checks passed.');
