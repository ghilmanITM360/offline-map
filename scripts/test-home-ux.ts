import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const searchService = readFileSync('src/services/SearchService.ts', 'utf8');

assert(!home.includes('Select Start'), 'Home screen should not show Select Start route planner control');
assert(!home.includes('Select Destination'), 'Home screen should not show Select Destination route planner control');
assert(!home.includes('Preview Route'), 'Home screen should use Directions label instead of Preview Route');
assert(!home.includes('Use GPS'), 'Home screen should not show old Use GPS label');
assert(home.includes('Directions'), 'Home screen should expose Directions CTA');
assert(home.includes('Map Layers'), 'Home screen should include map layer chooser');
assert(home.includes('__DEV__ && developerModeEnabled'), 'Developer controls must be gated behind __DEV__ and developer mode');
assert(home.includes('Offline map not downloaded.'), 'Home screen should show offline-not-downloaded state');
assert(home.includes('categoryChips'), 'Home categories should be data-driven, not hardcoded two chips');
assert(searchService.includes("{ id: 'gates', label: 'Gates' }"), 'Search categories should include Gates');
assert(searchService.includes("{ id: 'masjids', label: 'Masjids' }"), 'Search categories should include Masjids');
assert(searchService.includes("{ id: 'terminals', label: 'Terminals' }"), 'Search categories should include Terminals');
assert(searchService.includes("{ id: 'help', label: 'Help' }"), 'Search categories should include Help');

console.log('Home UX flow checks passed.');
