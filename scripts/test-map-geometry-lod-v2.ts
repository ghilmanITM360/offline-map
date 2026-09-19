import { strict as assert } from 'node:assert';

import { LOW_ZOOM, MEDIUM_ZOOM, HIGH_ZOOM, V2MapRenderingService } from '../src/services/V2MapRenderingService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';

// Phase 6 (task #33): block polygons and rasta polylines used to render fully at every
// zoom level — only their text labels were zoom-gated. This clutters a zoomed-out view.
// Below MEDIUM_ZOOM they should now collapse to "selected only" via visibleBlocks/visibleRastas,
// while the raw unfiltered blocks/rastas fields stay intact for nav mode to keep consuming.

assert(LOW_ZOOM < MEDIUM_ZOOM && MEDIUM_ZOOM < HIGH_ZOOM, 'Zoom thresholds must be strictly ordered');

const lowZoom = V2MapRenderingService.getHomeLayers({ zoomLevel: LOW_ZOOM });
assert.equal(lowZoom.visibleBlocks.length, 0, 'Low zoom must hide all block polygons when nothing is selected');
assert.equal(lowZoom.visibleRastas.length, 0, 'Low zoom must hide all rasta polylines when nothing is selected');
assert.equal(lowZoom.blocks.length, 42, 'Raw blocks field (consumed by nav) must stay full regardless of zoom');
assert.equal(lowZoom.rastas.length, 14, 'Raw Rasta segments field (consumed by nav) must stay full regardless of zoom');

const lowZoomSelected = V2MapRenderingService.getHomeLayers({ selectedPlaceId: 'B10', zoomLevel: LOW_ZOOM });
assert.equal(lowZoomSelected.visibleBlocks.length, 1, 'Low zoom must still surface the selected block');
assert.equal(lowZoomSelected.visibleBlocks[0]?.id, 'B10', 'Low zoom selected block must be the right one');

const lowZoomRastaSelected = V2MapRenderingService.getHomeLayers({ selectedPlaceId: 'R9', zoomLevel: LOW_ZOOM });
assert.equal(lowZoomRastaSelected.visibleRastas.length, 1, 'Low zoom must still surface the selected rasta');
assert.equal(lowZoomRastaSelected.visibleRastas[0]?.id, 'R9', 'Low zoom selected rasta must be the right one');

const mediumZoom = V2MapRenderingService.getHomeLayers({ zoomLevel: MEDIUM_ZOOM });
assert.equal(mediumZoom.visibleBlocks.length, 42, 'Medium zoom must render all block polygons');
assert.equal(mediumZoom.visibleRastas.length, 14, 'Medium zoom must render all surveyed Rasta segment polylines');

const highZoom = V2MapRenderingService.getHomeLayers({ zoomLevel: HIGH_ZOOM });
assert.equal(highZoom.visibleBlocks.length, 42, 'High zoom must render all block polygons');
assert.equal(highZoom.visibleRastas.length, 14, 'High zoom must render all surveyed Rasta segment polylines');

const filteredLowZoom = V2MapRenderingService.getHomeLayers({ mapFilter: 'blocks', zoomLevel: LOW_ZOOM });
assert.equal(filteredLowZoom.visibleBlocks.length, 42, 'Explicit Blocks filter must bypass low-zoom LOD');

const rastaFilteredLowZoom = V2MapRenderingService.getHomeLayers({ mapFilter: 'rastas', zoomLevel: LOW_ZOOM });
assert.equal(rastaFilteredLowZoom.visibleRastas.length, 14, 'Explicit Rastas filter must bypass low-zoom LOD for every surveyed segment');

// Special routes are treated as "major routes" per the LOD spec — always rendered, no gating.
const lowZoomSpecialRoutes = V2MapRenderingService.getHomeLayers({ zoomLevel: LOW_ZOOM });
assert.equal(lowZoomSpecialRoutes.specialRoutes.length, 3, 'Low zoom must keep special (major) routes rendered');

// Major gates stay visible at low zoom; this predates Phase 6 (task #27) but is re-asserted
// here as the sibling half of the same "low zoom = boundary/major gates/major routes" rule.
assert(
  lowZoomSpecialRoutes.visibleGateMarkers.some((gate) => gate.id === 'GATE_05'),
  'Low zoom must keep at least one major gate visible',
);

const homeScreenSource = require('node:fs').readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
assert(homeScreenSource.includes('v2MapLayers.visibleBlocks'), 'Home must render the zoom-gated block layer, not the raw unfiltered one');
assert(homeScreenSource.includes('v2MapLayers.visibleRastas'), 'Home must render the zoom-gated rasta layer, not the raw unfiltered one');

const navOverlaySource = require('node:fs').readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');
assert(navOverlaySource.includes('getHomeLayers'), 'Nav overlay must share the same rendering service as Home');
const navLayersSource = require('node:fs').readFileSync('src/views/components/navigation/NavigationMapLayersV2.tsx', 'utf8');
assert(
  navLayersSource.includes('mapLayers.blocks') && navLayersSource.includes('mapLayers.rastas'),
  'Nav mode must keep consuming the unfiltered blocks/rastas fields, not the Home-only zoom-gated ones',
);

console.log('Map geometry LOD v2 checks passed.');
