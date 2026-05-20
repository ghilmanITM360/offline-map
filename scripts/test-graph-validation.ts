import { strict as assert } from 'node:assert';
import { IJTEMA_DATA } from '../src/constants/data';
import { validateIjtemaGraph } from '../src/data/ijtema/validation';
import { SearchService } from '../src/services/SearchService';
import { RoutingService } from '../src/services/RoutingService';

function near(actual: number, expected: number, label: string) {
  assert(Math.abs(actual - expected) < 0.000001, `${label}: expected ${expected}, got ${actual}`);
}

const result = validateIjtemaGraph(IJTEMA_DATA);
assert(result.isValid, `Graph validation failed:\n${result.errors.join('\n')}`);
assert(
  !result.warnings.some((w) => w.toLowerCase().includes('same nearest route node')),
  `Graph validation still has same-nearest-node warnings:\n${result.warnings.join('\n')}`,
);

near(IJTEMA_DATA.blocks.B2.center.latitude, 24.9685, 'B2 latitude');
near(IJTEMA_DATA.blocks.B2.center.longitude, 66.9999166667, 'B2 longitude');
assert(IJTEMA_DATA.blocks.B2.role?.includes('Member Masjid'), 'B2 should be marked as Member Masjid');

const expectedGates = {
  C1: { lat: 24.9675833333, lng: 66.9993333333 },
  C2: { lat: 24.9675833333, lng: 67.0005277778 },
  C3: { lat: 24.9693055556, lng: 66.9993888889 },
  C4: { lat: 24.9693055556, lng: 67.0005555556 },
};

for (const [id, expected] of Object.entries(expectedGates)) {
  const node = IJTEMA_DATA.nodes[id];
  assert(node, `Missing Member Masjid gate node ${id}`);
  assert(node.type === 'gate', `${id} should be a gate`);
  assert(node.nearestRoadNode, `${id} should map to a nearest road node for routing`);
  near(node.lat, expected.lat, `${id} latitude`);
  near(node.lng, expected.lng, `${id} longitude`);
  assert(SearchService.search(id).some((place) => place.id === id), `${id} should be searchable`);
  const route = RoutingService.calculateRoute(IJTEMA_DATA.blocks.B1.center, RoutingService.resolveDestinationNodesFromPlace(SearchService.search(id)[0]), undefined, 1.4);
  assert(route && route.nodes.length > 1, `${id} should route via nearest internal graph node`);
}

assert(SearchService.search('Member Masjid').some((place) => place.id === 'B2'), 'Member Masjid should find Block 2');
assert(SearchService.search('B2').some((place) => place.id === 'B2'), 'B2 should find Block 2');

console.log(`Graph validation passed with ${result.warnings.length} warnings.`);
