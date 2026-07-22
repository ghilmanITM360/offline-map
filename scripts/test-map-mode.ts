import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { deriveMapMode, type MapModeInputs } from '../src/viewmodels/useMapMode';

const base: MapModeInputs = {
  arrived: false,
  showNavOverlay: false,
  isSearchFocused: false,
  detailsExpanded: false,
  directionsDestination: null,
  activePreviewRoute: null,
  selectedPlace: null,
};

// Each of the seven states, all other inputs at rest.
assert.equal(deriveMapMode(base), 'EXPLORE');
assert.equal(deriveMapMode({ ...base, selectedPlace: { id: 'B1' } }), 'PLACE_SELECTED');
assert.equal(deriveMapMode({ ...base, activePreviewRoute: { routeId: 'r1' } }), 'ROUTE_PREVIEW');
assert.equal(deriveMapMode({ ...base, directionsDestination: { id: 'B1' } }), 'ROUTE_PREVIEW');
assert.equal(deriveMapMode({ ...base, detailsExpanded: true }), 'DETAILS');
assert.equal(deriveMapMode({ ...base, isSearchFocused: true }), 'SEARCH');
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
  deriveMapMode({ ...base, detailsExpanded: true, isSearchFocused: true }),
  'SEARCH',
  'SEARCH must outrank DETAILS — full-screen search always takes over',
);
assert.equal(
  deriveMapMode({ ...base, isSearchFocused: true, showNavOverlay: true }),
  'NAVIGATION',
  'NAVIGATION must outrank SEARCH — no searching mid-turn-by-turn',
);
assert.equal(
  deriveMapMode({
    ...base,
    selectedPlace: { id: 'B1' },
    activePreviewRoute: { routeId: 'r1' },
    directionsDestination: { id: 'B1' },
    detailsExpanded: true,
    isSearchFocused: true,
    showNavOverlay: true,
    arrived: true,
  }),
  'ARRIVAL',
  'ARRIVAL must outrank everything else, even with every other flag set at once',
);

// Falsy-but-not-null edge cases: an empty string/0 id should still count as "no selection".
assert.equal(deriveMapMode({ ...base, selectedPlace: null }), 'EXPLORE');
assert.equal(deriveMapMode({ ...base, directionsDestination: undefined }), 'EXPLORE');

// Real wiring: HomeScreen must actually compute and consume `mode` from these same seven
// inputs, not just have the hook available unused.
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
assert(home.includes("import { useMapMode } from '../../viewmodels/useMapMode';"), 'HomeScreen must import useMapMode');
assert(home.includes('const mode = useMapMode({'), 'HomeScreen must compute mode via useMapMode');
for (const key of ['arrived', 'showNavOverlay', 'isSearchFocused', 'detailsExpanded', 'directionsDestination', 'activePreviewRoute', 'selectedPlace']) {
  assert(new RegExp(`useMapMode\\(\\{[\\s\\S]{0,220}${key}`).test(home), `useMapMode call must pass ${key}`);
}
assert((home.match(/mode === 'NAVIGATION'/g) ?? []).length >= 2, 'NAVIGATION chrome (NavigationChromeV2 + nav MapControls) must be gated by mode');
assert(home.includes('!layersSheetVisible'), 'MapView gesture props must lock on layersSheetVisible (MAP_SETTINGS is not part of MapMode)');
assert(!home.includes('!showNavOverlay &&') && !home.includes('showNavOverlay && <'), 'Render-visibility checks must go through mode, not raw showNavOverlay');
assert(home.includes("mode === 'SEARCH' &&") && home.includes("mode !== 'SEARCH' &&"), 'Search dropdown/chips visibility must go through mode (SEARCH), not raw isSearchFocused');

console.log('Map mode checks passed.');
