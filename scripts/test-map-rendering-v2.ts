import { strict as assert } from 'node:assert';

import { MapFeatureFlagsService } from '../src/services/MapFeatureFlagsService';
import { SearchService } from '../src/services/SearchService';
import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

const INTERNAL_ID_PATTERN = /\b(?:R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|P\d+|B\d+_C\d+)\b/;

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

assert.equal(MapFeatureFlagsService.useIjtemaV2Map(), true, 'v2 map flag must be enabled for rendering tests');

const layers = V2MapRenderingService.getHomeLayers({
  selectedPlaceId: 'B42',
  developerMode: false,
  graphOnlyFallback: true,
});

assert.equal(layers.useV2Map, true, 'Home v2 render path must be explicit');
assert.equal(layers.graphOnlyFallbackSupported, true, 'Home v2 graph-only fallback must be supported');
assert.equal(layers.venueBoundary.length, 4, 'Venue boundary must be renderable');
assert.equal(layers.blocks.length, 42, 'Home v2 render path must use 42 block polygons');
assert(layers.blocks.every((block) => block.polygon.length >= 3), 'Every v2 block must have renderable polygon coordinates');
assert.equal(layers.blocks.find((block) => block.id === 'B42')?.isSelected, true, 'Selected block highlight model must exist');
assert.equal(layers.blocks.find((block) => block.id === 'B42')?.pulse, true, 'Selected block must support pulse/highlight state');
assert(layers.blocks.every((block) => !INTERNAL_ID_PATTERN.test(block.label)), 'Normal block labels must not expose internal IDs');

assert.equal(layers.gates.length, 18, 'Home v2 must render all active gate markers only');
assert.equal(layers.gates.some((gate) => gate.id === 'GATE_15'), true, 'Active Gate 15 must render on map');
assert.equal(layers.gates.find((gate) => gate.id === 'GATE_18')?.isRoutable, false, 'Disconnected Gate 18 marker must not be route-enabled');
assert(layers.gates.every((gate) => gate.coordinate), 'Rendered gates must all have real coordinates');

assert.equal(layers.rastas.length, 14, 'All 14 surveyed Rasta segments must be renderable');
assert.equal(new Set(layers.rastas.map((rasta) => rasta.sourceId ?? rasta.id)).size, 11, 'Rasta 01-11 must remain the logical map identities');
assert(layers.rastas.every((rasta) => rasta.polyline.length >= 2), 'Each rasta must have a renderable polyline');
assert(layers.rastas.every((rasta) => /^Rasta \d{2}$/.test(rasta.label)), 'Rasta labels must be user-facing names');
assert.equal(layers.rastas.some((rasta) => rasta.label === 'Rasta 12' || rasta.id === 'R12'), false, 'Hidden bridge must not render as public Rasta 12');

assert.equal(layers.specialRoutes.length, 3, 'Shahr-e-Pindal North/South/West routes must be renderable');
assert(layers.specialRoutes.some((route) => route.label === 'Shahr-e-Pindal North'), 'North Shahr-e-Pindal label must render');
assert(layers.specialRoutes.some((route) => route.label === 'Shahr-e-Pindal South'), 'South Shahr-e-Pindal label must render');
assert(layers.specialRoutes.some((route) => route.label === 'Shahr-e-Pindal West'), 'West Shahr-e-Pindal label must render');

const selectedRasta = SearchService.search('Rasta 09')[0];
const rastaLayers = V2MapRenderingService.getHomeLayers({
  selectedPlaceId: selectedRasta.id,
  developerMode: false,
  graphOnlyFallback: true,
});
assert.equal(rastaLayers.rastas.find((rasta) => (rasta.sourceId ?? rasta.id) === 'R9')?.isSelected, true, 'Selected rasta highlight must exist');

const normalLabels = [
  ...layers.blocks.map((block) => block.label),
  ...layers.gates.map((gate) => gate.label),
  ...layers.rastas.map((rasta) => rasta.label),
  ...layers.specialRoutes.map((route) => route.label),
];
assert(normalLabels.every((label) => !INTERNAL_ID_PATTERN.test(label)), 'Normal render labels must hide internal IDs');

const developerLayers = V2MapRenderingService.getHomeLayers({
  selectedPlaceId: 'R9',
  developerMode: true,
  graphOnlyFallback: true,
});
assert(developerLayers.developerLabels.some((label) => label.text.includes('R9-01')), 'Developer layers may expose rasta point IDs');
assert(developerLayers.developerLabels.some((label) => label.text.includes('B42_C1')), 'Developer layers may expose block entry IDs');

console.log('Map rendering v2 checks passed.');
