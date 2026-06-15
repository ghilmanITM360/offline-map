import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(homeScreenSource.includes('DrawerActions.openDrawer()'), 'Home menu button must open drawer.');
assert(homeScreenSource.includes('handleCategoryPress'), 'Home category chips must stay wired.');
assert(homeScreenSource.includes('mapFilter: activeCategory'), 'Home category chips must change map filter, not only search results.');
assert(homeScreenSource.includes("logHomeControl('category_chip', `filter_${cat.id}`)"), 'Home category chip taps must stay instrumented.');
assert(homeScreenSource.includes('handleRecenter'), 'Home current-location button must stay wired.');
assert(homeScreenSource.includes('handleZoomIn'), 'Home zoom-in button must stay wired.');
assert(homeScreenSource.includes('handleZoomOut'), 'Home zoom-out button must stay wired.');
assert(homeScreenSource.includes('handleCompassReset'), 'Home compass button must stay wired.');
assert(homeScreenSource.includes('openLayerOptions'), 'Home layer button must stay wired.');
assert(homeScreenSource.includes('Directions'), 'Home selected-place action must still open Directions.');
assert(homeScreenSource.includes('Clear Route'), 'Home must expose Clear Route button when preview exists.');
assert(homeScreenSource.includes('Start Navigation'), 'Home must expose Start Navigation button when preview exists.');
assert(homeScreenSource.includes('Change Start'), 'Home must expose Change Start button when preview exists.');
assert(homeScreenSource.includes('BackHandler.addEventListener'), 'Android back on Home must still work.');
assert(homeScreenSource.includes('Keyboard.dismiss'), 'Home search keyboard flow must stay controlled.');

console.log('Home buttons v2 checks passed.');
