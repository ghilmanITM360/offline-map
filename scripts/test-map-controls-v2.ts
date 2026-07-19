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
assert(home.includes('variant="browse"') && home.includes('variant="nav"'), 'HomeScreen must pass both variants to MapControls');

// The old duplicated inline button styles must be gone from HomeScreen — they now live in mapControlStyles.ts.
for (const deadStyleKey of ['controlButton: {', 'controlButtonActive: {', 'controlHelperBadge: {', 'controlHelperText: {', 'zoomControls: {', 'zoomButton: {', 'zoomDivider: {']) {
  assert(!home.includes(deadStyleKey), `HomeScreen must not redefine ${deadStyleKey.replace(': {', '')} locally anymore — it moved to mapControlStyles.ts`);
}
for (const styleKey of ['controlButton:', 'controlButtonActive:', 'controlHelperBadge:', 'controlHelperText:', 'zoomControls:', 'zoomButton:', 'zoomDivider:']) {
  assert(mapControlStyles.includes(styleKey), `mapControlStyles.ts must define ${styleKey.replace(':', '')}`);
}

// Real layout: top-right controls position derives from a measured banner-stack height,
// not a chain of hardcoded per-banner guesses.
assert(home.includes('onLayout={(e) => setBannerStackHeight(e.nativeEvent.layout.height)}'), 'Banner stack height must be measured via onLayout');
assert(home.includes('bannerStackTop + bannerStackHeight'), 'rightControlsTop must derive from the measured banner stack height');
for (const deadOffsetGuess of ['isOffline ? 42', 'showMapWarningBanner ? 56', 'showOutsideBanner ? 60']) {
  assert(!home.includes(deadOffsetGuess), `Hardcoded banner-height guess "${deadOffsetGuess}" must be gone`);
}

// Real layout: recenter button clearance derives from a measured route-preview-card height,
// not a hardcoded 184px guess.
assert(home.includes('onLayout={(e) => setRoutePreviewCardMeasuredHeight(e.nativeEvent.layout.height)}'), 'Route preview card height must be measured via onLayout');
assert(home.includes('routePreviewCardMeasuredHeight + 16'), 'rightControlsBottom must derive from the measured route-preview-card height');
assert(!home.includes('activePreviewRoute ? 184 : 0'), 'Hardcoded route-preview-card height guess (184) must be gone');

console.log('Map controls v2 checks passed.');
