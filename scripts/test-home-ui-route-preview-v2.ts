import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';
import { MAP_LINE_WIDTH } from '../src/views/components/mapgl/mapDesign';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeVm = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const overlaySpec = readFileSync('src/views/components/mapgl/overlaySpec.ts', 'utf8');

assert(!homeVm.includes('masjids...'), 'Search placeholder must not show ellipsis dots under text.');
assert(!homeVm.includes('places...'), 'Fallback search placeholder must not show ellipsis dots under text.');
assert(
  home.includes('const showOutsideBanner =') && home.includes('!activePreviewRoute;'),
  'Outside banner must hide during route preview.',
);
// The route is drawn by the MapLibre overlay builders (overlaySpec.buildRouteOverlay), which Home feeds from the preview.
assert(
  home.includes('buildRouteOverlay(') &&
    /'line-color': staticColors\.routeCasing, 'line-width': MAP_LINE_WIDTH\.activeRouteCasing/.test(overlaySpec) &&
    MAP_LINE_WIDTH.activeRouteCasing === 11 &&
    staticColors.routeCasing === 'rgba(255,255,255,0.95)',
  'Route preview line must have high-contrast white outline.',
);
assert(
  /'line-color': staticColors\.routeInside, 'line-width': MAP_LINE_WIDTH\.activeRoute\b/.test(overlaySpec) &&
    MAP_LINE_WIDTH.activeRoute === 7 &&
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
