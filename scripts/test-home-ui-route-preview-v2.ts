import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeVm = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');

assert(!homeVm.includes('masjids...'), 'Search placeholder must not show ellipsis dots under text.');
assert(!homeVm.includes('places...'), 'Fallback search placeholder must not show ellipsis dots under text.');
assert(
  // Reads mode === 'SEARCH', not the raw isSearchFocused flag — see scripts/test-map-mode.ts
  // for why every render/behavior gate must go through mode instead of the raw input.
  home.includes("!activePreviewRoute && mode !== 'SEARCH'") && home.includes('showOutsideBanner'),
  'Outside banner must hide during route preview and search.',
);
assert(
  home.includes('strokeColor={staticColors.routeCasing}') &&
    home.includes('strokeWidth={11}') &&
    staticColors.routeCasing === 'rgba(255,255,255,0.95)',
  'Route preview line must have high-contrast white outline.',
);
assert(
  home.includes('strokeColor={staticColors.routeInside}') &&
    home.includes('strokeWidth={7}') &&
    staticColors.routeInside === '#1A73E8',
  'Route preview line must use thicker visible blue inner stroke.',
);
// P0-2: route preview is a single surface inside LocationSheet's routePreview mode (see
// scripts/test-map-controls-v2.ts) — map controls reserve bottom space for the BottomSheetModal
// itself, not a separate floating route-preview card.
assert(
  home.includes('controlStackBottom') && home.includes("const controlStackOverlay: OverlayState = { kind: 'sheet',"),
  'Map controls must reserve bottom space for the route-preview sheet.',
);

console.log('Home UI route preview v2 checks passed.');
