import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

const HIDDEN_LABEL_PATTERN = /\b(?:NPC(?:-\d+)?|NORTH_PERIMETER_CONNECTOR|Rasta 12)\b/i;
const RAW_SPECIAL_LABEL_PATTERN = /\b(?:SPNP-\d+|SPSP-\d+|SPWP-\d+)\b/;

const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(homeScreen.includes('mapFilter: activeCategory'), 'Home must pass active category chip state into v2 map renderer.');

const allLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'all', zoomLevel: 17 } as any);
assert.equal(allLayers.blocks.length, 42, 'All filter must include B1-B42 block polygons.');
assert.equal(allLayers.rastas.length, 11, 'All filter must include 11 public rastas.');
assert.equal(allLayers.gates.length, 17, 'All filter must include 17 active gates.');
assert.equal(allLayers.visibleGateMarkers.length, 17, 'All filter at high zoom must show active gate markers.');
assert.equal(allLayers.specialRoutes.length, 3, 'All filter must include 3 Shahr-e-Pindal routes.');

const blockLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'blocks', zoomLevel: 17 } as any);
assert.equal(blockLayers.blocks.length, 42, 'Blocks filter must show all 42 block polygons.');
assert.equal(blockLayers.visibleBlockLabels.length, 42, 'Blocks filter must show all block labels at high zoom.');
assert.equal(blockLayers.rastas.length, 0, 'Blocks filter must hide public rasta lines.');
assert.equal(blockLayers.visibleGateMarkers.length, 0, 'Blocks filter must hide gate markers.');
assert.equal(blockLayers.specialRoutes.length, 0, 'Blocks filter must hide Shahr-e-Pindal routes.');

const rastaLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'rastas', zoomLevel: 17 } as any);
assert.equal(rastaLayers.rastas.length, 11, 'Rastas filter must show exactly 11 public rastas.');
assert.equal(rastaLayers.visibleRastaLabels.length, 11, 'Rastas filter must show all public rasta labels at high zoom.');
assert.equal(rastaLayers.blocks.length, 0, 'Rastas filter must hide block polygons.');
assert.equal(rastaLayers.visibleGateMarkers.length, 0, 'Rastas filter must hide gate markers.');
assert.equal(rastaLayers.specialRoutes.length, 0, 'Rastas filter must hide Shahr-e-Pindal routes.');

const gateLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'gates', zoomLevel: 17 } as any);
assert.equal(gateLayers.gates.length, 17, 'Gates filter must include 17 active gates.');
assert.equal(gateLayers.visibleGateMarkers.length, 17, 'Gates filter must show all active gate markers.');
assert.deepEqual(
  gateLayers.gates.map((gate) => gate.id).sort(),
  [
    'GATE_01',
    'GATE_02',
    'GATE_03',
    'GATE_04',
    'GATE_05',
    'GATE_07',
    'GATE_08',
    'GATE_13',
    'GATE_14',
    'GATE_15',
    'GATE_16',
    'GATE_17',
    'GATE_18',
    'GATE_19',
    'GATE_20',
    'GATE_21',
    'GATE_22',
  ],
  'Gates filter must show active gates only.',
);
assert.equal(gateLayers.blocks.length, 0, 'Gates filter must hide block polygons.');
assert.equal(gateLayers.rastas.length, 0, 'Gates filter must hide rasta lines.');
assert.equal(gateLayers.specialRoutes.length, 0, 'Gates filter must hide Shahr-e-Pindal routes.');

const pindalLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'special_routes', zoomLevel: 17 } as any);
assert.equal(pindalLayers.specialRoutes.length, 3, 'Shahr-e-Pindal filter must show 3 Pindal roads.');
assert.equal(pindalLayers.visibleSpecialRouteLabels.length, 3, 'Shahr-e-Pindal filter must show all friendly labels.');
assert.deepEqual(
  pindalLayers.specialRoutes.map((route) => route.label).sort(),
  ['Shahr-e-Pindal North', 'Shahr-e-Pindal South', 'Shahr-e-Pindal West'],
  'Shahr-e-Pindal filter must use friendly names.',
);
assert.equal(pindalLayers.blocks.length, 0, 'Shahr-e-Pindal filter must hide block polygons.');
assert.equal(pindalLayers.rastas.length, 0, 'Shahr-e-Pindal filter must hide public rasta lines.');
assert.equal(pindalLayers.visibleGateMarkers.length, 0, 'Shahr-e-Pindal filter must hide gate markers.');

const publicLabels = [
  ...allLayers.rastas.map((rasta) => rasta.label),
  ...pindalLayers.specialRoutes.map((route) => route.label),
  ...pindalLayers.visibleSpecialRouteLabels.map((route) => route.label),
].join('\n');
assert(!HIDDEN_LABEL_PATTERN.test(publicLabels), 'Hidden connector must not appear in public map filters.');
assert(!RAW_SPECIAL_LABEL_PATTERN.test(publicLabels), 'Raw Shahr-e-Pindal point IDs must not appear in public map filters.');

console.log('Home filter chips v2 checks passed.');
