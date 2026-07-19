import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeVm = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');

assert(!homeVm.includes('masjids...'), 'Search placeholder must not show ellipsis dots under text.');
assert(!homeVm.includes('places...'), 'Fallback search placeholder must not show ellipsis dots under text.');
assert(
  home.includes('!activePreviewRoute && !isSearchFocused') && home.includes('showOutsideBanner'),
  'Outside banner must hide during route preview and search.',
);
assert(
  home.includes('strokeColor="rgba(255,255,255,0.95)"') && home.includes('strokeWidth={11}'),
  'Route preview line must have high-contrast white outline.',
);
assert(
  home.includes('strokeColor="#1A73E8"') && home.includes('strokeWidth={6}'),
  'Route preview line must use thicker visible blue inner stroke.',
);
assert(
  home.includes('rightControlsBottom') && home.includes('routePreviewCardMeasuredHeight'),
  'Map controls must reserve bottom space for route preview card.',
);

console.log('Home UI route preview v2 checks passed.');
