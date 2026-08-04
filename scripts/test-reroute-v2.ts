import { strict as assert } from 'node:assert';

import { SearchService } from '../src/services/SearchService';
import { RoutingServiceV2 } from '../src/services/RoutingServiceV2';
import { V2DirectionsService } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';
import {
  buildV2RerouteRequest,
  evaluateRerouteEvidenceV2,
  keepCurrentRouteAfterRerouteFailureV2,
} from '../src/services/V2NavigationRuntimeService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

const gate21 = SearchService.search('Gate 21')[0];
const block28 = SearchService.search('Block 28')[0];
const gate05 = SearchService.search('Gate 05')[0];
const rasta09 = SearchService.search('Rasta 09')[0];
const preview = V2DirectionsService.calculatePreview({
  startPlace: gate21,
  destination: block28,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(preview.status, 'ready', 'Reroute fixture must route');
const activeRoute = V2NavigationAdapter.fromPreview({
  previewRoute: preview.route!,
  destination: block28,
  startPlace: gate21,
});

assert.equal(
  evaluateRerouteEvidenceV2({
    gpsAccuracyM: 20,
    consecutiveOffRouteCount: 2,
    offRouteDurationMs: 6000,
    cooldownRemainingMs: 0,
    movedDistanceSinceLastAcceptedM: 30,
  }).shouldReroute,
  false,
  'Reroute must require threshold plus consecutive evidence or duration',
);
assert.equal(
  evaluateRerouteEvidenceV2({
    gpsAccuracyM: 20,
    consecutiveOffRouteCount: 3,
    offRouteDurationMs: 7000,
    cooldownRemainingMs: 25000,
    movedDistanceSinceLastAcceptedM: 30,
  }).shouldReroute,
  false,
  'Reroute must respect cooldown',
);
assert.equal(
  evaluateRerouteEvidenceV2({
    gpsAccuracyM: 20,
    consecutiveOffRouteCount: 3,
    offRouteDurationMs: 8000,
    cooldownRemainingMs: 0,
    movedDistanceSinceLastAcceptedM: 30,
  }).shouldReroute,
  true,
  'Reroute must trigger after enough evidence without cooldown',
);

const failed = keepCurrentRouteAfterRerouteFailureV2(activeRoute);
assert.equal(failed.route, activeRoute, 'Reroute failure must keep old route visible');
assert.equal(
  failed.message,
  'Could not find a better route. Continuing current route.',
  'Reroute failure message must be exact',
);

const outsideRequest = buildV2RerouteRequest({
  route: activeRoute,
  coordinate: { latitude: 24.9695, longitude: 66.9968, accuracy: 12 },
  walkingSpeedMs: 1.4,
  forceOutside: true,
});
assert.equal(outsideRequest.start.type, 'outside_coordinate', 'Outside reroute must use outside_coordinate start');
assert.equal(outsideRequest.destination.type, 'block', 'Reroute destination must preserve block destination');

const outsidePreview = V2DirectionsService.calculatePreview({
  startPlace: null,
  destination: block28,
  currentLocation: outsideRequest.start.coordinate,
  walkingSpeedMs: 1.4,
  forceOutside: true,
});
assert.equal(outsidePreview.status, 'ready', 'Outside reroute candidate must route via connected official gate');
assert.equal(outsidePreview.route?.startResolution?.startType, 'nearest_official_gate', 'Outside reroute must use nearest connected official gate');

// ─── Reroute must use the same gate-selection objective as initial routing ──
// Reroute doesn't have its own gate-selection logic — buildV2RerouteRequest
// just builds an outside_coordinate RoutingStartV2 and hands it to the same
// V2DirectionsService.calculatePreview -> RoutingServiceV2.calculateRoute
// initial routing uses. A direct calculateRoute call for the identical
// coordinate+destination must therefore pick the identical gate, under both
// beeline and (with the flag on) OSM street mode — otherwise reroute could
// silently diverge from what a fresh route computation would choose.
{
  delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;
  const directBeeline = RoutingServiceV2.calculateRoute({
    start: outsideRequest.start,
    destination: outsideRequest.destination,
  });
  assert.ok(directBeeline, 'Direct calculateRoute for the reroute coordinate must succeed (beeline)');
  assert.equal(
    directBeeline!.startResolution?.gate?.id,
    outsidePreview.route?.startResolution?.gate?.id,
    'Beeline: reroute-selected gate must match a direct calculateRoute call for the same coordinate+destination',
  );

  process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH = 'true';
  const outsidePreviewStreet = V2DirectionsService.calculatePreview({
    startPlace: null,
    destination: block28,
    currentLocation: outsideRequest.start.coordinate,
    walkingSpeedMs: 1.4,
    forceOutside: true,
  });
  const directStreet = RoutingServiceV2.calculateRoute({
    start: outsideRequest.start,
    destination: outsideRequest.destination,
  });
  assert.equal(outsidePreviewStreet.status, 'ready', 'Outside reroute candidate must still route under street mode');
  assert.ok(directStreet, 'Direct calculateRoute for the reroute coordinate must succeed (street mode)');
  assert.equal(
    directStreet!.startResolution?.gate?.id,
    outsidePreviewStreet.route?.startResolution?.gate?.id,
    'Street mode: reroute-selected gate must match a direct calculateRoute call for the same coordinate+destination',
  );
  delete process.env.EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH;
}

const rastaPreview = V2DirectionsService.calculatePreview({
  startPlace: gate05,
  destination: rasta09,
  currentLocation: null,
  walkingSpeedMs: 1.4,
});
assert.equal(rastaPreview.status, 'ready', 'Rasta reroute fixture must route');
const activeRastaRoute = V2NavigationAdapter.fromPreview({
  previewRoute: rastaPreview.route!,
  destination: rasta09,
  startPlace: gate05,
});
const rastaRerouteRequest = buildV2RerouteRequest({
  route: activeRastaRoute,
  coordinate: { latitude: 24.9694, longitude: 67.0016, accuracy: 10 },
  walkingSpeedMs: 1.4,
});
assert.equal(activeRastaRoute.destination.rastaId, 'R9', 'Active rasta route must preserve selected rasta id');
assert.equal(rastaRerouteRequest.destination.type, 'rasta', 'Rasta reroute must preserve rasta destination type');
assert.equal(rastaRerouteRequest.destination.rastaId, 'R9', 'Rasta reroute must preserve selected rasta destination id');

console.log('Reroute v2 checks passed.');
