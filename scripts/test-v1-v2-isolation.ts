import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';

const searchSource = readFileSync('src/services/SearchService.ts', 'utf8');
const directionsVmSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const navigationScreenSource = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const navigationV1Source = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const storeSource = readFileSync('src/store/useAppStore.ts', 'utf8');
const legacyDataSource = readFileSync('src/constants/data.ts', 'utf8');

assert(searchSource.includes('MapFeatureFlagsService.useIjtemaV2Map()'), 'SearchService must centralize v1 rollback behind the v2 map flag');
assert(directionsVmSource.includes("destination.sourceVersion === 'v2'"), 'DirectionsViewModel must branch v2 destinations away from v1 routing');
assert(directionsVmSource.includes('V2NavigationAdapter.fromPreview'), 'DirectionsViewModel must adapt v2 previews before active navigation');
assert(navigationScreenSource.includes("activeRoute.sourceVersion === 'v2'"), 'NavigationScreen must identify v2 active routes');
assert(navigationScreenSource.includes('NavigationScreenV2Disabled'), 'NavigationScreen must not send disabled v2 active routes into v1 runtime');
assert(!navigationV1Source.includes('V2NavigationAdapter'), 'Legacy NavigationViewModel must remain v1-only');
assert(!legacyDataSource.includes('../data/ijtema/mapBounds'), 'Legacy data constants must not import v2 map bounds');
assert(!legacyDataSource.includes('IJTEMA_MAP_BOUNDS'), 'Legacy MAP_BOUNDS must be derived from legacy data only');

delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING;
delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION;

const defaultBlock42 = SearchService.search('Block 42')[0];
assert.equal(defaultBlock42?.sourceVersion, 'v2', 'Normal production search must not use v1 B1-B24 data');
assert.equal(SearchService.getPlaceById('C1'), null, 'Production default getPlaceById must not resolve legacy global gate C1');
assert.equal(SearchService.getPlaceById('LM_GATE_EAST'), null, 'Production default getPlaceById must not resolve legacy landmarks');
assert(storeSource.includes('sanitizePersistedPlace'), 'Persisted places must be sanitized during production v2 migration');
assert(storeSource.includes("sourceVersion === 'v2'"), 'Persisted recent searches must keep v2 places only in production mode');

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
const rollbackBlock42 = SearchService.search('Block 42')[0];
assert.notEqual(rollbackBlock42?.sourceVersion, 'v2', 'Explicit rollback may leave v2 search path');
assert.notEqual(rollbackBlock42?.id, 'B42', 'Legacy rollback search must not masquerade as complete v2 B1-B42 production data');

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';
const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(preview.status, 'ready', 'V2 preview remains available while active navigation rollback is off');
assert.equal(
  V2NavigationAdapter.canStartActiveNavigation({ route: preview.route, destination: block28 }).canStart,
  false,
  'V2 active route must not start when v2 navigation rollback flag is off',
);

console.log('V1/V2 isolation checks passed.');
