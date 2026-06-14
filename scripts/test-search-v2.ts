import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { IJTEMA_NAVIGATION_GRAPH_V2 } from '../src/data/ijtema';
import { SearchService } from '../src/services/SearchService';

const INTERNAL_ID_PATTERN = /\b(?:R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|P\d+|B\d+_C\d+)\b/;
const flagsSource = readFileSync('src/services/MapFeatureFlagsService.ts', 'utf8');

assert(flagsSource.includes('process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP'), 'Expo v2 map flag must use static dot-notation env access');
assert(flagsSource.includes('process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING'), 'Expo v2 routing flag must use static dot-notation env access');
assert(!flagsSource.includes('process.env[name]'), 'Expo feature flags must not use dynamic bracket env access');

function withFlags<T>(flags: Record<string, string | undefined>, fn: () => T): T {
  const previous = Object.fromEntries(Object.keys(flags).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(flags)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

withFlags({ EXPO_PUBLIC_USE_IJTEMA_V2_MAP: 'false' }, () => {
  assert.equal(SearchService.search('Block 42').some((place) => place.id === 'B42'), false, 'feature flag off must keep old search data');
});

withFlags({ EXPO_PUBLIC_USE_IJTEMA_V2_MAP: 'true' }, () => {
  const blocks = SearchService.searchByCategory('blocks');
  assert.equal(blocks.length, 42, 'v2 block category must expose B1-B42');
  assert(blocks.every((place) => place.sourceVersion === 'v2'), 'v2 block results must be adapted from v2 data');

  const block42 = SearchService.search('Block 42')[0];
  assert.equal(block42?.id, 'B42', 'Search must find Block 42');
  assert.equal(block42.category, 'Block', 'Block 42 must stay app-compatible');
  assert.equal(block42.polygon?.length && block42.polygon.length >= 3, true, 'Block 42 must carry a renderable polygon');
  assert.equal(block42.isRoutable, true, 'Block 42 must be routable');

  const block42Urdu = SearchService.search('بلاک 42')[0];
  assert.equal(block42Urdu?.id, 'B42', 'Search must find Urdu Block 42');

  const gate21 = SearchService.search('Gate 21')[0];
  assert.equal(gate21?.id, 'GATE_21', 'Search must find Gate 21');
  assert.equal(gate21.category, 'Gate');
  assert.equal(gate21.isRoutable, true, 'Connected Gate 21 must be routable');
  assert.equal(gate21.isStartRoutable, true, 'Connected Gate 21 must be start-routable');

  const gate15 = SearchService.search('Gate 15')[0];
  assert.equal(gate15?.id, 'GATE_15', 'Exact missing gate search may show unavailable Gate 15');
  assert.equal(gate15.isRoutable, false, 'Missing Gate 15 must not be routable');
  assert.equal(gate15.coordinate, undefined, 'Missing Gate 15 must not have a fake marker coordinate');

  const gate18 = SearchService.search('Gate 18')[0];
  assert.equal(gate18?.id, 'GATE_18', 'Search must find provided but disconnected Gate 18');
  assert.equal(gate18.isRoutable, false, 'Disconnected Gate 18 must not route silently');
  assert.equal(gate18.isStartRoutable, false, 'Disconnected Gate 18 must not be start-routable');
  assert(gate18.unavailableReason?.includes('connector verification'), 'Disconnected Gate 18 must explain connector verification');
  assert.equal(IJTEMA_NAVIGATION_GRAPH_V2.adjacency.GATE_18?.length ?? 0, 0, 'Gate 18 fixture must remain disconnected until verified');

  const rasta09 = SearchService.search('Rasta 09')[0];
  assert.equal(rasta09?.id, 'R9', 'Search must find Rasta 09');
  assert.equal(rasta09.polyline?.length, 9, 'Rasta 09 must expose its v2 polyline');

  const shahrNorth = SearchService.search('شہر پنڈال شمال')[0];
  assert.equal(shahrNorth?.id, 'SHAHR_E_PINDAL_NORTH', 'Search must find Shahr-e-Pindal North using Urdu alias');
  assert.equal(shahrNorth.category, 'SpecialRoute', 'Shahr-e-Pindal must be represented as a special route place');
  assert.equal(shahrNorth.isRoutable, true, 'Connected Shahr-e-Pindal routes must be routable');
  assert.equal(shahrNorth.isStartRoutable, true, 'Connected Shahr-e-Pindal routes must be start-routable');
  assert.equal(shahrNorth.routingStatus, 'routable', 'Connected Shahr-e-Pindal route status must be routable');

  const normalResults = [
    ...SearchService.search('Rasta 09'),
    ...SearchService.search('Shahr-e-Pindal North'),
    ...SearchService.search('Block 42'),
  ];
  assert(
    normalResults.every((place) => !INTERNAL_ID_PATTERN.test(`${place.name} ${place.description}`)),
    'normal user search labels must not expose internal point IDs',
  );

  const developerRasta = SearchService.search('Rasta 09', undefined, { developerMode: true })[0];
  assert(developerRasta.developerLabel?.includes('R9-01'), 'developer mode may expose internal v2 point IDs');
});

console.log('Search v2 checks passed.');
