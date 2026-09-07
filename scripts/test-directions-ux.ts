import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const screen = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const vm = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');

// Phase A/C's canonical origin resolver removed the manual start question/search/CTAs below —
// start is auto-resolved and shown as a plain "Starting from" summary card. Phase D removed the
// in-sheet "Change destination" search — see LocationSheet.test.tsx.
assert(screen.includes('Get Directions'), 'Directions screen must use layman-friendly heading');
assert(screen.includes('Going to'), 'Directions screen must show destination card clearly');
assert(screen.includes('Starting from'), 'Directions screen must show resolved-start card clearly');
assert(screen.includes('best eligible official gate'), 'Directions screen should explain destination-aware current-location routing behavior');
assert(
  !screen.includes('Where are you starting from?') &&
    !screen.includes('showManualStartSearch') &&
    !screen.includes('onChangeDestination'),
  'Directions screen must not reintroduce the removed manual start/destination-search UI',
);
assert(screen.includes('ScrollView'), 'Directions screen should use scroll layout');
assert(screen.includes('paddingBottom'), 'Directions screen should add bottom padding for safe area');
assert(screen.includes('Start Navigation'), 'Directions screen should expose a Start Navigation CTA once a route is ready');
assert(screen.includes('Route ready'), 'Directions screen should show route-ready summary');
assert(screen.includes('Finding route...'), 'Directions screen should show provider-neutral calculating state clearly');

assert(vm.includes('ROUTE_TIMEOUT_MS'), 'Directions route calculation should include timeout');
assert(vm.includes('forceOutside'), 'Directions should pass outside start mode into v2 preview service');
assert(vm.includes('Start and destination are the same'), 'Directions should handle same start/destination case');
assert(vm.includes('setLoadState(\'needs_origin\')'), 'Directions should avoid routing without a valid origin');
assert(
  vm.includes("type StartSource = 'live_gps' | 'device_last_known' | 'remembered_location' | 'manual_place'"),
  'Directions should model live, device-cached, remembered, and manual start provenance explicitly',
);
assert(
  vm.includes('startSourceSupportingCopy') && vm.includes('isCurrentLocationStartActive'),
  'Directions should expose source-aware presentation instead of inferring current-location state from coordinates',
);
assert(vm.includes('rememberedLocationAgeLabel'), 'Directions should expose remembered-location age metadata');

console.log('Directions UX checks passed.');
