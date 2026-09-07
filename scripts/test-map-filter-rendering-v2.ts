import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const renderService = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');

assert(renderService.includes('mapFilter'), 'V2 map renderer must accept mapFilter option.');
// Phase D (UX simplification): the map-owned category filter chips were removed — Home
// always passes a fixed `null` filter now. V2MapRenderingService itself still supports
// category filtering in full (exercised directly below), just no longer Home-UI-driven.
assert(homeScreen.includes('mapFilter: null'), 'Home must pass a fixed null filter into V2 map renderer (no map-owned category chips).');

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
  rastas: 11,
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
