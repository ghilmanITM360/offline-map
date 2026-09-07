import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// Phase D removed the in-sheet "Change destination" inline search this test used to cover
// (the "duplicate map destination search" — a second SearchService.search path living inside
// RoutePreviewSection, redundant with the one Locations Directory already owns). Changing
// destination now means leaving Route Preview via Back and picking again from Locations
// Directory — Phase F's canonical Back to Locations, refined for the directory-originated case
// by "fix: return to Locations Directory from a directory-originated Route Preview".
const locationSheet = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(
  !locationSheet.includes('onChangeDestination') && !locationSheet.includes('showDestinationOptions'),
  'LocationSheet must not reintroduce the removed in-sheet destination search (Phase D).',
);
assert(
  !homeScreen.includes('handleChangeDestination'),
  'HomeScreen must not reintroduce the removed in-sheet destination-change handler (Phase D).',
);
assert(
  homeScreen.includes('directionsFromDirectoryRef'),
  'HomeScreen must track directory-originated Route Preview sessions so Back returns to Locations Directory, not a flashed place-preview card.',
);

console.log('Change Destination v2 checks passed.');
