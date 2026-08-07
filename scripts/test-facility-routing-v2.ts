import { strict as assert } from 'node:assert';

import { IJTEMA_DATA, LANDMARK_PLACES } from '../src/constants/data';
import { IJTEMA_NAVIGATION_GRAPH_V2 } from '../src/data/ijtema';
import type { NormalizedOutsideCandidate, OutsideRouteCandidateSource } from '../src/models/outsideRouting';
import type { Place } from '../src/models/types';
import { V2DirectionsService, destinationFromPlace } from '../src/services/V2DirectionsService';
import { V2NavigationAdapter } from '../src/services/V2NavigationAdapter';
import { buildV2RerouteRequest } from '../src/services/V2NavigationRuntimeService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'true';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'true';

const insideOrigin = { latitude: 24.966, longitude: 67.004 };
const outsideOrigin = { latitude: 24.9762, longitude: 67.011 };
const facilities = [
  ['LM_MASJID_MAIN', 'Masjid', 'P6'],
  ['LM_MEDICAL_MAIN', 'Help', 'R9-02'],
  ['LM_WATER_NORTH', 'Landmark', 'P4'],
  ['LM_FOOD_MAIN', 'Landmark', 'P9'],
  ['LM_PARKING', 'Landmark', 'R11-02'],
  ['LM_BUS_NORTH', 'Terminal', 'SPSP-01'],
] as const;

for (const [facilityId, category, expectedNodeId] of facilities) {
  const canonical = LANDMARK_PLACES.find((place) => place.id === facilityId);
  assert(canonical, `${facilityId} fixture must exist`);
  const facility: Place = { ...canonical, category };
  const destination = destinationFromPlace(facility);
  assert.deepEqual(
    destination,
    { type: 'facility', facilityId, nodeId: expectedNodeId, label: facility.name },
    `${facilityId} must resolve through canonical landmark mapping`,
  );

  const preview = V2DirectionsService.calculatePreview({
    startPlace: null,
    destination: facility,
    currentLocation: insideOrigin,
  });
  assert.equal(preview.status, 'ready', `${facilityId} must route from a live inside coordinate`);
  assert(preview.route, `${facilityId} must produce a route`);
  assert.equal(preview.route.destinationLabel, facility.name, `${facilityId} label must survive preview`);
  assert.equal(preview.route.destinationEntryNodeId, expectedNodeId, `${facilityId} must use canonical V2 endpoint`);
  assert.equal(preview.route.nodes.at(-1), expectedNodeId, `${facilityId} route must end at canonical V2 endpoint`);
  assert(preview.route.coordinates.length >= 2, `${facilityId} route geometry must contain at least two points`);
  assert(preview.route.totalDistance > 0, `${facilityId} route distance must be positive`);
  assert(preview.route.estimatedTimeMin > 0, `${facilityId} route ETA must be positive`);

  const startCheck = V2NavigationAdapter.canStartActiveNavigation({ route: preview.route, destination: facility });
  assert.equal(startCheck.canStart, true, `${facilityId} preview must be startable`);
  const activeRoute = V2NavigationAdapter.fromPreview({
    previewRoute: preview.route,
    destination: facility,
    currentLocation: insideOrigin,
  });
  assert.deepEqual(
    {
      type: activeRoute.destination.type,
      facilityId: activeRoute.destination.facilityId,
      entryNodeId: activeRoute.destination.entryNodeId,
      label: activeRoute.destination.label,
    },
    { type: 'facility', facilityId, entryNodeId: expectedNodeId, label: facility.name },
    `${facilityId} metadata must survive Start`,
  );
  assert.deepEqual(
    buildV2RerouteRequest({ route: activeRoute, coordinate: insideOrigin, walkingSpeedMs: 1.4 }).destination,
    { type: 'facility', facilityId, nodeId: expectedNodeId, label: facility.name },
    `${facilityId} reroute must reconstruct Facility destination`,
  );
}

