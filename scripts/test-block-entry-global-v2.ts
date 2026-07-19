import { strict as assert } from 'node:assert';

import {
  IJTEMA_BLOCKS,
  IJTEMA_NAVIGATION_GRAPH_V2,
  IJTEMA_NAVIGATION_GRAPH_V2_REPORT,
  getBlockEntryNodeIds,
} from '../src/data/ijtema';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

for (const block of IJTEMA_BLOCKS) {
  const entryIds = getBlockEntryNodeIds(block.id);
  assert.equal(entryIds.length, 4, `${block.id} must expose four C-entry candidates.`);

  const connectedEntryIds = entryIds.filter((entryId) =>
    IJTEMA_NAVIGATION_GRAPH_V2_REPORT.blockEntryConnectors.some((report) => report.entryId === entryId && report.connected),
  );
  assert(connectedEntryIds.length > 0, `${block.id} must have at least one connected C-entry.`);

  for (const entryId of connectedEntryIds) {
    assert.equal(IJTEMA_NAVIGATION_GRAPH_V2.nodes[entryId]?.type, 'block_entry', `${entryId} must be block_entry graph node.`);
  }

  const route = RoutingServiceV2.calculateRoute({
    start: { type: 'gate', gateId: 'GATE_15' },
    destination: { type: 'block', blockId: block.id },
  });
  assert(route, `Gate 15 must route to ${block.id}.`);
  assert(route.destinationEntryNodeId, `${block.id} route must end at selected C-entry, not center.`);
  assert(connectedEntryIds.includes(route.destinationEntryNodeId), `${block.id} route must end at connected C-entry.`);
}

console.log('Block entry global v2 checks passed.');
