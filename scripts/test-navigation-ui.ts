import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';

// Both v1 and v2 live navigation now run in-place on HomeScreen's persistent MapView —
// neither is a separately pushed NavigationScreen anymore (see docs/ARCHITECTURE.md).
// v1's runtime lives in NavigationViewModel (state/effects) + useNavigationOverlayV1 (camera) +
// NavigationChromeV1 (chrome); the map is drawn by mapgl/navigationScene. v2's equivalent is
// useNavigationOverlayV2/navigationScene/NavigationChromeV2. Since both hooks now run
// unconditionally inside HomeScreen (no outer screen to gate on activeRoute.sourceVersion),
// NavigationViewModel itself must guard against ever adopting a v2-shaped activeRoute.
const navigationVm = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const navOverlay = readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');
const navScene = readFileSync('src/views/components/mapgl/navigationScene.ts', 'utf8');
const overlaySpec = readFileSync('src/views/components/mapgl/overlaySpec.ts', 'utf8');
const navChrome = readFileSync('src/views/components/navigation/NavigationChromeV2.tsx', 'utf8');
const navVmV2 = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const navAdapter = readFileSync('src/services/V2NavigationAdapter.ts', 'utf8');
const runtime = readFileSync('src/services/V2NavigationRuntimeService.ts', 'utf8');

assert(
  navigationVm.includes("(activeRoute as { sourceVersion?: string }).sourceVersion === 'v2'"),
  'Legacy (v1) navigation runtime must detect and reject v2-shaped active routes',
);
assert(homeScreen.includes('MapFeatureFlagsService.useIjtemaV2Navigation'), 'Home must gate the v2 navigation overlay with the v2 navigation flag');
assert(homeScreen.includes('useNavigationOverlayV1') && homeScreen.includes('useNavigationOverlayV2'), 'Both v1 and v2 navigation render paths must exist on Home');

assert(navOverlay.includes('V2MapRenderingService.getHomeLayers'), 'v2 navigation must render v2 graph overlay');
assert(navScene.includes('blocks: mapLayers.blocks') && overlaySpec.includes("id: 'nav-blocks'"), 'v2 navigation must render block context');
assert(navScene.includes('rastas: mapLayers.rastas') && overlaySpec.includes("id: 'nav-rastas'"), 'v2 navigation must render rasta lines');
assert(navScene.includes('specialRoutes: mapLayers.specialRoutes') && overlaySpec.includes("id: 'nav-special'"), 'v2 navigation must render special route lines');
// Nav-mode gate labels are not map layers: HomeScreen's shared MapLabelOverlay draws them, built from
// navOverlay.mapLayers.gates — see docs/ARCHITECTURE.md Phase 5.
assert(!overlaySpec.includes('text-field'), 'nav map layers must not render gate label text (labels live in the shared MapLabelOverlay)');
assert(homeScreen.includes('navOverlay.mapLayers.gates.map('), 'v2 navigation must render gate context via HomeScreen\'s shared mapLabelItems/MapLabelOverlay');
assert(navOverlay.includes('graphOnlyFallbackUsed'), 'v2 navigation must expose graph-only fallback status');
// #66: the chrome no longer branches its copy on graphOnlyFallbackUsed — "Graph-only v2 map
// is active" was internal implementation wording (issue #66's own acceptance criterion:
// product copy must describe user impact, not implementation terms). One basemap-unavailable
// message now covers both cases; graphOnlyFallbackUsed still flows through navOverlay for any
// other consumer, it's just not read by the chrome's own status banner anymore.
assert(navChrome.includes("t('navigation.mapUnavailable')"), 'v2 navigation must show a clear, user-facing basemap-unavailable message');

// Phase 8 (docs/OFFLINE_NAVIGATION_AND_ROUTING.md): route.coordinates was moved
// into a useMemo above the `!route` early return (Rules of Hooks), so the
// reference is now optional-chained (`route?.coordinates`).
assert(
  navScene.includes('buildRouteOverlay(') &&
    overlaySpec.includes("'line-color': staticColors.routeInside") &&
    staticColors.routeInside === '#1A73E8',
  'v2 navigation must render blue route line',
);
assert(navScene.includes('route.origin.coordinate'), 'v2 navigation must render start marker from v2 route origin');
assert(navScene.includes('route.destination.coordinate'), 'v2 navigation must render red destination marker from v2 route destination');
assert(navScene.includes('snappedLocation') && navScene.includes('user:'), 'v2 navigation must render current/user marker');
assert(navChrome.includes("t('navigation.weakSignal')"), 'v2 navigation must show weak GPS warning');
assert(navChrome.includes("t('navigation.findingNewWay')"), 'v2 navigation must show reroute state without clearing map');
assert(navChrome.includes('onPress={requestNavigationExit}'), 'v2 active navigation exit must request confirmation');
assert(navChrome.includes('onPress={completeArrivalNavigation}'), 'v2 arrival Done must exit immediately');
assert(navChrome.includes('LocateFixed') && navOverlay.includes('cameraManager.enterNavigationCamera('), 'v2 navigation recenter must be wired');

assert(navAdapter.includes("t('navigation.gateNotReady')"), 'Missing/disconnected gates must show a plain not-ready message');
assert(navAdapter.includes('canStartActiveNavigation'), 'v2 adapter must validate route start eligibility');
assert(navVmV2.includes('calculateNavigationProgressV2'), 'v2 VM must project progress through runtime service');
assert(runtime.includes('getDynamicOffRouteThresholdMeters'), 'v2 runtime must require dynamic reroute distance threshold');
assert(runtime.includes('shouldTriggerReroute'), 'v2 runtime must require consecutive reroute evidence');
assert(navVmV2.includes('REROUTE_COOLDOWN_MS'), 'v2 VM must enforce reroute cooldown');

// Phase 2 (map-experience redesign): live navigation reuses Home's own zoom/compass controls
// (same shared MapView/mapRef) instead of hiding all map controls during navigation.
assert(homeScreen.includes("mode === 'NAVIGATION' && (") && homeScreen.includes('styles.navControls'), 'Home must render map controls while navigating, not just while browsing');
assert(
  homeScreen.includes("logHomeControl('nav_compass',") && homeScreen.includes('handleCompassToggle'),
  'Nav-mode controls must reuse the compass toggle handler',
);
assert(homeScreen.includes("logHomeControl('nav_zoom_in', 'map_zoom_in')") && homeScreen.includes("logHomeControl('nav_zoom_out', 'map_zoom_out')"), 'Nav-mode controls must reuse the zoom in/out handlers');

console.log('Navigation UI checks passed.');
