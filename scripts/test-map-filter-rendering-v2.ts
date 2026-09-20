import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const renderService = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');

assert(renderService.includes('mapFilter'), 'V2 map renderer must accept mapFilter option.');
// Home no longer drives category filtering (LocationsDirectoryScreen owns category
// browsing) — it always passes mapFilter: null, but the renderer's own filtering logic
// (exercised directly below) stays a supported, tested capability for any future caller.
assert(homeScreen.includes('mapFilter: null'), 'Home must not drive mapFilter from a removed category-chip selection.');

const layerCounts = (filter: string | null) => {
  const layers = V2MapRenderingService.getHomeLayers({ mapFilter: filter, zoomLevel: 17 } as any);
  return {
    blocks: layers.blocks.length,
    blockLabels: layers.visibleBlockLabels.length,
    gates: layers.visibleGateMarkers.length,
    rastas: layers.rastas.length,
    rastaLabels: layers.visibleRastaLabels.length,
    pindal: layers.specialRoutes.length,
    pindalLabels: layers.visibleSpecialRouteLabels.length,
    boundary: layers.venueBoundary.length,
  };
};

assert.deepEqual(layerCounts('blocks'), {
  blocks: 42,
  blockLabels: 42,
  gates: 0,
  rastas: 0,
  rastaLabels: 0,
  pindal: 0,
  pindalLabels: 0,
  boundary: 4,
}, 'Blocks filter must render block-only layer set.');

assert.deepEqual(layerCounts('rastas'), {
  blocks: 0,
  blockLabels: 0,
  gates: 0,
  rastas: 14,
  rastaLabels: 11,
  pindal: 0,
  pindalLabels: 0,
  boundary: 4,
}, 'Rastas filter must render rasta-only layer set.');

assert.deepEqual(layerCounts('gates'), {
  blocks: 0,
  blockLabels: 0,
  gates: 18,
  rastas: 0,
  rastaLabels: 0,
  pindal: 0,
  pindalLabels: 0,
  boundary: 4,
}, 'Gates filter must render gate-only layer set.');

assert.deepEqual(layerCounts('special_routes'), {
  blocks: 0,
  blockLabels: 0,
  gates: 0,
  rastas: 0,
  rastaLabels: 0,
  pindal: 3,
  pindalLabels: 3,
  boundary: 4,
}, 'Shahr-e-Pindal filter must render Pindal-only layer set.');

assert.notDeepEqual(layerCounts('blocks'), layerCounts('gates'), 'Overlay counts must change when chip changes.');
assert(homeScreen.includes('activePreviewRoute.coordinates'), 'Route preview polyline must stay separate from category-filtered layers.');
assert(homeScreen.includes('previewDestinationCoordinate') && homeScreen.includes('previewStartCoordinate'), 'Route preview markers must stay separate from category-filtered layers.');

console.log('Map filter rendering v2 checks passed.');
