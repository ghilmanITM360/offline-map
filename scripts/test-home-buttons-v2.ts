import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const locationSheetSource = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');

assert(homeScreenSource.includes('DrawerActions.openDrawer()'), 'Home menu button must open drawer.');
// Owner rule: the Directory is the ONE place chooser. The map carries no search pill or browse chip.
assert(!homeScreenSource.includes('Search destinations') && !homeScreenSource.includes("'search_bar'"), 'Home must not expose a Search destinations control.');
assert(!homeScreenSource.includes('All Locations') && !homeScreenSource.includes('all_locations_chip'), 'Home must not expose an All Locations chip.');
assert(homeScreenSource.includes('handleOpenDirectoryFor'), 'Home must still hand start/destination changes to the Directory.');
assert(readFileSync('src/views/components/CustomDrawer.tsx', 'utf8').includes("route: 'LocationsDirectory'"), 'The drawer must keep one way back to the Directory.');
assert(homeScreenSource.includes('handleRecenter'), 'Home current-location button must stay wired.');
assert(homeScreenSource.includes('handleZoomIn'), 'Home zoom-in button must stay wired.');
assert(homeScreenSource.includes('handleZoomOut'), 'Home zoom-out button must stay wired.');
assert(homeScreenSource.includes('handleCompassToggle'), 'Home compass button must stay wired.');
assert(homeScreenSource.includes('openLayerOptions'), 'Home layer button must stay wired.');
assert(homeScreenSource.includes('Directions'), 'Home selected-place action must still open Directions.');
// P0-2: route preview (Cancel Route / Start Navigation / Change Start) is a single surface —
// LocationSheet's routePreview mode, rendered via HomeScreen's routePreviewSheetDestination —
// not a separate floating card on HomeScreen itself.
assert(homeScreenSource.includes('routePreviewSheetDestination'), 'Home must resolve a single route-preview destination feeding LocationSheet routePreview mode.');
assert(homeScreenSource.includes('onCancelRoute={handleClearPreviewRoute}'), 'Home must wire explicit Cancel Route into every Directions context, including unresolved setup.');
assert(homeScreenSource.includes('onStartNavigation={handleStartPreviewNavigation}'), 'Home must wire Start Navigation into LocationSheet.');
assert(locationSheetSource.includes("t('directions.cancelRoute'"), 'LocationSheet routePreview mode must expose Cancel Route button when preview exists.');
assert(locationSheetSource.includes("t('directions.startNavigation'"), 'LocationSheet routePreview mode must expose Start Navigation button when preview exists.');
assert(locationSheetSource.includes("t('directions.changeFrom'"), 'LocationSheet routePreview mode must expose a tappable start row when preview exists.');
assert(homeScreenSource.includes('BackHandler.addEventListener'), 'Android back on Home must still work.');

console.log('Home buttons v2 checks passed.');
