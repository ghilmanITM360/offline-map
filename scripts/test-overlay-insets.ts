import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  computeMapControlsInset,
  computeMapContentInsets,
  computeNavControlsInset,
  computeNavRecenterInset,
  MIN_BOTTOM_FLOOR,
  NAV_BAR_FALLBACK_HEIGHT,
  OVERLAY_CONTROL_GAP,
  RECENTER_BUTTON_SIZE,
  resolveNavBarHeight,
  resolveOverlayExtent,
  stackAbove,
} from '../src/viewmodels/useOverlayInsets';

const windowHeight = 800;
const snapPoints = ['15%', '50%', '92%'];

// Overlay-state coverage: LocationSheet preview, LocationSheet details, route preview
// card, and "nothing open" (EXPLORE) — the states named in the audit.
assert.equal(resolveOverlayExtent({ kind: 'none' }), 0, 'EXPLORE: no overlay extent');
assert.equal(
  resolveOverlayExtent({ kind: 'sheet', windowHeight, snapPoints, sheetIndex: 1 }),
  400,
  'LocationSheet preview (50% snap) must resolve against window height',
);
assert.equal(
  resolveOverlayExtent({ kind: 'sheet', windowHeight, snapPoints, sheetIndex: 2 }),
  736,
  'LocationSheet details (92% snap) must resolve against window height',
);
assert.equal(
  resolveOverlayExtent({ kind: 'sheet', windowHeight, snapPoints, sheetIndex: -1 }),
  0,
  'A closed sheet (-1) must not push controls up',
);
assert.equal(
  resolveOverlayExtent({ kind: 'measured', height: 184 }),
  184,
  'Route preview card uses its own measured height',
);

// Never-overlap contract: whatever the overlay, the inset returned always clears the
// overlay's own extent by at least the gap.
for (const overlay of [
  { kind: 'none' as const },
  { kind: 'measured' as const, height: 184 },
  { kind: 'sheet' as const, windowHeight, snapPoints, sheetIndex: 0 },
  { kind: 'sheet' as const, windowHeight, snapPoints, sheetIndex: 1 },
  { kind: 'sheet' as const, windowHeight, snapPoints, sheetIndex: 2 },
]) {
  const inset = computeMapControlsInset(0, overlay);
  assert(
    inset >= resolveOverlayExtent(overlay) + OVERLAY_CONTROL_GAP,
    `computeMapControlsInset must clear overlay ${JSON.stringify(overlay)} by at least the gap`,
  );
}
assert(
  computeMapControlsInset(0, { kind: 'sheet', windowHeight, snapPoints, sheetIndex: 2 }) >
    computeMapControlsInset(0, { kind: 'sheet', windowHeight, snapPoints, sheetIndex: 1 }),
  'LocationSheet details (92%) must push controls higher than preview (50%)',
);

// Navigation mode: trip bar -> recenter -> compass/zoom, single shared calculation.
assert.equal(resolveNavBarHeight(210, 34), 210, 'Measured trip-bar height wins once available');
assert.equal(
  resolveNavBarHeight(0, 34),
  34 + NAV_BAR_FALLBACK_HEIGHT,
  'Pre-layout fallback uses the floor + named fallback height, not a bare literal',
);
const navBarHeight = 210;
const recenterBottom = computeNavRecenterInset(navBarHeight);
const navControlsBottom = computeNavControlsInset(navBarHeight);
assert.equal(recenterBottom, navBarHeight + OVERLAY_CONTROL_GAP);
assert.equal(navControlsBottom, recenterBottom + RECENTER_BUTTON_SIZE + OVERLAY_CONTROL_GAP);
assert(navControlsBottom > recenterBottom + RECENTER_BUTTON_SIZE, 'compass/zoom stack must never touch the recenter button');

assert.equal(stackAbove(10, 20, 5), 35);
assert.equal(stackAbove(10, 20), 10 + 20 + OVERLAY_CONTROL_GAP, 'stackAbove defaults to the shared gap');
assert.equal(MIN_BOTTOM_FLOOR, 16);
assert.equal(RECENTER_BUTTON_SIZE, 56, 'must match mapControlStyles.recenterButton width/height');

