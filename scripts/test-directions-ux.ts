import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const screen = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const vm = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const navigationCapability = readFileSync('src/services/LocationNavigationCapability.ts', 'utf8');

assert(screen.includes('Get Directions'), 'Directions screen must use layman-friendly heading');
assert(screen.includes('Going to'), 'Directions screen must show destination card clearly');
assert(screen.includes('Choose where you are starting from'), 'Directions screen must focus on start selection');
const directoryScreen = readFileSync('src/views/screens/LocationsDirectoryScreen.tsx', 'utf8');
assert(directoryScreen.includes('Use my current location'), 'Directory must include current-location action');
assert(directoryScreen.includes('Use last known location'), 'Directory should use clear last-known location labeling');
// The Directory is the one place chooser: the sheet opens it for a start instead of hosting its own search box (#222).
assert(!screen.includes('Search start point: gate, rasta, block'), 'Directions screen must not host a second start search');
assert(screen.includes("onOpenDirectory?.('start')"), 'Choose start manually must open the Directory to choose a start');
assert(directoryScreen.includes('canUseLastKnown'), 'Directory should show the last-known option only when a remembered location exists');
assert(screen.includes('Change destination'), 'Directions screen must include destination change action');
assert(screen.includes('ScrollView'), 'Directions screen should use scroll layout');
assert(screen.includes('paddingBottom'), 'Directions screen should add bottom padding for safe area');
assert(screen.includes('Start Navigation'), 'Directions screen should expose a Start Navigation CTA once a route is ready');
assert(screen.includes('Route ready'), 'Directions screen should show route-ready summary');
assert(screen.includes('Finding route...'), 'Directions screen should show provider-neutral calculating state clearly');

assert(vm.includes('ROUTE_TIMEOUT_MS'), 'Directions route calculation should include timeout');
assert(vm.includes('forceOutside'), 'Directions should pass outside start mode into v2 preview service');
assert(vm.includes('Start and destination are the same'), 'Directions should handle same start/destination case');
assert(vm.includes('setLoadState(\'needs_origin\')'), 'Directions should avoid routing without a valid origin');
// StartSource is now a re-export of the single-owner NavigationStartSource type (see
// LocationNavigationCapability.ts) rather than its own inline union.
assert(vm.includes('export type StartSource = NavigationStartSource;'), 'Directions StartSource must stay aliased to the single-owner NavigationStartSource type');
assert(
  navigationCapability.includes("export type NavigationStartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place';"),
  'NavigationStartSource should model live, device-cached, remembered, and manual start provenance explicitly',
);
assert(
  vm.includes('startSourceSupportingCopy') && vm.includes('isCurrentLocationStartActive'),
  'Directions should expose source-aware presentation instead of inferring current-location state from coordinates',
);
assert(vm.includes('rememberedLocationAgeLabel'), 'Directions should expose remembered-location age metadata');

console.log('Directions UX checks passed.');
