import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(
  home.includes('!activePreviewRoute;') && home.includes('showOutsideBanner'),
  'Outside banner must hide during route preview.',
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
