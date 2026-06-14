import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const directionsScreenSource = readFileSync('src/views/screens/DirectionsScreen.tsx', 'utf8');

assert(directionsScreenSource.includes('Get Directions'), 'Directions header must say Get Directions.');
assert(directionsScreenSource.includes('Going to'), 'Directions screen must show destination card title.');
assert(directionsScreenSource.includes('Where are you starting from?'), 'Directions screen must ask start question plainly.');
assert(directionsScreenSource.includes('Use my current location'), 'Directions screen must keep current-location start CTA.');
assert(directionsScreenSource.includes('Use last known location'), 'Directions screen must keep remembered-location CTA.');
assert(directionsScreenSource.includes('Choose start manually'), 'Directions screen must keep manual-start CTA.');
assert(directionsScreenSource.includes('Change destination'), 'Directions screen must let user change destination.');
assert(directionsScreenSource.includes('Finding best offline route'), 'Directions screen must show calculating status copy.');
assert(directionsScreenSource.includes('Route ready'), 'Directions screen must show success status copy.');
assert(directionsScreenSource.includes('Show route on map'), 'Directions screen must expose Show route on map CTA.');
assert(
  !directionsScreenSource.includes('Last known location is outside Ijtema and cannot be used for routing.'),
  'Directions screen must stop rejecting outside remembered location.',
);
assert(
  !directionsScreenSource.includes('Could not calculate a v2 route. The selected gate or place may need connector verification.'),
  'Directions screen must stop showing generic connector-verification route error for all failures.',
);

console.log('Directions buttons v2 checks passed.');
