import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const directionsScreenSource = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const directionsViewModelSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(directionsScreenSource.includes('Get Directions'), 'Directions header must say Get Directions.');
assert(directionsScreenSource.includes('Change destination.'), 'Directions screen must show a tappable destination row.');
assert(directionsViewModelSource.includes("'Choose where to start'"), 'The FROM row must state the start-selection task plainly.');
// #222: every start change opens the Directory; the current-location / last-known quick options live there.
const directoryScreenSource = readFileSync('src/views/screens/LocationsDirectoryScreen.tsx', 'utf8');
assert(directionsScreenSource.includes("onOpenDirectory?.('start')"), 'Directions screen must hand every start change to the Directory.');
assert(directoryScreenSource.includes('Use my location'), 'Directory must keep the current-location start quick option.');
assert(directoryScreenSource.includes('Use earlier location'), 'Directory must keep the remembered-location quick option.');
assert(directionsScreenSource.includes('Change destination.'), 'Directions screen must let user change destination.');
assert(directionsScreenSource.includes('Finding your route'), 'Directions screen must show provider-neutral calculating status copy.');
assert(directionsScreenSource.includes('Route ready'), 'Directions screen must show success status copy.');
assert(directionsScreenSource.includes('Start Navigation'), 'Directions screen must expose a Start Navigation CTA.');
assert(
  !directionsScreenSource.includes('Last known location is outside Ijtema and cannot be used for routing.'),
  'Directions screen must stop rejecting outside remembered location.',
);
assert(
  !directionsScreenSource.includes('Could not calculate a v2 route. The selected gate or place may need connector verification.'),
  'Directions screen must stop showing generic connector-verification route error for all failures.',
);

// Regression: legacy (v1) destinations must have a working "Start Navigation"
// entry point again — previously the primary button unconditionally did
// onClose() for every destination, and handleStartNavigation didn't exist at
// all, so a v1 place could never start navigation anywhere in the app. See
// docs/OFFLINE_NAVIGATION_AND_ROUTING.md Phase 4. It no longer pushes a
// NavigationScreen either way (v1 or v2) — starting navigation always just
// reveals the map, and the in-place NavigationOverlayV1/V2 takes over from there.
assert(
  directionsScreenSource.includes('Start Navigation'),
  'Directions screen must expose a Start Navigation CTA for legacy destinations.',
);
assert(
  directionsScreenSource.includes('handleStartNavigation()'),
  'Directions screen must call handleStartNavigation for legacy destinations.',
);
assert(
  directionsScreenSource.includes('destinationFromPlace(destination)'),
  'Directions screen primary button must branch on unified V2-routing destination support.',
);
// LocationSheet doesn't depend on react-navigation at all anymore — it's rendered inline
// inside HomeScreen's bottom sheet, not as a routed screen, and starting navigation (v1 or v2)
// never needs to navigate anywhere; it just reveals the map behind the sheet.
assert(
  !directionsScreenSource.includes("from '@react-navigation/native'"),
  'Directions screen must not depend on react-navigation context directly.',
);
assert(
  !homeScreenSource.includes("nav.navigate('Navigation')"),
  'Home screen must not push a separate Navigation screen — navigation runs in-place.',
);
assert(
  directionsViewModelSource.includes('const handleStartNavigation'),
  'DirectionsViewModel must define handleStartNavigation.',
);
assert(
  directionsViewModelSource.includes('handleStartNavigation,') && directionsViewModelSource.lastIndexOf('handleStartNavigation,') > directionsViewModelSource.indexOf('const handleStartNavigation'),
  'DirectionsViewModel must return handleStartNavigation from the hook.',
);

console.log('Directions buttons v2 checks passed.');
