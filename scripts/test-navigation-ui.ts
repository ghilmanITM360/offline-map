import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';

// Both v1 and v2 live navigation now run in-place on HomeScreen's persistent MapView —
// neither is a separately pushed NavigationScreen anymore (see docs/MAP_EXPERIENCE_AUDIT.md).
// v1's runtime lives in NavigationViewModel (state/effects) + useNavigationOverlayV1 (camera) +
// NavigationMapLayersV1/NavigationChromeV1 (rendering). v2's equivalent is
// useNavigationOverlayV2/NavigationMapLayersV2/NavigationChromeV2. Since both hooks now run
// unconditionally inside HomeScreen (no outer screen to gate on activeRoute.sourceVersion),
// NavigationViewModel itself must guard against ever adopting a v2-shaped activeRoute.
const navigationVm = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const navOverlay = readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');
const navMapLayers = readFileSync('src/views/components/navigation/NavigationMapLayersV2.tsx', 'utf8');
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
assert(navMapLayers.includes('mapLayers.blocks') && navMapLayers.includes('BlockLayer'), 'v2 navigation must render block context');
assert(navMapLayers.includes('mapLayers.rastas') && navMapLayers.includes('RastaLayer'), 'v2 navigation must render rasta lines');
assert(navMapLayers.includes('mapLayers.specialRoutes') && navMapLayers.includes('SpecialRouteLayer'), 'v2 navigation must render special route lines');
// Nav-mode gate labels moved out of NavigationMapLayersV2 (no more Marker-snapshot
// GateLayer there) into HomeScreen's shared MapLabelOverlay, built from
// navOverlay.mapLayers.gates — see docs/TARGETED_FIX_SPRINT_REPORT.md Phase 5.
assert(!navMapLayers.includes('GateLayer'), 'v2 nav map layers must not render its own GateLayer (gate labels moved to the shared MapLabelOverlay)');
assert(homeScreen.includes('navOverlay.mapLayers.gates.map('), 'v2 navigation must render gate context via HomeScreen\'s shared mapLabelItems/MapLabelOverlay');
assert(navOverlay.includes('graphOnlyFallbackUsed') && navChrome.includes('graphOnlyFallbackUsed'), 'v2 navigation must expose graph-only fallback status');
assert(navChrome.includes('Graph-only v2 map is active'), 'v2 navigation must show clear graph-only fallback message');

// Phase 8 (docs/ROUTING_NAVIGATION_FIX_REPORT.md): route.coordinates was moved
// into a useMemo above the `!route` early return (Rules of Hooks), so the
// reference is now optional-chained (`route?.coordinates`).
assert(
  navMapLayers.includes('route?.coordinates') &&
    navMapLayers.includes('strokeColor={staticColors.routeInside}') &&
    staticColors.routeInside === '#1A73E8',
  'v2 navigation must render blue route line',
);
assert(navMapLayers.includes('route.origin.coordinate'), 'v2 navigation must render start marker from v2 route origin');
assert(navMapLayers.includes('route.destination.coordinate'), 'v2 navigation must render red destination marker from v2 route destination');
assert(navMapLayers.includes('snappedLocation') && navMapLayers.includes('userMarker'), 'v2 navigation must render current/user marker');
assert(navChrome.includes('Weak GPS signal detected'), 'v2 navigation must show weak GPS warning');
assert(navChrome.includes('Recalculating...'), 'v2 navigation must show reroute state without clearing map');
assert(navChrome.includes('onPress={requestNavigationExit}'), 'v2 active navigation exit must request confirmation');
assert(navChrome.includes('onPress={completeArrivalNavigation}'), 'v2 arrival Done must exit immediately');
assert(navChrome.includes('LocateFixed') && navOverlay.includes('cameraManager.enterNavigationCamera('), 'v2 navigation recenter must be wired');

assert(navAdapter.includes('This gate needs connector verification before navigation.'), 'Missing/disconnected gates must show connector verification message');
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
