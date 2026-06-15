import { strict as assert } from 'node:assert';

import { SearchService } from '../src/services/SearchService';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';
import {
  calculateNavigationProgressV2,
  shouldIgnorePoorAccuracyMovementV2,
} from '../src/services/V2NavigationRuntimeService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(preview.status, 'ready', 'Gate 21 -> Block 28 progress fixture must route');
const activeRoute = V2NavigationAdapter.fromPreview({
  previewRoute: preview.route!,
  destination: block28,
  startPlace: gate21,
});

const start = activeRoute.coordinates[0];
const forward = activeRoute.coordinates[Math.min(2, activeRoute.coordinates.length - 1)];

const initial = calculateNavigationProgressV2({
  route: activeRoute,
  coordinate: { ...start, accuracy: 8 },
  previousProgressMeters: 0,
  walkingSpeedMs: 1.4,
});
const moved = calculateNavigationProgressV2({
  route: activeRoute,
  coordinate: { ...forward, accuracy: 8 },
  previousProgressMeters: initial.progressMeters,
  walkingSpeedMs: 1.4,
});
assert(moved.progressMeters > initial.progressMeters, 'Progress projection must increase when moving forward');
assert(moved.remainingDistanceM < initial.remainingDistanceM, 'Remaining distance must decrease when moving forward');

const jitterBehind = calculateNavigationProgressV2({
  route: activeRoute,
  coordinate: {
    latitude: start.latitude + 0.00001,
    longitude: start.longitude + 0.00001,
    accuracy: 18,
  },
  previousProgressMeters: moved.progressMeters,
  previousEtaMinutes: moved.etaMinutes,
  walkingSpeedMs: 1.4,
});
assert(jitterBehind.progressMeters >= moved.progressMeters, 'GPS jitter must not reset v2 route progress');
assert(
  Math.abs(jitterBehind.etaMinutes - moved.etaMinutes) <= 1,
  'ETA must remain stable during stationary jitter',
);

assert.equal(
  shouldIgnorePoorAccuracyMovementV2({ movedDistanceM: 6, accuracyM: 65 }),
  true,
  'Poor-accuracy movement under 10m must be ignored',
);
assert.equal(
  shouldIgnorePoorAccuracyMovementV2({ movedDistanceM: 16, accuracyM: 20 }),
  false,
  'Accurate movement over 10m must be accepted',
);

console.log('Navigation progress v2 checks passed.');
