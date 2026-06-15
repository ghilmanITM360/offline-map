import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeVm = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const rendering = readFileSync('src/services/V2MapRenderingService.ts', 'utf8');

assert(home.includes('MapView'), 'Home must render a map surface');
assert(home.includes('V2MapRenderingService.getHomeLayers'), 'Home must source production layers from v2 rendering service');
assert(home.includes('v2MapLayers.blocks.map'), 'Home must render v2 block polygons');
assert(home.includes('v2MapLayers.rastas.map'), 'Home must render v2 rasta lines');
assert(home.includes('v2MapLayers.specialRoutes.map'), 'Home must render Shahr-e-Pindal routes');
assert(home.includes('v2MapLayers.visibleGateMarkers.map'), 'Home must render zoom-aware official gate markers with coordinates');
assert(home.includes('gate.needsConnectorVerification'), 'Home must visibly distinguish disconnected gates');
assert(home.includes('graphOnlyFallbackUsed'), 'Home must track graph-only fallback');
assert(home.includes("mapType={hasGoogleMapsKey ? (isOffline ? 'none' : mapType) : 'none'}"), 'Home must not require base tiles for graph-only map');

assert(home.includes('handleZoomIn'), 'Zoom in control must call handler');
assert(home.includes('handleZoomOut'), 'Zoom out control must call handler');
assert(home.includes('handleRecenter'), 'Current location control must call handler');
assert(home.includes('handleCompassReset'), 'Compass control must call handler');
assert(home.includes('openLayerOptions'), 'Middle/layer map control must call handler');
assert(home.includes('handleCategoryPress'), 'Category chips must call filter handler');
assert(home.includes('handlePlaceSelect'), 'Map/search selection must call selection handler');
assert(home.includes('bottomSheetRef.current?.'), 'Selected place bottom sheet must be controllable');

assert(home.includes('setIsSearchFocused') && home.includes('Keyboard.dismiss'), 'Search focus and keyboard dismissal must be handled');
assert(home.includes('BackHandler.addEventListener'), 'Android back should close search before exiting Home');
assert(home.includes('showsHorizontalScrollIndicator={false}'), 'Category chips must use horizontal scrolling instead of clipping');
assert(home.includes('rightControlsTop'), 'Floating controls must account for top banners');
assert(home.includes('outsideBannerTop'), 'Outside warning must not cover map controls');

assert(homeVm.includes('MapFeatureFlagsService.useIjtemaV2Map'), 'Home VM must use v2 production default flag');
assert(homeVm.includes('EntryGateRoutingService.getVenueStatus'), 'Home VM must use v2 venue status policy');
assert(!homeVm.includes('hasLocationPermission && settings.autoFollowLocation && isMapReady && !isNavigating'), 'Home GPS subscription must not depend on auto-follow being enabled');
assert(homeVm.includes('hasLocationPermission && isMapReady && !isNavigating'), 'Home GPS subscription must stay active after permission grant');
assert(homeVm.includes('MapFeatureFlagsService.useIjtemaV2Map() || isInsideHomeVenue(lastKnownLocation)'), 'Remembered outside location must stay usable when v2 routing is active');
assert(homeVm.includes('Offline routing will enter through nearest connected official gate.'), 'Outside remembered-location fallback should explain nearest-gate routing');
assert(rendering.includes('graphOnlyFallbackSupported'), 'v2 render service must expose graph-only fallback support');

console.log('Home control checks passed.');
