import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const searchService = readFileSync('src/services/SearchService.ts', 'utf8');
const mapControls = readFileSync('src/views/components/map/MapControls.tsx', 'utf8');
const layersSheet = readFileSync('src/views/components/map/LayersSheet.tsx', 'utf8');
const locationSheet = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');

assert(!home.includes('Select Start'), 'Home screen should not show Select Start route planner control');
assert(!home.includes('Select Destination'), 'Home screen should not show Select Destination route planner control');
assert(!home.includes('Preview Route'), 'Home screen should use Directions label instead of Preview Route');
assert(!home.includes('Use GPS'), 'Home screen should not show old Use GPS label');
assert(home.includes('Directions'), 'Home screen should expose Directions CTA');
assert(home.includes('LayersSheet') && home.includes('openLayerOptions'), 'Home screen should wire a map layer chooser sheet');
assert(layersSheet.includes('Map Layers'), 'Layers sheet should be titled Map Layers');
assert(!home.includes("Alert.alert('Map Layers'"), 'Layers control should be a bottom sheet, not a native Alert action sheet');
assert(!home.includes('Voice Search'), 'Home should hide voice-search action until it is fully implemented');
assert(home.includes('handleCompassToggle'), 'Home compass control should call compass toggle handler');
assert(mapControls.includes('north-up') && mapControls.includes('Compass') && mapControls.includes('Navigation'), 'The orientation control must carry its own state (compass = north-up, arrow = following) with a spoken label');
assert(home.includes('[HomeControl] pressed='), 'Home controls should emit dev diagnostics logs');
assert(home.includes('__DEV__ && developerModeEnabled'), 'Developer controls must be gated behind __DEV__ and developer mode');
assert(home.includes('marginRight: 76'), 'Outside-area warning should leave room for right-side map controls');
assert(!home.includes('paddingRight: 88'), 'Home must not carry a category chip row');
assert(home.includes('setOutsideBannerDismissed'), 'Outside-area warning should be compact and dismissible');
assert(
  home.includes('recommendPreviewEntryGate(currentLocation, selectedPlace)') && readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8').includes('return RoutingServiceV2.recommendOutsideEntryGate'),
  'Home outside-area banner should explain nearest-gate offline routing',
);
assert(
  !home.includes('Background map not downloaded') && !home.includes('Download background map'),
  'Home screen must not claim a background map is missing: the offline basemap ships with the app (#140)',
);
// Category browsing moved to LocationsDirectoryScreen (PublicDestinationsService.getCategories(),
// itself data-driven, not hardcoded) — Home keeps a single chip that opens it.
assert(home.includes("nav.navigate('LocationsDirectory')"), 'Home hands off to the data-driven Locations Directory (arrival Done, start/destination changes), not hardcoded category chips');
assert(locationSheet.includes('Member Masjid Gates'), 'Block detail sheet should show Member Masjid gates');
assert(home.includes('buildMarkerOverlay('), 'Home should render the user dot through the shared marker overlay');
assert(searchService.includes("{ id: 'gates', label: 'Gates' }"), 'Search categories should include Gates');
assert(searchService.includes("{ id: 'masjids', label: 'Masjids' }"), 'Search categories should include Masjids');
assert(searchService.includes("{ id: 'terminals', label: 'Terminals' }"), 'Search categories should include Terminals');
assert(searchService.includes("{ id: 'help', label: 'Help' }"), 'Search categories should include Help');

console.log('Home UX flow checks passed.');
