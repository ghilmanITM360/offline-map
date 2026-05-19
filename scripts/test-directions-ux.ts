import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const screen = readFileSync('src/views/screens/DirectionsScreen.tsx', 'utf8');
const vm = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');

assert(screen.includes('FROM'), 'Directions screen must label FROM clearly');
assert(screen.includes('TO'), 'Directions screen must label TO clearly');
assert(screen.includes('Choose starting point'), 'Directions screen must show manual start fallback text');
assert(screen.includes('Use My Current Location'), 'Directions screen must include current-location action');
assert(screen.includes('Search start point'), 'Directions screen must include manual start search');
assert(screen.includes('Change Destination'), 'Directions screen must include destination change action');
assert(screen.includes('ScrollView'), 'Directions screen should use scroll layout');
assert(screen.includes('paddingBottom'), 'Directions screen should add bottom padding for safe area');
assert(screen.includes('fitToCoordinates'), 'Directions map preview should fit route bounds when route exists');
assert(screen.includes('MAP_BOUNDS'), 'Directions map preview should focus on venue bounds, not city-wide');
assert(screen.includes('pinColor="#2E7D32"'), 'Destination marker should be visually highlighted');

assert(vm.includes('ROUTE_TIMEOUT_MS'), 'Directions route calculation should include timeout');
assert(vm.includes('outside the Ijtema area'), 'Directions should handle outside-area start with clear guidance');
assert(vm.includes('Start and destination are the same'), 'Directions should handle same start/destination case');
assert(vm.includes('setLoadState(\'needs_origin\')'), 'Directions should avoid routing without a valid origin');

console.log('Directions UX checks passed.');