const mainMasjid = LANDMARK_PLACES.find((place) => place.id === 'LM_MASJID_MAIN')!;
const outsideProvider: OutsideRouteCandidateSource = {
  routeToGates: async (request) => ({
    status: 'success',
    candidateSet: {
      requestId: request.token.requestId,
      requestVersion: request.token.requestVersion,
      provider: 'google',
      outcomes: request.gates.map(({ gateId, routeTargetCoordinate }) => {
        const route: NormalizedOutsideCandidate = {
          schemaVersion: 1,
          candidateId: `${request.token.requestId}:google:${gateId}:0`,
          requestId: request.token.requestId,
          requestVersion: request.token.requestVersion,
          provider: 'google',
          gateId,
          distanceM: gateId === 'GATE_12' ? 10 : 50_000,
          durationSeconds: gateId === 'GATE_12' ? 60 : 50_000,
          coordinates: [request.origin, routeTargetCoordinate],
          steps: [],
          roadFollowing: true,
          distanceKind: 'walking-route',
          warnings: [],
          fallbackReason: null,
          fallbackHistory: [],
        };
        return { status: 'routed' as const, gateId, routes: [route] };
      }),
    },
  }),
};

async function checkOutsideFacilityRouting() {
  const outsidePreview = await V2DirectionsService.calculateHybridPreview({
    request: {
      startPlace: null,
      destination: mainMasjid,
      currentLocation: outsideOrigin,
      forceOutside: true,
    },
    token: { requestId: 'facility-outside', requestVersion: 1 },
    signal: new AbortController().signal,
    outsideProvider,
  });
  assert.equal(outsidePreview.status, 'ready', 'Outside Facility must use hybrid provider path');
  assert.equal(outsidePreview.route?.outsideRoute?.provider, 'google', 'Outside Facility must retain provider route');
  assert.equal(outsidePreview.route?.startResolution?.gate?.id, 'GATE_12', 'Outside Facility must select official gate');
  assert.equal(outsidePreview.route?.destinationEntryNodeId, 'P6', 'Outside Facility must keep canonical endpoint');
  assert((outsidePreview.route?.coordinates.length ?? 0) >= 2, 'Outside Facility must have route geometry');
  assert((outsidePreview.route?.totalDistance ?? 0) > 0, 'Outside Facility must have positive distance');
  assert((outsidePreview.route?.estimatedTimeMin ?? 0) > 0, 'Outside Facility must have positive ETA');
}

const noncanonical: Place = {
  id: 'LM_UNKNOWN',
  name: 'Unknown Facility',
  category: 'Landmark',
  description: 'Not in canonical landmark data',
  coordinate: mainMasjid.coordinate,
  sourceVersion: 'v1',
};
assert.equal(destinationFromPlace(noncanonical), null, 'Unmapped Facility must not runtime-snap marker coordinate');
assert.equal(
  V2DirectionsService.calculatePreview({ startPlace: null, destination: noncanonical, currentLocation: insideOrigin }).status,
  'unavailable',
  'Unmapped Facility must be unavailable',
);

const legacyNode = IJTEMA_DATA.nodes.P6;
assert(legacyNode, 'Legacy mapped coordinate fixture must exist');
assert(IJTEMA_NAVIGATION_GRAPH_V2.nodes.P6, 'Exact mapped V2 node fixture must exist');
assert.equal(destinationFromPlace({ ...mainMasjid, id: 'B1', category: 'Block' }), null, 'Legacy Block must not enter V2');
assert.equal(destinationFromPlace({ ...mainMasjid, id: 'LM_GATE_MAIN_NORTH', category: 'Gate' }), null, 'Legacy Gate must not enter V2');

void checkOutsideFacilityRouting().then(() => {
  console.log(`Facility V2 routing checks passed: ${facilities.length} inside facilities + outside hybrid + Start/reroute.`);
});
