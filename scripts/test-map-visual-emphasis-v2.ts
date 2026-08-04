/**
 * Verifies that V2MapRenderingService.getHomeLayers() exposes activeMapFilter
 * so HomeScreen can apply filter-aware visual emphasis per layer.
 */

import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

const ZOOM = 15;

// ---------- activeMapFilter field ----------
const allLayers = V2MapRenderingService.getHomeLayers({ zoomLevel: ZOOM });
assert(allLayers.activeMapFilter === 'all', 'null filter → activeMapFilter = "all"');

const blockLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'blocks', zoomLevel: ZOOM });
assert(blockLayers.activeMapFilter === 'blocks', 'blocks filter → activeMapFilter = "blocks"');

const rastaLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'rastas', zoomLevel: ZOOM });
assert(rastaLayers.activeMapFilter === 'rastas', 'rastas filter → activeMapFilter = "rastas"');

const gateLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'gates', zoomLevel: ZOOM });
assert(gateLayers.activeMapFilter === 'gates', 'gates filter → activeMapFilter = "gates"');

const pindalLayers = V2MapRenderingService.getHomeLayers({ mapFilter: 'special_routes', zoomLevel: ZOOM });
assert(pindalLayers.activeMapFilter === 'special_routes', 'special_routes filter → activeMapFilter = "special_routes"');

// ---------- focused filter shows full layer ----------
assert(blockLayers.blocks.length === 42, 'blocks filter: 42 block polygons returned');
assert(blockLayers.visibleBlockLabels.length === 42, 'blocks filter: all 42 block labels returned (no zoom restriction)');
assert(blockLayers.rastas.length === 0, 'blocks filter: rastas hidden');
assert(blockLayers.gates.length === 0, 'blocks filter: gates hidden');
assert(blockLayers.specialRoutes.length === 0, 'blocks filter: specialRoutes hidden');

assert(rastaLayers.rastas.length === 11, 'rastas filter: 11 public rastas');
assert(rastaLayers.visibleRastaLabels.length === 11, 'rastas filter: all 11 rasta labels');
assert(rastaLayers.blocks.length === 0, 'rastas filter: blocks hidden');
assert(rastaLayers.gates.length === 0, 'rastas filter: gates hidden');

assert(gateLayers.gates.length === 18, 'gates filter: 18 active gates');
assert(gateLayers.visibleGateMarkers.length === 18, 'gates filter: all 18 gate markers');
assert(gateLayers.blocks.length === 0, 'gates filter: blocks hidden');
assert(gateLayers.rastas.length === 0, 'gates filter: rastas hidden');

assert(pindalLayers.specialRoutes.length === 3, 'pindal filter: 3 special routes');
assert(pindalLayers.visibleSpecialRouteLabels.length === 3, 'pindal filter: all 3 special route labels');
assert(pindalLayers.blocks.length === 0, 'pindal filter: blocks hidden');
assert(pindalLayers.rastas.length === 0, 'pindal filter: rastas hidden');

// ---------- friendly labels ----------
const rastaLabelValues = rastaLayers.visibleRastaLabels.map((r) => r.label);
assert(
  rastaLabelValues.every((l) => /^Rasta \d{2}$/.test(l)),
  `rasta labels friendly "Rasta XX" format — got: ${rastaLabelValues.join(', ')}`,
);

const gateIds = gateLayers.gates.map((g) => g.id);
const forbidden = ['GATE_06', 'GATE_09', 'GATE_10', 'GATE_11'];
assert(
  forbidden.every((id) => !gateIds.includes(id)),
  `nonexistent gates absent — checked: ${forbidden.join(', ')}`,
);

const pindalLabels = pindalLayers.visibleSpecialRouteLabels.map((r) => r.label);
const rawIds = ['SPNP', 'SPSP', 'SPWP'];
assert(
  rawIds.every((raw) => !pindalLabels.includes(raw)),
  `pindal labels not raw IDs — labels: ${pindalLabels.join(', ')}`,
);
assert(
  pindalLabels.includes('Shahr-e-Pindal North'),
  `pindal label includes "Shahr-e-Pindal North"`,
);

// ---------- all filter balanced ----------
assert(allLayers.blocks.length === 42, 'all filter: 42 blocks');
assert(allLayers.rastas.length === 11, 'all filter: 11 public rastas');
assert(allLayers.gates.length === 18, 'all filter: 18 gates');
assert(allLayers.specialRoutes.length === 3, 'all filter: 3 special routes');

// ---------- hidden connector absent ----------
const allRastaIds = allLayers.rastas.map((r) => r.id);
assert(!allRastaIds.includes('RASTA_12'), 'Rasta 12 absent from all-filter rastas');
assert(!allRastaIds.some((id) => id.includes('NPC') || id.includes('NORTH_PERIMETER')), 'NPC absent from all-filter rastas');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
