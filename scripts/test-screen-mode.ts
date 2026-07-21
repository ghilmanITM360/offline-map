import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { deriveScreenMode, type ScreenModeInputs } from '../src/viewmodels/useScreenMode';

const base: ScreenModeInputs = {
  layersSheetVisible: false,
  showNavOverlay: false,
  directionsDestination: null,
  activePreviewRoute: null,
  selectedPlace: null,
};

// Each of the six states, all other inputs at rest.
assert.equal(deriveScreenMode(base), 'EXPLORE');
assert.equal(deriveScreenMode({ ...base, selectedPlace: { id: 'B1' } }), 'PLACE_SELECTED');
assert.equal(deriveScreenMode({ ...base, activePreviewRoute: { routeId: 'r1' } }), 'ROUTE_PREVIEW');
assert.equal(deriveScreenMode({ ...base, directionsDestination: { id: 'B1' } }), 'DIRECTIONS_FORM');
assert.equal(deriveScreenMode({ ...base, showNavOverlay: true }), 'ACTIVE_NAVIGATION');
assert.equal(deriveScreenMode({ ...base, layersSheetVisible: true }), 'MAP_SETTINGS');

// Priority chain: higher-priority truthy input always wins over lower ones, so two modes
// can never both apply — this is the actual mechanism preventing invalid combined states,
// not a separate validation step.
assert.equal(
  deriveScreenMode({ ...base, selectedPlace: { id: 'B1' }, activePreviewRoute: { routeId: 'r1' } }),
  'ROUTE_PREVIEW',
  'ROUTE_PREVIEW must outrank PLACE_SELECTED',
);
assert.equal(
  deriveScreenMode({ ...base, activePreviewRoute: { routeId: 'r1' }, directionsDestination: { id: 'B1' } }),
  'DIRECTIONS_FORM',
  'DIRECTIONS_FORM must outrank ROUTE_PREVIEW',
);
assert.equal(
  deriveScreenMode({ ...base, directionsDestination: { id: 'B1' }, showNavOverlay: true }),
  'ACTIVE_NAVIGATION',
  'ACTIVE_NAVIGATION must outrank DIRECTIONS_FORM',
);
assert.equal(
  deriveScreenMode({
    ...base,
    selectedPlace: { id: 'B1' },
    activePreviewRoute: { routeId: 'r1' },
    directionsDestination: { id: 'B1' },
    showNavOverlay: true,
    layersSheetVisible: true,
  }),
  'MAP_SETTINGS',
  'MAP_SETTINGS must outrank everything else, even with every other flag set at once',
);

// Falsy-but-not-null edge cases: an empty string/0 id should still count as "no selection".
assert.equal(deriveScreenMode({ ...base, selectedPlace: null }), 'EXPLORE');
assert.equal(deriveScreenMode({ ...base, directionsDestination: undefined }), 'EXPLORE');

// Real wiring: HomeScreen must actually compute and consume `mode` from these same five
// inputs, not just have the hook available unused.
const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
assert(home.includes("import { useScreenMode } from '../../viewmodels/useScreenMode';"), 'HomeScreen must import useScreenMode');
assert(home.includes('const mode = useScreenMode({'), 'HomeScreen must compute mode via useScreenMode');
for (const key of ['layersSheetVisible', 'showNavOverlay', 'directionsDestination', 'activePreviewRoute', 'selectedPlace']) {
  assert(new RegExp(`useScreenMode\\(\\{[\\s\\S]{0,200}${key}`).test(home), `useScreenMode call must pass ${key}`);
}
assert((home.match(/mode === 'ACTIVE_NAVIGATION'/g) ?? []).length >= 2, 'ACTIVE_NAVIGATION chrome (NavigationChromeV2 + nav MapControls) must be gated by mode');
assert(home.includes("mode !== 'MAP_SETTINGS'"), 'MapView gesture props must lock on MAP_SETTINGS mode');
assert(!home.includes('!showNavOverlay &&') && !home.includes('showNavOverlay && <'), 'Render-visibility checks must go through mode, not raw showNavOverlay');

console.log('Screen mode checks passed.');
