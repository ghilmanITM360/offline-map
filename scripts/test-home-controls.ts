import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeVm = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const rendering = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');
// Blocks/rastas/special routes/gates are drawn as MapLibre GeoJSON layers built by the shared overlay builders.
const overlaySpec = readFileSync('src/views/components/mapgl/overlaySpec.ts', 'utf8');
const mapControlsSource = readFileSync('src/views/components/map/MapControls.tsx', 'utf8');

assert(home.includes('OfflineMapCanvas'), 'Home must render a map surface');
assert(home.includes('V2MapRenderingService.getHomeLayers'), 'Home must source production layers from v2 rendering service');
assert(home.includes('blocks: showBlockPolygons ? previewVisibleBlocks : []') && overlaySpec.includes('input.blocks.map('), 'Home must render zoom-aware v2 block polygons');
assert(home.includes('rastas: previewVisibleRastas') && overlaySpec.includes('input.rastas.map('), 'Home must render zoom-aware v2 rasta lines');
assert(home.includes('specialRoutes: previewVisibleSpecialRoutes') && overlaySpec.includes('input.specialRoutes.map('), 'Home must render Shahr-e-Pindal routes');
assert(home.includes('gates: previewVisibleGateMarkers') && overlaySpec.includes('input.gates.map('), 'Home must render zoom-aware official gate markers with coordinates');
assert(overlaySpec.includes('needsConnectorVerification'), 'Home must visibly distinguish disconnected gates');
assert(home.includes('graphOnlyFallbackUsed'), 'Home must track graph-only fallback');
assert(home.includes('<OfflineMapCanvas') && home.includes('archiveUri={basemapRejected ? null : basemap.uri}') && !home.includes('PROVIDER_GOOGLE'), 'Home must never request live tiles: the bundled archive is its only basemap');

assert(home.includes('handleZoomIn'), 'Zoom in control must call handler');
assert(home.includes('handleZoomOut'), 'Zoom out control must call handler');
assert(home.includes('handleRecenter'), 'Current location control must call handler');
assert(home.includes('handleCompassToggle'), 'Compass control must call handler');
assert(home.includes('openLayerOptions'), 'Middle/layer map control must call handler');
assert(home.includes('handlePlaceSelect'), 'Map/search selection must call selection handler');
assert(home.includes('bottomSheetRef.current?.'), 'Selected place bottom sheet must be controllable');

assert(home.includes('BackHandler.addEventListener'), 'Android back should step back through sheet modes before exiting Home');
assert(!home.includes('chipsContent'), 'Home must not carry a chip row: the Directory is the one place chooser');
// The Layers/Compass/Zoom/Recenter cluster is one bottom-anchored stack (controlStackBottom)
// instead of a top-anchored group that had to account for banner stacking height — see
// docs/ARCHITECTURE.md / test-map-controls-v2.ts for the full rationale.
assert(home.includes('controlStackBottom'), 'Floating controls must derive their position from the single bottom-anchored control-stack offset');
assert(home.includes('onLayout={(e) => setTopOverlayHeight'), 'Top overlay (menu button) height must be measured, not a hardcoded guess');
// P0-2: route preview lives inside the BottomSheetModal (LocationSheet routePreview mode) —
// no separate floating card to measure. Its extent already comes from the sheet's real snap
// point via resolveOverlayExtent (see scripts/test-map-controls-v2.ts).
assert(home.includes("const controlStackOverlay: OverlayState = { kind: 'sheet', windowHeight: sheetContainerHeight, snapPoints, sheetIndex };"), 'Control stack must derive its overlay extent from the route-preview sheet, not a separate measured card');
assert(
  mapControlsSource.includes("variant: 'browse' | 'nav'") && mapControlsSource.includes("variant === 'browse'"),
  'MapControls must share one component across browse and nav modes',
);
assert(home.includes('<MapControls'), 'Home must render the shared MapControls component');
assert(home.includes('variant="browse"'), 'Home browse controls must use the shared MapControls component');
assert(home.includes('variant="nav"'), 'Home nav-overlay controls must use the shared MapControls component');

assert(homeVm.includes('MapFeatureFlagsService.useIjtemaV2Map'), 'Home VM must use v2 production default flag');
assert(homeVm.includes('EntryGateRoutingService.getVenueStatus'), 'Home VM must use v2 venue status policy');
assert(!homeVm.includes('hasLocationPermission && settings.autoFollowLocation && isMapReady && !isNavigating'), 'Home GPS subscription must not depend on auto-follow being enabled');
assert(homeVm.includes('hasLocationPermission && isMapReady && !isNavigating'), 'Home GPS subscription must stay active after permission grant');
assert(homeVm.includes('MapFeatureFlagsService.useIjtemaV2Map() || isInsideHomeVenue(lastKnownLocation)'), 'Remembered outside location must stay usable when v2 routing is active');
assert(homeVm.includes("We'll take you to the nearest gate when you ask for directions."), 'Outside remembered-location fallback should explain nearest-gate routing');
assert(rendering.includes('graphOnlyFallbackSupported'), 'v2 render service must expose graph-only fallback support');

console.log('Home control checks passed.');
