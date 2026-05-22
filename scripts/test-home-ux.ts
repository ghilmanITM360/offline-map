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
assert(!home.includes('Voice Search'), 'Home should hide voice-search action until it is fully implemented');
assert(home.includes('handleCompassReset'), 'Home compass control should call compass reset handler');
assert(home.includes('North-up') && home.includes('Free rotate'), 'Home should explain compass state (north-up vs free rotate)');
assert(home.includes('[HomeControl] pressed='), 'Home controls should emit dev diagnostics logs');
assert(home.includes('__DEV__ && developerModeEnabled'), 'Developer controls must be gated behind __DEV__ and developer mode');
assert(home.includes('right: 76'), 'Outside-area warning should leave room for right-side map controls');
assert(home.includes('paddingRight: 88'), 'Category chips should have trailing padding so the last chip is not hidden behind controls');
assert(home.includes('setOutsideBannerDismissed'), 'Outside-area warning should be compact and dismissible');
assert(home.includes('Offline map not downloaded.'), 'Home screen should show offline-not-downloaded state');
assert(home.includes('categoryChips'), 'Home categories should be data-driven, not hardcoded two chips');
assert(home.includes('Member Masjid Gates'), 'Block detail sheet should show Member Masjid gates');
assert(home.includes('userMarkerPulse'), 'Home should render a pulsing user marker');
assert(searchService.includes("{ id: 'gates', label: 'Gates' }"), 'Search categories should include Gates');
assert(searchService.includes("{ id: 'masjids', label: 'Masjids' }"), 'Search categories should include Masjids');
assert(searchService.includes("{ id: 'terminals', label: 'Terminals' }"), 'Search categories should include Terminals');
assert(searchService.includes("{ id: 'help', label: 'Help' }"), 'Search categories should include Help');

console.log('Home UX flow checks passed.');
