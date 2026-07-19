import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// v2 live navigation now runs in-place on HomeScreen's persistent MapView instead of a
// separately pushed NavigationScreen — see docs/MAP_EXPERIENCE_AUDIT.md. NavigationScreen.tsx
// is now v1-only, plus a defensive NavigationScreenV2Disabled fallback for stale/rollback v2
// routes. The v2 runtime itself now lives in useNavigationOverlayV2 (state/effects),
// NavigationMapLayersV2 (map children), and NavigationChromeV2 (banners/cards/buttons).
const navigation = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const navOverlay = readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');
const navMapLayers = readFileSync('src/views/components/navigation/NavigationMapLayersV2.tsx', 'utf8');
const navChrome = readFileSync('src/views/components/navigation/NavigationChromeV2.tsx', 'utf8');
const navVmV2 = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const navAdapter = readFileSync('src/services/V2NavigationAdapter.ts', 'utf8');
const runtime = readFileSync('src/services/V2NavigationRuntimeService.ts', 'utf8');

assert(navigation.includes("activeRoute?.sourceVersion === 'v2'"), 'Navigation must detect v2 active routes');
assert(homeScreen.includes('MapFeatureFlagsService.useIjtemaV2Navigation'), 'Home must gate the v2 navigation overlay with the v2 navigation flag');
assert(navigation.includes('NavigationScreenV2Disabled'), 'Navigation must not send disabled v2 route into v1 runtime');
assert(navigation.includes('NavigationScreenV1'), 'Legacy navigation must remain isolated for rollback');
assert(homeScreen.includes('useNavigationOverlayV2'), 'v2 navigation render path must exist on Home');

assert(navOverlay.includes('V2MapRenderingService.getHomeLayers'), 'v2 navigation must render v2 graph overlay');
assert(navMapLayers.includes('mapLayers.blocks') && navMapLayers.includes('BlockLayer'), 'v2 navigation must render block context');
assert(navMapLayers.includes('mapLayers.rastas') && navMapLayers.includes('RastaLayer'), 'v2 navigation must render rasta lines');
assert(navMapLayers.includes('mapLayers.specialRoutes') && navMapLayers.includes('SpecialRouteLayer'), 'v2 navigation must render special route lines');
assert(navMapLayers.includes('mapLayers.gates') && navMapLayers.includes('GateLayer'), 'v2 navigation must render gate context');
assert(navOverlay.includes('graphOnlyFallbackUsed') && navChrome.includes('graphOnlyFallbackUsed'), 'v2 navigation must expose graph-only fallback status');
assert(navChrome.includes('Graph-only v2 map is active'), 'v2 navigation must show clear graph-only fallback message');

assert(navMapLayers.includes('route.coordinates') && navMapLayers.includes('strokeColor="#1A73E8"'), 'v2 navigation must render blue route line');
assert(navMapLayers.includes('route.origin.coordinate'), 'v2 navigation must render start marker from v2 route origin');
assert(navMapLayers.includes('route.destination.coordinate'), 'v2 navigation must render red destination marker from v2 route destination');
assert(navMapLayers.includes('snappedLocation') && navMapLayers.includes('userMarker'), 'v2 navigation must render current/user marker');
assert(navChrome.includes('Weak GPS signal detected'), 'v2 navigation must show weak GPS warning');
assert(navChrome.includes('Recalculating...'), 'v2 navigation must show reroute state without clearing map');
assert(navChrome.includes('onPress={() => handleExit()}'), 'v2 navigation exit must be wired');
assert(navChrome.includes('LocateFixed') && navOverlay.includes('animateCamera'), 'v2 navigation recenter must be wired');

assert(navAdapter.includes('This gate needs connector verification before navigation.'), 'Missing/disconnected gates must show connector verification message');
assert(navAdapter.includes('canStartActiveNavigation'), 'v2 adapter must validate route start eligibility');
assert(navVmV2.includes('calculateNavigationProgressV2'), 'v2 VM must project progress through runtime service');
assert(runtime.includes('getDynamicOffRouteThresholdMeters'), 'v2 runtime must require dynamic reroute distance threshold');
assert(runtime.includes('shouldTriggerReroute'), 'v2 runtime must require consecutive reroute evidence');
assert(navVmV2.includes('REROUTE_COOLDOWN_MS'), 'v2 VM must enforce reroute cooldown');

// Phase 2 (map-experience redesign): live navigation reuses Home's own zoom/compass controls
// (same shared MapView/mapRef) instead of hiding all map controls during navigation.
assert(homeScreen.includes('showNavOverlay && (') && homeScreen.includes('styles.navControls'), 'Home must render map controls while navigating, not just while browsing');
assert(homeScreen.includes("logHomeControl('nav_compass', 'reset_north_up')"), 'Nav-mode controls must reuse the compass reset handler');
assert(homeScreen.includes("logHomeControl('nav_zoom_in', 'map_zoom_in')") && homeScreen.includes("logHomeControl('nav_zoom_out', 'map_zoom_out')"), 'Nav-mode controls must reuse the zoom in/out handlers');

console.log('Navigation UI checks passed.');
