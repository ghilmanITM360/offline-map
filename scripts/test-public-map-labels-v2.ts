import { strict as assert } from 'node:assert';

import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

const RAW_ID_PATTERN = /\b(?:NPC(?:-\d+)?|NORTH_PERIMETER_CONNECTOR|Rasta 12|SPNP-\d+|SPSP-\d+|SPWP-\d+|R\d+-\d+|B\d+_C\d+)\b/i;
const NONEXISTENT_GATES = new Set(['GATE_06', 'GATE_09', 'GATE_10', 'GATE_11']);

const filters = ['all', 'blocks', 'rastas', 'gates', 'special_routes'];

for (const filter of filters) {
  const layers = V2MapRenderingService.getHomeLayers({ mapFilter: filter, zoomLevel: 17 } as any);
  const labels = [
    ...layers.blocks.map((block) => block.label),
    ...layers.visibleBlockLabels.map((block) => block.label),
    ...layers.gates.map((gate) => gate.label),
    ...layers.visibleGateMarkers.map((gate) => gate.label),
    ...layers.rastas.map((rasta) => rasta.label),
    ...layers.visibleRastaLabels.map((rasta) => rasta.label),
    ...layers.specialRoutes.map((route) => route.label),
    ...layers.visibleSpecialRouteLabels.map((route) => route.label),
  ];

  assert(labels.every((label) => !RAW_ID_PATTERN.test(label)), `${filter} filter must hide raw/internal map labels.`);
  assert(layers.rastas.every((rasta) => rasta.id !== 'R12' && rasta.label !== 'Rasta 12'), `${filter} filter must hide Rasta 12.`);
  assert(layers.gates.every((gate) => !NONEXISTENT_GATES.has(gate.id)), `${filter} filter must hide nonexistent gates 06/09/10/11.`);
}

const pindalLabels = V2MapRenderingService.getHomeLayers({ mapFilter: 'special_routes', zoomLevel: 17 } as any)
  .visibleSpecialRouteLabels
  .map((route: { label: string }) => route.label);
assert.deepEqual(pindalLabels.sort(), ['Shahr-e-Pindal North', 'Shahr-e-Pindal South', 'Shahr-e-Pindal West'], 'Pindal labels must be friendly route names only.');

console.log('Public map labels v2 checks passed.');
