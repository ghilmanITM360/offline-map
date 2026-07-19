import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const searchService = readFileSync('src/services/SearchService.ts', 'utf8');
const mapControls = readFileSync('src/views/components/map/MapControls.tsx', 'utf8');
const layersSheet = readFileSync('src/views/components/map/LayersSheet.tsx', 'utf8');

assert(!home.includes('Select Start'), 'Home screen should not show Select Start route planner control');
assert(!home.includes('Select Destination'), 'Home screen should not show Select Destination route planner control');
assert(!home.includes('Preview Route'), 'Home screen should use Directions label instead of Preview Route');
assert(!home.includes('Use GPS'), 'Home screen should not show old Use GPS label');
assert(home.includes('Directions'), 'Home screen should expose Directions CTA');
assert(home.includes('LayersSheet') && home.includes('openLayerOptions'), 'Home screen should wire a map layer chooser sheet');
assert(layersSheet.includes('Map Layers'), 'Layers sheet should be titled Map Layers');
assert(!home.includes("Alert.alert('Map Layers'"), 'Layers control should be a bottom sheet, not a native Alert action sheet');
assert(!home.includes('Voice Search'), 'Home should hide voice-search action until it is fully implemented');
assert(home.includes('handleCompassReset'), 'Home compass control should call compass reset handler');
assert(mapControls.includes('North-up') && mapControls.includes('Free rotate'), 'Home should explain compass state (north-up vs free rotate)');
assert(home.includes('[HomeControl] pressed='), 'Home controls should emit dev diagnostics logs');
assert(home.includes('__DEV__ && developerModeEnabled'), 'Developer controls must be gated behind __DEV__ and developer mode');
assert(home.includes('marginRight: 76'), 'Outside-area warning should leave room for right-side map controls');
assert(home.includes('paddingRight: 88'), 'Category chips should have trailing padding so the last chip is not hidden behind controls');
assert(home.includes('setOutsideBannerDismissed'), 'Outside-area warning should be compact and dismissible');
assert(
  home.includes('RoutingServiceV2.recommendOutsideEntryGate'),
  'Home outside-area banner should explain nearest-gate offline routing',
);
assert(
  home.includes('Background map not downloaded. Ijtema routes still work.'),
  'Home screen should explain that missing background tiles do not block Ijtema routing',
);
assert(home.includes('categoryChips'), 'Home categories should be data-driven, not hardcoded two chips');
assert(home.includes('Member Masjid Gates'), 'Block detail sheet should show Member Masjid gates');
assert(home.includes('userMarkerPulse'), 'Home should render a pulsing user marker');
assert(searchService.includes("{ id: 'gates', label: 'Gates' }"), 'Search categories should include Gates');
assert(searchService.includes("{ id: 'masjids', label: 'Masjids' }"), 'Search categories should include Masjids');
assert(searchService.includes("{ id: 'terminals', label: 'Terminals' }"), 'Search categories should include Terminals');
assert(searchService.includes("{ id: 'help', label: 'Help' }"), 'Search categories should include Help');

console.log('Home UX flow checks passed.');
