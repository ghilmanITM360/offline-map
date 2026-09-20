import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const screen = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const vm = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const navigationCapability = readFileSync('src/services/LocationNavigationCapability.ts', 'utf8');

assert(screen.includes('Get Directions'), 'Directions screen must use layman-friendly heading');
assert(screen.includes('Going to'), 'Directions screen must show destination card clearly');
assert(screen.includes('Where are you starting from?'), 'Directions screen must focus on start selection');
assert(screen.includes('Use my current location'), 'Directions screen must include current-location action');
assert(screen.includes('Find best eligible official gate automatically'), 'Directions screen should explain destination-aware current-location routing behavior');
assert(screen.includes('Use last known location'), 'Directions screen should use clear last-known location labeling');
assert(screen.includes('Choose start manually'), 'Directions screen should expose manual start action explicitly');
assert(screen.includes('Search start point: gate, rasta, block'), 'Directions screen must include manual start search');
assert(screen.includes('showManualStartSearch'), 'Directions manual start search should only render while editing manual start');
assert(screen.includes('rememberedLocationAvailable'), 'Directions should disable last-known action when no remembered location exists');
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