const mapContentBase = {
  top: 144,
  right: 80,
  bottomSafeArea: 24,
  windowHeight,
  snapPoints,
  sheetIndex: -1,
  navBarHeight: 0,
  navTopHeight: 0,
} as const;
assert.equal(computeMapContentInsets({ ...mapContentBase, mode: 'EXPLORE' }).bottom, 24);
assert.equal(computeMapContentInsets({ ...mapContentBase, mode: 'PLACE_SELECTED', sheetIndex: 0 }).bottom, 120);
assert.equal(computeMapContentInsets({ ...mapContentBase, mode: 'DETAILS', sheetIndex: 2 }).bottom, 736);
assert.equal(computeMapContentInsets({ ...mapContentBase, mode: 'ROUTE_PREVIEW', sheetIndex: 1 }).bottom, 400);
assert.equal(computeMapContentInsets({ ...mapContentBase, mode: 'NAVIGATION', navBarHeight: 196 }).bottom, 196);
assert.equal(computeMapContentInsets({ ...mapContentBase, mode: 'ARRIVAL' }).bottom, windowHeight);

// Regression: NAVIGATION mode must bound labels by the measured top nav banner stack
// (navTopHeight), not by the stale EXPLORE-mode search-bar height in `top` — the bug
// that let the "map tiles unavailable" banner overlap gate labels during navigation.
assert.equal(
  computeMapContentInsets({ ...mapContentBase, mode: 'NAVIGATION', navTopHeight: 320 }).top,
  320 + OVERLAY_CONTROL_GAP,
  'NAVIGATION mode must use the measured nav-chrome top height, not the EXPLORE-mode top',
);
assert.equal(
  computeMapContentInsets({ ...mapContentBase, mode: 'NAVIGATION', navTopHeight: 0 }).top,
  mapContentBase.top,
  'Before the nav chrome has reported a layout (navTopHeight 0), fall back to the existing top rather than 0',
);
assert.equal(
  computeMapContentInsets({ ...mapContentBase, mode: 'EXPLORE' }).top,
  mapContentBase.top,
  'Non-navigation modes are unaffected by navTopHeight',
);

// Wiring: the real call sites must use the shared calculation, not a reintroduced
// inline formula. Each of these previously hand-rolled its own bottom-offset math with
// its own copy of the 140/56/12 magic numbers.
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
assert(
  homeScreen.includes("from '../../viewmodels/useOverlayInsets'"),
  'HomeScreen must import the shared overlay-inset calculation',
);
assert(
  homeScreen.includes('const controlStackBottom = computeMapControlsInset('),
  'HomeScreen controlStack must derive its bottom offset from computeMapControlsInset',
);
assert(
  homeScreen.includes('bottom: computeNavControlsInset(resolveNavBarHeight(navOverlay.bottomBarHeight, insets.bottom))'),
  'HomeScreen navControls must derive its bottom offset from computeNavControlsInset',
);
assert(
  !/Math\.max\(insets\.bottom, 1[26]\) \+ 140/.test(homeScreen),
  'HomeScreen must not reintroduce the old inline 140px trip-bar fallback',
);
assert(
  homeScreen.includes('navTopHeight: activeNavTopHeight'),
  'HomeScreen mapLabelEdgeInsets must pass the measured nav-chrome top height so labels never render under it',
);

const chromeV1 = readFileSync('src/views/components/navigation/NavigationChromeV1.tsx', 'utf8');
const chromeV2 = readFileSync('src/views/components/navigation/NavigationChromeV2.tsx', 'utf8');
for (const [name, source] of [['NavigationChromeV1', chromeV1], ['NavigationChromeV2', chromeV2]] as const) {
  assert(source.includes("from '../../../viewmodels/useOverlayInsets'"), `${name} must import the shared overlay-inset calculation`);
  assert(
    source.includes('bottom: computeNavRecenterInset(resolveNavBarHeight(bottomBarHeight, insets.bottom))'),
    `${name} recenter button must derive its bottom offset from computeNavRecenterInset`,
  );
  assert(!source.includes('+ 140) + 12'), `${name} must not reintroduce the old inline recenter formula`);
  assert(
    source.includes('onLayout={(e) => setTopCardHeight(e.nativeEvent.layout.height)}'),
    `${name} must measure its top instruction+banner stack height via setTopCardHeight`,
  );
}

console.log('Overlay inset checks passed.');
