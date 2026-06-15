import { strict as assert } from 'node:assert';

import { IJTEMA_BLOCKS } from '../src/data/ijtema';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';

const starts = [
  ['west', { latitude: 24.9695, longitude: 66.9968 }],
  ['north', { latitude: 24.976, longitude: 67.0075 }],
  ['east', { latitude: 24.9719, longitude: 67.014 }],
  ['south', { latitude: 24.9645, longitude: 67.0045 }],
  ['south-east', { latitude: 24.966, longitude: 67.0092 }],
  ['near-gate-20', { latitude: 24.9753, longitude: 67.011 }],
  ['near-gate-15', { latitude: 24.9682, longitude: 67.0087 }],
] as const;

const suspicious: Array<{ start: string; block: string; gate?: string; distance: number }> = [];

for (const [startLabel, coordinate] of starts) {
  for (const block of IJTEMA_BLOCKS) {
    const route = RoutingServiceV2.calculateRoute({
      start: { type: 'outside_coordinate', coordinate },
      destination: { type: 'block', blockId: block.id },
    });

    assert(route, `${startLabel} outside start must route to ${block.id}.`);
    assert(route.totalDistance > 0, `${startLabel} -> ${block.id} must have positive distance.`);
    assert(route.estimatedTimeMin > 0, `${startLabel} -> ${block.id} must have positive ETA.`);
    assert(route.startResolution?.gate?.id, `${startLabel} -> ${block.id} must choose official entry gate.`);
    assert(route.destinationEntryNodeId?.startsWith(`${block.id}_C`), `${startLabel} -> ${block.id} must end at block C-entry.`);

    if (route.totalDistance > 3200) {
      suspicious.push({
        start: startLabel,
        block: block.id,
        gate: route.startResolution?.gate?.id,
        distance: route.totalDistance,
      });
    }
  }
}

console.log(JSON.stringify({ checked: starts.length * IJTEMA_BLOCKS.length, suspicious }, null, 2));
console.log('Outside to all blocks v2 checks passed.');
