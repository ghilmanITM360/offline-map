import { strict as assert } from 'node:assert';
import { IJTEMA_MAP_BOUNDS } from '../src/data/ijtema';
import { RoutingServiceV2, RoutingStartV2, RoutingDestinationV2 } from '../src/services/RoutingServiceV2';

const rawInternalIdPattern = /\b(?:R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|P\d+|B\d+_C\d+)\b/;
const hiddenConnectorLeakPattern = /\b(?:NPC(?:-\d+)?|NORTH_PERIMETER_CONNECTOR|Rasta 12)\b/i;

const checks: Array<{
  label: string;
  start: RoutingStartV2;
  destination: RoutingDestinationV2;
}> = [
  { label: 'Gate 05 -> Block 2', start: { type: 'gate', gateId: 'GATE_05' }, destination: { type: 'block', blockId: 'B2' } },
  { label: 'Gate 05 -> Block 36', start: { type: 'gate', gateId: 'GATE_05' }, destination: { type: 'block', blockId: 'B36' } },
  { label: 'Gate 20 -> Block 1', start: { type: 'gate', gateId: 'GATE_20' }, destination: { type: 'block', blockId: 'B1' } },
  { label: 'Gate 20 -> Block 28', start: { type: 'gate', gateId: 'GATE_20' }, destination: { type: 'block', blockId: 'B28' } },
  { label: 'Gate 20 -> Block 42', start: { type: 'gate', gateId: 'GATE_20' }, destination: { type: 'block', blockId: 'B42' } },
  { label: 'Gate 21 -> Block 28', start: { type: 'gate', gateId: 'GATE_21' }, destination: { type: 'block', blockId: 'B28' } },
  { label: 'Gate 22 -> Block 26', start: { type: 'gate', gateId: 'GATE_22' }, destination: { type: 'block', blockId: 'B26' } },
  { label: 'Gate 08 -> Block 24', start: { type: 'gate', gateId: 'GATE_08' }, destination: { type: 'block', blockId: 'B24' } },
  { label: 'Gate 13 -> Block 42', start: { type: 'gate', gateId: 'GATE_13' }, destination: { type: 'block', blockId: 'B42' } },
  { label: 'Block 1 -> Block 24', start: { type: 'block', blockId: 'B1' }, destination: { type: 'block', blockId: 'B24' } },
  { label: 'Block 25 -> Block 32', start: { type: 'block', blockId: 'B25' }, destination: { type: 'block', blockId: 'B32' } },
  { label: 'Block 33 -> Block 42', start: { type: 'block', blockId: 'B33' }, destination: { type: 'block', blockId: 'B42' } },
  { label: 'Rasta 09 -> Block 3', start: { type: 'rasta', rastaId: 'R9' }, destination: { type: 'block', blockId: 'B3' } },
  { label: 'Outside west -> nearest gate -> Block 28', start: { type: 'outside_coordinate', coordinate: { latitude: 24.9696, longitude: 66.9967 } }, destination: { type: 'block', blockId: 'B28' } },
  { label: 'Declared outside inside bounds -> nearest gate -> Block 28', start: { type: 'outside_coordinate', coordinate: { latitude: 24.9696, longitude: 66.9975 } }, destination: { type: 'block', blockId: 'B28' } },
  { label: 'Outside near isolated Gate 18 -> connected gate -> Block 26', start: { type: 'outside_coordinate', coordinate: { latitude: 24.9762, longitude: 67.0149 } }, destination: { type: 'block', blockId: 'B26' } },
  { label: 'Outside north -> nearest gate -> Block 26', start: { type: 'outside_coordinate', coordinate: { latitude: 24.9762, longitude: 67.0089 } }, destination: { type: 'block', blockId: 'B26' } },
];

const rows: string[] = [];

for (const check of checks) {
  const route = RoutingServiceV2.calculateRoute({
    start: check.start,
    destination: check.destination,
    walkingSpeedMs: 1.4,
  });

  assert(route, `${check.label} should produce a route`);
  assert(route.totalDistance > 0, `${check.label} total distance should be positive`);
  assert(route.estimatedTimeMin > 0, `${check.label} ETA should be positive`);
  assert(route.nodes.length > 1, `${check.label} should not collapse to same node`);
  assert(route.segments.length > 0, `${check.label} should have route segments`);
  assert(route.coordinates.length === route.nodes.length, `${check.label} coordinate/node count mismatch`);
  assert(route.instructions.length > 0, `${check.label} should have friendly instructions`);
  assert(route.destinationEntryNodeId?.startsWith(`${check.destination.type === 'block' ? check.destination.blockId : ''}_C`) || check.destination.type !== 'block', `${check.label} should resolve block destination to an entry node`);

  route.coordinates.forEach((coordinate, index) => {
    assert(coordinate.latitude >= IJTEMA_MAP_BOUNDS.minLat && coordinate.latitude <= IJTEMA_MAP_BOUNDS.maxLat, `${check.label} coord ${index} latitude outside bounds`);
    assert(coordinate.longitude >= IJTEMA_MAP_BOUNDS.minLng && coordinate.longitude <= IJTEMA_MAP_BOUNDS.maxLng, `${check.label} coord ${index} longitude outside bounds`);
  });

  const instructionText = route.instructions.map((instruction) => instruction.text).join('\n');
  assert(!rawInternalIdPattern.test(instructionText), `${check.label} instructions expose raw internal IDs:\n${instructionText}`);
  assert(!hiddenConnectorLeakPattern.test(instructionText), `${check.label} instructions must not expose hidden connector labels:\n${instructionText}`);

  if (check.start.type === 'outside_coordinate') {
    assert.equal(route.startResolution?.mode, 'outside', `${check.label} should use outside start resolution`);
    assert(route.nodes[0].startsWith('GATE_'), `${check.label} should start internal graph route at official gate`);
  }

  rows.push(`${check.label}: ${Math.round(route.totalDistance)}m, ${route.estimatedTimeMin}min, ${route.nodes[0]} -> ${route.nodes[route.nodes.length - 1]}`);
}

console.log(`Route smoke v2 checks passed:\n${rows.join('\n')}`);
