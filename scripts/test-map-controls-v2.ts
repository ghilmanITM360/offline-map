import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Phase 7 (task #34): the Compass+Zoom(+Layers) button cluster was hand-rolled twice
// (HomeScreen's browse-mode `rightControls` and nav-mode `navControls`), and the top-right
// controls' vertical position was a chain of hardcoded per-banner height guesses (42/56/60)
// that could drift out of sync with real rendered content (text wrapping, font scaling).

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const mapControls = readFileSync('src/views/components/map/MapControls.tsx', 'utf8');
const mapControlStyles = readFileSync('src/views/components/map/mapControlStyles.ts', 'utf8');

// Shared component, not two independent copies.
assert(mapControls.includes('export function MapControls'), 'MapControls component must exist and be exported');
assert(mapControls.includes("variant: 'browse' | 'nav'"), 'MapControls must accept a browse/nav variant');
assert(mapControls.includes("variant === 'browse'"), "MapControls must gate the Layers button + north-up badge to browse mode");
assert((home.match(/<MapControls/g) ?? []).length === 2, 'HomeScreen must render MapControls exactly twice: browse and nav-overlay');
// Browse/nav/recenter visibility is exercised by MapControls.test.tsx and HomeScreen.test.tsx.

// The old duplicated inline button styles must be gone from HomeScreen — they now live in mapControlStyles.ts.
for (const deadStyleKey of ['controlButton: {', 'controlButtonActive: {', 'controlHelperBadge: {', 'controlHelperText: {', 'zoomControls: {', 'zoomButton: {', 'zoomDivider: {']) {
  assert(!home.includes(deadStyleKey), `HomeScreen must not redefine ${deadStyleKey.replace(': {', '')} locally anymore — it moved to mapControlStyles.ts`);
}
for (const styleKey of ['controlButton:', 'controlButtonActive:', 'controlHelperBadge:', 'controlHelperText:', 'zoomControls:', 'zoomButton:', 'zoomDivider:']) {
  assert(mapControlStyles.includes(styleKey), `mapControlStyles.ts must define ${styleKey.replace(':', '')}`);
}

// Real layout: the banner stack's own top offset derives from the measured search+chip
// overlay height, not a chain of hardcoded per-banner guesses.
assert(home.includes('onLayout={(e) => setTopOverlayHeight(e.nativeEvent.layout.height)}'), 'Top overlay height must be measured via onLayout');
assert(home.includes('topOverlayHeight > 0 ? topOverlayHeight + 8'), 'bannerStackTop must derive from the measured top-overlay height');
for (const deadOffsetGuess of ['isOffline ? 42', 'showMapWarningBanner ? 56', 'showOutsideBanner ? 60']) {
  assert(!home.includes(deadOffsetGuess), `Hardcoded banner-height guess "${deadOffsetGuess}" must be gone`);
}

// Real layout: the whole Layers/Compass/Zoom/Recenter cluster is a single bottom-anchored
// stack (see MapControls' recenter prop) instead of a top-anchored compass/zoom group plus
// an independently bottom-anchored recenter button — that old split is exactly what let a
// route-preview card push the recenter button into the zoom controls (neither side's offset
// accounted for the other's extent). A single shared bottom value can't collide with itself.
assert((home.match(/<View style=\{\[styles\.controlStack, \{ bottom: controlStackBottom \}\]\}>/g) ?? []).length >= 1, 'HomeScreen must position the control stack via a single controlStackBottom value');
assert(home.includes('recenter={'), 'HomeScreen must pass the recenter button into MapControls\' single stack, not render it separately');

// P0-2 (Google Maps routing parity fix): route preview is a single surface living inside
// LocationSheet's routePreview mode — there is no separate floating route-preview card, so
// recenter clearance only ever has to clear the BottomSheetModal itself. controlStackBottom
// is built via the shared computeMapControlsInset calculation (see src/viewmodels/useOverlayInsets.ts /
// scripts/test-overlay-insets.ts) using the sheet's real snap-point extent, not a measured card height.
assert(!home.includes('routePreviewCardMeasuredHeight'), 'The floating route-preview card and its measured-height state must be gone (see LocationSheet routePreview mode)');
assert(!home.includes("{ kind: 'measured'"), 'controlStackOverlay must not fall back to a measured floating-card extent anymore — the sheet is the only overlay kind now');
assert(
  home.includes("const controlStackOverlay: OverlayState = { kind: 'sheet', windowHeight, snapPoints, sheetIndex };"),
  'controlStackOverlay must always resolve to the sheet kind now that route preview lives inside the BottomSheetModal',
);
assert(
  home.includes('const controlStackBottom = computeMapControlsInset('),
  'controlStackBottom must be computed via the shared computeMapControlsInset calculation',
);
assert(!home.includes('activePreviewRoute ? 184 : 0'), 'Hardcoded route-preview-card height guess (184) must be gone');
assert(!home.includes('styles.routePreviewCard'), 'The floating routePreviewCard JSX/styles must be removed — route preview renders via LocationSheet mode="routePreview" inside the single BottomSheetModal');
assert(
  home.includes('routePreviewSheetDestination'),
  'HomeScreen must resolve a single routePreviewSheetDestination (directionsDestination ?? previewDestination) feeding one LocationSheet routePreview render',
);

console.log('Map controls v2 checks passed.');
