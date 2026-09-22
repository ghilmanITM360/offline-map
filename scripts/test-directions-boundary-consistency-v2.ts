import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { MAP_BOUNDS } from '../src/constants/data';
import { RoutingService } from '../src/services/RoutingService';
import { EntryGateRoutingService } from '../src/services/EntryGateRoutingService';

// Fixture: inside the coarse bounding rectangle, but outside the precise
// venue polygon/polyline-buffer geometry (a corner of the map bounds with no
// nearby block or rasta). Before the Phase 5 fix, several v2-scoped
// inside/outside checks in DirectionsViewModel.ts and DirectionsScreen.tsx
// used the coarse check even though they were explicitly gated to v2
// destinations, disagreeing with the routing decision itself
// (EntryGateRoutingService, used for the actual gate-entry routing). See
// docs/OFFLINE_NAVIGATION_AND_ROUTING.md Phase 5.
const boundaryCoordinate = { latitude: MAP_BOUNDS.minLat + 0.0005, longitude: MAP_BOUNDS.maxLng - 0.0005 };
assert.equal(RoutingService.isInsideVenue(boundaryCoordinate), true, 'fixture must be inside the coarse rectangle');
assert.equal(
  EntryGateRoutingService.isInsideIjtemaArea(boundaryCoordinate),
  false,
  'fixture must be outside the precise venue geometry — otherwise it does not exercise the coarse/precise disagreement',
);

// ─── Source-level check: v2-scoped inside/outside checks must use the precise geometry ──
const directionsViewModelSource = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');

assert(
  directionsViewModelSource.includes('EntryGateRoutingService.isInsideIjtemaArea(startCoordinateForOutsideCheck)'),
  'DirectionsViewModel isOutsideStart (consumed by LocationSheet\'s outsideStart banner) must use precise venue geometry',
);
assert(
  directionsViewModelSource.includes('EntryGateRoutingService.isInsideIjtemaArea(resolved.coordinate)'),
  'chooseCurrentLocation must use precise venue geometry for v2 destinations',
);
assert(
  directionsViewModelSource.includes('isInsideVenueForDestination'),
  'DirectionsViewModel must route remembered/route-origin venue checks through a version-aware helper',
);

// ─── Legacy (v1) routing-validity gates must remain untouched (coarse) ─────
// These exist because the v1 graph's coverage is genuinely defined by the
// rectangle — switching them would incorrectly reject legacy start points
// that are within the box but outside any block/rasta polygon.
assert(
  directionsViewModelSource.includes("startSource === 'live_gps' && !RoutingService.isInsideVenue(originCoord)"),
  'Legacy live-gps route-validity gate must stay on coarse geometry',
);
assert(
  directionsViewModelSource.includes('!isV2Destination && !RoutingService.isInsideVenue(resolved.coordinate)'),
  'Legacy chooseCurrentLocation route-validity gate must stay on coarse geometry',
);

console.log('test-directions-boundary-consistency-v2.ts: all assertions passed');
