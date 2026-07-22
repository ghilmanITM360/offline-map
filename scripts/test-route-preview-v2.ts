import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

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
  homeScreenSource.includes('strokeColor="#1A73E8"'),
  'Home screen must render blue route preview line.',
);
assert(
  homeScreenSource.includes('Start Navigation'),
  'Home screen must expose Start Navigation from route preview card.',
);
assert(
  homeScreenSource.includes('Cancel Route'),
  'Home screen must expose Cancel Route action (demoted, confirm-gated destructive action).',
);
assert(
  homeScreenSource.includes('Change Start'),
  'Home screen must expose Change Start action.',
);
assert(
  homeScreenSource.includes('Enter through'),
  'Home route card must explain entry gate.',
);
assert(
  homeScreenSource.includes('Outside Ijtema'),
  'Home route card must explain outside-user route mode.',
);
assert(
  homeScreenSource.includes('routePreviewCard'),
  'Home screen must render compact route preview card styles.',
);
assert(
  directionsScreenSource.includes('Show route on map'),
  'Directions screen must return user to Home preview with Show route on map CTA.',
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
