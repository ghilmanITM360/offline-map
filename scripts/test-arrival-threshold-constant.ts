import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// v1 and v2 navigation view models must both read arrival distance from the one
// shared constant instead of duplicating a hand-copied magic number (Stage 5 cleanup).
import { ARRIVAL_THRESHOLD_METERS } from '../src/constants/navigation';

assert.equal(ARRIVAL_THRESHOLD_METERS, 20, 'Arrival threshold constant must stay at 20 meters');

const v1Source = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const v2Source = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');

assert(
  v1Source.includes("import { ARRIVAL_THRESHOLD_METERS as ARRIVAL_THRESHOLD_M } from '../constants/navigation';"),
  'NavigationViewModel (v1) must import the shared arrival threshold constant',
);
assert(
  v2Source.includes("import { ARRIVAL_THRESHOLD_METERS } from '../constants/navigation';"),
  'NavigationViewModelV2 must import the shared arrival threshold constant',
);
assert(!/const ARRIVAL_THRESHOLD_M(ETERS)?\s*=\s*20/.test(v1Source), 'v1 must not re-declare a local arrival threshold constant');
assert(!/const ARRIVAL_THRESHOLD_M(ETERS)?\s*=\s*20/.test(v2Source), 'v2 must not re-declare a local arrival threshold constant');

console.log('Arrival threshold shared-constant checks passed.');
