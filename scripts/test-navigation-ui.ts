import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const navigation = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const navVmV2 = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const navAdapter = readFileSync('src/services/V2NavigationAdapter.ts', 'utf8');
const runtime = readFileSync('src/services/V2NavigationRuntimeService.ts', 'utf8');

assert(navigation.includes("activeRoute?.sourceVersion === 'v2'"), 'Navigation must detect v2 active routes');
assert(navigation.includes('MapFeatureFlagsService.useIjtemaV2Navigation'), 'Navigation must gate v2 runtime with v2 navigation flag');
assert(navigation.includes('NavigationScreenV2Disabled'), 'Navigation must not send disabled v2 route into v1 runtime');
assert(navigation.includes('NavigationScreenV1'), 'Legacy navigation must remain isolated for rollback');
assert(navigation.includes('NavigationScreenV2'), 'v2 navigation render path must exist');

assert(navigation.includes('V2MapRenderingService.getHomeLayers'), 'v2 navigation must render v2 graph overlay');
assert(navigation.includes('v2MapLayers.blocks.map'), 'v2 navigation must render block context');
assert(navigation.includes('v2MapLayers.rastas.map'), 'v2 navigation must render rasta lines');
assert(navigation.includes('v2MapLayers.specialRoutes.map'), 'v2 navigation must render special route lines');
assert(navigation.includes('v2MapLayers.gates.map'), 'v2 navigation must render gate context');
assert(navigation.includes('selectedBlockHighlightReady'), 'v2 navigation diagnostics must include selected block highlight');
assert(navigation.includes('graphOnlyFallbackUsed'), 'v2 navigation must expose graph-only fallback status');
assert(navigation.includes("Graph-only v2 map is active"), 'v2 navigation must show clear graph-only fallback message');

assert(navigation.includes('route.coordinates') && navigation.includes('strokeColor="#1A73E8"'), 'v2 navigation must render blue route line');
assert(navigation.includes('route.origin.coordinate'), 'v2 navigation must render start marker from v2 route origin');
assert(navigation.includes('route.destination.coordinate'), 'v2 navigation must render red destination marker from v2 route destination');
assert(navigation.includes('snappedLocation') && navigation.includes('userMarker'), 'v2 navigation must render current/user marker');
assert(navigation.includes('Weak GPS signal detected'), 'v2 navigation must show weak GPS warning');
assert(navigation.includes('Recalculating...'), 'v2 navigation must show reroute state without clearing map');
assert(navigation.includes('handleExit(nav)'), 'v2 navigation exit must be wired');
assert(navigation.includes('LocateFixed') && navigation.includes('animateCamera'), 'v2 navigation recenter must be wired');

assert(navAdapter.includes('This gate needs connector verification before navigation.'), 'Missing/disconnected gates must show connector verification message');
assert(navAdapter.includes('canStartActiveNavigation'), 'v2 adapter must validate route start eligibility');
assert(navVmV2.includes('calculateNavigationProgressV2'), 'v2 VM must project progress through runtime service');
assert(runtime.includes('getDynamicOffRouteThresholdMeters'), 'v2 runtime must require dynamic reroute distance threshold');
assert(runtime.includes('shouldTriggerReroute'), 'v2 runtime must require consecutive reroute evidence');
assert(navVmV2.includes('REROUTE_COOLDOWN_MS'), 'v2 VM must enforce reroute cooldown');

console.log('Navigation UI checks passed.');
