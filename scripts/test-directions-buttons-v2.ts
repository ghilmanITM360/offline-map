import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const directionsScreenSource = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const directionsViewModelSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

// Phase C/D simplified Route Preview to plain destination/start summaries and removed the
// old in-sheet manual-start question and in-sheet destination search (the "duplicate map
// destination search") — changing either now means going back to Locations Directory (Phase F's
// canonical Back to Locations), not picking inline. See LocationSheet.test.tsx and
// scripts/test-map-controls-v2.ts (Phase D) for the corresponding removal coverage.
assert(directionsScreenSource.includes('Get Directions'), 'Directions header must say Get Directions.');
assert(directionsScreenSource.includes('Going to'), 'Directions screen must show destination card title.');
assert(directionsScreenSource.includes('Starting from'), 'Directions screen must show resolved-start card title.');
assert(
  !directionsScreenSource.includes('Where are you starting from?'),
  'Directions screen must not reintroduce the removed manual start question.',
);
assert(
  !directionsScreenSource.includes('Use my current location') && !directionsScreenSource.includes('Use last known location'),
  'Directions screen must not reintroduce the removed manual start-source CTAs — start is auto-resolved.',
);
assert(
  !directionsScreenSource.includes('onChangeDestination'),
  'Directions screen must not reintroduce the removed in-sheet destination search.',
);
assert(directionsScreenSource.includes('Finding route'), 'Directions screen must show provider-neutral calculating status copy.');
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
// docs/ROUTING_NAVIGATION_FIX_REPORT.md Phase 4. It no longer pushes a
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
