import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const locationSheetSource = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');

assert(homeScreenSource.includes('DrawerActions.openDrawer()'), 'Home menu button must open drawer.');
assert(homeScreenSource.includes('handleRecenter'), 'Home current-location button must stay wired.');
assert(homeScreenSource.includes('handleZoomIn'), 'Home zoom-in button must stay wired.');
assert(homeScreenSource.includes('handleZoomOut'), 'Home zoom-out button must stay wired.');
assert(homeScreenSource.includes('handleCompassToggle'), 'Home compass button must stay wired.');
assert(homeScreenSource.includes('openLayerOptions'), 'Home layer button must stay wired.');
assert(homeScreenSource.includes('Directions'), 'Home selected-place action must still open Directions.');
// P0-2: route preview (Cancel Route / Start Navigation) is a single surface —
// LocationSheet's routePreview mode, rendered via HomeScreen's routePreviewSheetDestination —
// not a separate floating card on HomeScreen itself. Phase C later removed the manual
// "Change Start" picker: the resolved start is presentation-only, owned end to end by the
// canonical origin resolver (resolveNavigationOrigin/DirectionsViewModel) — no picker.
assert(homeScreenSource.includes('routePreviewSheetDestination'), 'Home must resolve a single route-preview destination feeding LocationSheet routePreview mode.');
assert(homeScreenSource.includes('onCancelRoute={activePreviewRoute ? handleClearPreviewRoute : undefined}'), 'Home must wire Cancel Route into LocationSheet when a preview exists.');
assert(homeScreenSource.includes('onStartNavigation={handleStartPreviewNavigation}'), 'Home must wire Start Navigation into LocationSheet.');
assert(locationSheetSource.includes('Cancel Route'), 'LocationSheet routePreview mode must expose Cancel Route button when preview exists.');
assert(locationSheetSource.includes('Start Navigation'), 'LocationSheet routePreview mode must expose Start Navigation button when preview exists.');
assert(!locationSheetSource.includes('Change Start'), 'LocationSheet routePreview mode must not reintroduce the removed manual Change Start picker.');
assert(homeScreenSource.includes('BackHandler.addEventListener'), 'Android back on Home must still work.');

console.log('Home buttons v2 checks passed.');
