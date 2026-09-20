import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { deriveMapMode, type MapModeInputs } from '../src/viewmodels/useMapMode';

const base: MapModeInputs = {
  arrived: false,
  showNavOverlay: false,
  detailsExpanded: false,
  directionsDestination: null,
  activePreviewRoute: null,
  selectedPlace: null,
};

// Each of the six states, all other inputs at rest.
assert.equal(deriveMapMode(base), 'EXPLORE');
assert.equal(deriveMapMode({ ...base, selectedPlace: { id: 'B1' } }), 'PLACE_SELECTED');
assert.equal(deriveMapMode({ ...base, activePreviewRoute: { routeId: 'r1' } }), 'ROUTE_PREVIEW');
assert.equal(deriveMapMode({ ...base, directionsDestination: { id: 'B1' } }), 'ROUTE_PREVIEW');
assert.equal(deriveMapMode({ ...base, detailsExpanded: true }), 'DETAILS');
assert.equal(deriveMapMode({ ...base, showNavOverlay: true }), 'NAVIGATION');
assert.equal(deriveMapMode({ ...base, arrived: true }), 'ARRIVAL');

// Priority chain: higher-priority truthy input always wins over lower ones, so two modes
// can never both apply — this is the actual mechanism preventing invalid combined states,
// not a separate validation step.
assert.equal(
  deriveMapMode({ ...base, selectedPlace: { id: 'B1' }, activePreviewRoute: { routeId: 'r1' } }),
  'ROUTE_PREVIEW',
  'ROUTE_PREVIEW must outrank PLACE_SELECTED',
);
assert.equal(
  deriveMapMode({ ...base, activePreviewRoute: { routeId: 'r1' }, detailsExpanded: true }),
  'DETAILS',
  'DETAILS must outrank ROUTE_PREVIEW',
);
assert.equal(
  deriveMapMode({ ...base, detailsExpanded: true, showNavOverlay: true }),
  'NAVIGATION',
  'NAVIGATION must outrank DETAILS — no browsing details mid-turn-by-turn',
);
assert.equal(
  deriveMapMode({
    ...base,
    selectedPlace: { id: 'B1' },
    activePreviewRoute: { routeId: 'r1' },
    directionsDestination: { id: 'B1' },
    detailsExpanded: true,
    showNavOverlay: true,
    arrived: true,
  }),
  'ARRIVAL',
  'ARRIVAL must outrank everything else, even with every other flag set at once',
);

// Phase 7 named transitions (Start button / arrival detection / exit) — see
// src/__tests__/useMapMode.test.ts for the same three cases as Jest specs.
assert.equal(deriveMapMode({ ...base, activePreviewRoute: { routeId: 'r1' } }), 'ROUTE_PREVIEW', 'Start button: before press, mode is ROUTE_PREVIEW');
assert.equal(deriveMapMode({ ...base, showNavOverlay: true }), 'NAVIGATION', 'Start button: after press, mode is NAVIGATION');
assert.equal(deriveMapMode({ ...base, showNavOverlay: true, arrived: true }), 'ARRIVAL', 'Arrival detection: NAVIGATION -> ARRIVAL');
assert.equal(deriveMapMode({ ...base, showNavOverlay: false, arrived: false }), 'EXPLORE', 'Exit navigation: returns to EXPLORE');

// Falsy-but-not-null edge cases: an empty string/0 id should still count as "no selection".
assert.equal(deriveMapMode({ ...base, selectedPlace: null }), 'EXPLORE');
assert.equal(deriveMapMode({ ...base, directionsDestination: undefined }), 'EXPLORE');

// Real wiring: HomeScreen must actually compute and consume `mode` from these same six
// inputs, not just have the hook available unused.
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
assert(home.includes("import { useMapMode } from '../../viewmodels/useMapMode';"), 'HomeScreen must import useMapMode');
assert(home.includes('const mode = useMapMode({'), 'HomeScreen must compute mode via useMapMode');
for (const key of ['arrived', 'showNavOverlay', 'detailsExpanded', 'directionsDestination', 'activePreviewRoute', 'selectedPlace']) {
  assert(new RegExp(`useMapMode\\(\\{[\\s\\S]{0,220}${key}`).test(home), `useMapMode call must pass ${key}`);
}
assert((home.match(/mode === 'NAVIGATION'/g) ?? []).length >= 2, 'NAVIGATION chrome (NavigationChromeV2 + nav MapControls) must be gated by mode');

// Phase 7: `arrived` must be the real GPS-arrival signal from the nav overlays, not a
// separate flag nobody ever sets — regression guard for the dead `arrive()`/setArrived(true)
// state that used to make MapMode.ARRIVAL unreachable in practice.
assert(
  home.includes('const arrived = navOverlay.arrived || navOverlayV1.arrived;'),
  'HomeScreen must derive `arrived` from the real nav-overlay arrival signal, not local dead state',
);
assert(!home.includes('const [arrived, setArrived] = useState'), 'HomeScreen must not own a separate, never-set local `arrived` flag');
assert(home.includes('!layersSheetVisible'), 'MapView gesture props must lock on layersSheetVisible (MAP_SETTINGS is not part of MapMode)');
assert(!home.includes('!showNavOverlay &&') && !home.includes('showNavOverlay && <'), 'Render-visibility checks must go through mode, not raw showNavOverlay');

// Regression guard: Home's own search UI (and MapMode.SEARCH) was removed once
// LocationsDirectoryScreen became the one canonical destination discovery surface —
// isSearchFocused/SEARCH must not quietly come back into either module.
assert(!home.includes('isSearchFocused'), 'HomeScreen must not reintroduce isSearchFocused — Directory owns search now');
assert(!home.includes("'SEARCH'"), "HomeScreen must not reintroduce MapMode.SEARCH");
const mapModeSource = readFileSync('src/viewmodels/useMapMode.ts', 'utf8');
assert(!mapModeSource.includes('SEARCH'), 'useMapMode must not reintroduce the SEARCH mode');

console.log('Map mode checks passed.');
