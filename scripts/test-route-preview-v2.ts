import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';

const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const homeViewModelSource = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const storeSource = readFileSync('src/store/useAppStore.ts', 'utf8');
const directionsScreenSource = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');

assert(
  homeScreenSource.includes('activeRoute'),
  'Home screen must read active preview route state.',
);
assert(
  homeScreenSource.includes('routePlannerDest'),
  'Home screen must read preview destination state.',
);
assert(
  homeScreenSource.includes('buildRouteOverlay(') && staticColors.routeInside === '#1A73E8',
  'Home screen must render blue route preview line.',
);
// P0-2 (Google Maps routing parity fix): route preview is a single surface — LocationSheet's
// routePreview mode — not a separate HomeScreen floating card, so this content now lives in
// LocationSheet.tsx (see scripts/test-map-controls-v2.ts for the corresponding HomeScreen-side
// checks that the old floating card/its styles are gone).
assert(
  directionsScreenSource.includes('Start Navigation'),
  'LocationSheet routePreview mode must expose Start Navigation.',
);
assert(
  directionsScreenSource.includes('Cancel Route'),
  'LocationSheet routePreview mode must expose Cancel Route action (confirm-gated destructive action, via onCancelRoute).',
);
assert(
  directionsScreenSource.includes('Change start.'),
  'LocationSheet routePreview mode must expose the tappable start row.',
);
assert(
  directionsScreenSource.includes('Go in through'),
  'LocationSheet routePreview mode must explain entry gate.',
);
assert(
  directionsScreenSource.includes('Outside Ijtema'),
  'LocationSheet routePreview mode must explain outside-user route mode.',
);
assert(
  homeScreenSource.includes('routePreviewSheetDestination'),
  'Home screen must resolve a single routePreviewSheetDestination feeding the one LocationSheet routePreview render.',
);
assert(
  !homeScreenSource.includes('styles.routePreviewCard'),
  'Home screen must not render a separate floating route-preview card anymore.',
);
assert(
  storeSource.includes('routePlannerOrigin') && storeSource.includes('routePlannerDest'),
  'Store must keep route planner start and destination state.',
);
assert(
  homeViewModelSource.includes('setSelectedPlace'),
  'Home viewmodel must still drive destination selection from preview state.',
);

console.log('Route preview v2 checks passed.');
