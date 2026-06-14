import { strict as assert } from 'node:assert';
import { getDistance } from 'geolib';
import {
  IJTEMA_DATA,
  LANDMARK_NEAREST_NODE,
  LANDMARK_PLACES,
  MAP_BOUNDS,
} from '../src/constants/data';
import { Coordinate, Place } from '../src/models/types';
import { InstructionService } from '../src/services/InstructionService';
import { RoutePointService } from '../src/services/RoutePointService';
import { RoutingService } from '../src/services/RoutingService';
import { SearchService } from '../src/services/SearchService';

process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_ROUTING = 'false';
process.env.EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION = 'false';

const BROAD_KARACHI_BOUNDS = {
  minLat: 24.8,
  maxLat: 25.1,
  minLng: 66.8,
  maxLng: 67.2,
};

const internalGraphNodePattern = /\b(?:P\d+|S\d+|T\d+|C\d+)\b/;

function dmsToDecimal(degrees: number, minutes: number, seconds: number, hemisphere: 'N' | 'S' | 'E' | 'W'): number {
  const decimal = degrees + minutes / 60 + seconds / 3600;
  return hemisphere === 'S' || hemisphere === 'W' ? -decimal : decimal;
}

function near(actual: number, expected: number, label: string, epsilon = 0.000001): void {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function assertCoordinate(label: string, coord: Coordinate): void {
  assert(Number.isFinite(coord.latitude), `${label} latitude must be finite`);
  assert(Number.isFinite(coord.longitude), `${label} longitude must be finite`);
  assert.notEqual(coord.latitude, 0, `${label} latitude must not be zero`);
  assert.notEqual(coord.longitude, 0, `${label} longitude must not be zero`);
  assert(
    coord.latitude >= BROAD_KARACHI_BOUNDS.minLat && coord.latitude <= BROAD_KARACHI_BOUNDS.maxLat,
    `${label} latitude is outside broad Karachi bounds: ${coord.latitude}`,
  );
  assert(
    coord.longitude >= BROAD_KARACHI_BOUNDS.minLng && coord.longitude <= BROAD_KARACHI_BOUNDS.maxLng,
    `${label} longitude is outside broad Karachi bounds: ${coord.longitude}`,
  );
  assert(
    !(coord.latitude > 60 && coord.longitude < 30),
    `${label} looks like reversed lat/lng: ${coord.latitude}, ${coord.longitude}`,
  );
}

function insideVenueBounds(coord: Coordinate): boolean {
  return (
    coord.latitude >= MAP_BOUNDS.minLat &&
    coord.latitude <= MAP_BOUNDS.maxLat &&
    coord.longitude >= MAP_BOUNDS.minLng &&
    coord.longitude <= MAP_BOUNDS.maxLng
  );
}

function segmentOrientation(a: Coordinate, b: Coordinate, c: Coordinate): number {
  const value =
    (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude);
  return Math.sign(value);
}

function pointOnSegment(a: Coordinate, b: Coordinate, c: Coordinate): boolean {
  return (
    Math.min(a.longitude, c.longitude) <= b.longitude &&
    b.longitude <= Math.max(a.longitude, c.longitude) &&
    Math.min(a.latitude, c.latitude) <= b.latitude &&
    b.latitude <= Math.max(a.latitude, c.latitude)
  );
}

function segmentsIntersect(p1: Coordinate, p2: Coordinate, p3: Coordinate, p4: Coordinate): boolean {
  const o1 = segmentOrientation(p1, p2, p3);
  const o2 = segmentOrientation(p1, p2, p4);
  const o3 = segmentOrientation(p3, p4, p1);
  const o4 = segmentOrientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(p1, p3, p2)) return true;
  if (o2 === 0 && pointOnSegment(p1, p4, p2)) return true;
  if (o3 === 0 && pointOnSegment(p3, p1, p4)) return true;
  if (o4 === 0 && pointOnSegment(p3, p2, p4)) return true;
  return false;
}

function polygonSelfIntersects(points: Coordinate[]): boolean {
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const iNext = (i + 1) % points.length;
      const jNext = (j + 1) % points.length;
      if (i === j || iNext === j || jNext === i) continue;
      if (segmentsIntersect(points[i], points[iNext], points[j], points[jNext])) return true;
    }
  }
  return false;
}

function placeForBlock(blockId: string): Place {
  const block = IJTEMA_DATA.blocks[blockId];
  return {
    id: blockId,
    name: block.name,
    urduName: block.urduName,
    category: block.role?.toLowerCase().includes('masjid') ? 'Masjid' : 'Block',
    description: block.role ?? block.name,
    coordinate: block.center,
    aliases: block.aliases,
  };
}

function assertRouteForPlace(origin: Coordinate, place: Place): void {
  const destinationNodes = RoutingService.resolveDestinationNodesFromPlace(place, origin);
  assert(destinationNodes.length > 0, `${place.id} must resolve to at least one destination node`);
  destinationNodes.forEach((nodeId) => assert(IJTEMA_DATA.nodes[nodeId], `${place.id} resolved to missing node ${nodeId}`));

  const route = RoutingService.calculateRoute(origin, destinationNodes, undefined, 1.4);
  assert(route, `${place.id} should be routable from B1`);
  assert(route!.nodes.length > 1, `${place.id} route must not be degenerate`);
  assert(route!.totalDistance > 0, `${place.id} route distance must be positive`);
  route!.nodes.forEach((nodeId) => assert(IJTEMA_DATA.nodes[nodeId], `${place.id} route references missing node ${nodeId}`));
}

for (const [nodeKey, node] of Object.entries(IJTEMA_DATA.nodes)) {
  assert.equal(node.id, nodeKey, `Node key ${nodeKey} must match node.id`);
  assertCoordinate(`node ${nodeKey}`, { latitude: node.lat, longitude: node.lng });
  if (node.nearestRoadNode) {
    assert(IJTEMA_DATA.nodes[node.nearestRoadNode], `Node ${nodeKey} nearestRoadNode ${node.nearestRoadNode} must exist`);
  }
}

const edgeKeys = new Set<string>();
for (const edge of IJTEMA_DATA.edges) {
  assert(IJTEMA_DATA.nodes[edge.from], `Edge ${edge.from}->${edge.to} from-node must exist`);
  assert(IJTEMA_DATA.nodes[edge.to], `Edge ${edge.from}->${edge.to} to-node must exist`);
  assert(edge.distance_m > 0, `Edge ${edge.from}->${edge.to} distance must be positive`);

  const edgeKey = [edge.from, edge.to].sort().join('--');
  assert(!edgeKeys.has(edgeKey), `Duplicate undirected edge ${edgeKey}`);
  edgeKeys.add(edgeKey);

  const from = IJTEMA_DATA.nodes[edge.from];
  const to = IJTEMA_DATA.nodes[edge.to];
  const measured = getDistance(
    { latitude: from.lat, longitude: from.lng },
    { latitude: to.lat, longitude: to.lng },
  );
  const allowedDelta = Math.max(35, measured * 0.35);
  assert(
    Math.abs(edge.distance_m - measured) <= allowedDelta,
    `Stored edge distance differs from geolib: ${edge.from}-${edge.to} stored=${edge.distance_m}m measured=${measured}m`,
  );
}

for (const [blockKey, block] of Object.entries(IJTEMA_DATA.blocks)) {
  assert.equal(block.id, blockKey, `Block key ${blockKey} must match block.id`);
  assertCoordinate(`block ${blockKey} center`, block.center);
  assert(insideVenueBounds(block.center), `Block ${blockKey} center must be inside venue bounds`);

  const polygon = block.corners ?? block.polygon;
  assert(polygon.length >= 3, `Block ${blockKey} polygon must contain at least 3 points`);
  polygon.forEach((coord, index) => {
    assertCoordinate(`block ${blockKey} polygon point ${index}`, coord);
    assert(insideVenueBounds(coord), `Block ${blockKey} polygon point ${index} must be inside venue bounds`);
  });
  assert(!polygonSelfIntersects(polygon), `Block ${blockKey} polygon must not self-intersect`);

  assert(block.entry_nodes.length > 0, `Block ${blockKey} must have entry nodes`);
  block.entry_nodes.forEach((nodeId) => assert(IJTEMA_DATA.nodes[nodeId], `Block ${blockKey} entry node ${nodeId} must exist`));
  assert(
    block.entry_nodes.some((nodeId) => IJTEMA_DATA.nodes[nodeId] && !IJTEMA_DATA.nodes[nodeId].nearestRoadNode),
    `Block ${blockKey} must resolve to at least one on-graph route node`,
  );
}

const allPlaces = SearchService.searchByCategory('all');
const placeIds = new Set<string>();
for (const place of allPlaces) {
  assert(!placeIds.has(place.id), `Duplicate searchable place ID ${place.id}`);
  placeIds.add(place.id);
  assertCoordinate(`search place ${place.id}`, place.coordinate);
  const markerCoordinate = RoutePointService.getDestinationCoordinate(place);
  assert(markerCoordinate, `Search place ${place.id} must produce a marker coordinate`);
  assertCoordinate(`destination marker ${place.id}`, markerCoordinate!);
}

for (const landmark of LANDMARK_PLACES) {
  assertCoordinate(`landmark ${landmark.id}`, landmark.coordinate);
  assert(LANDMARK_NEAREST_NODE[landmark.id], `Landmark ${landmark.id} must have nearest route node`);
  assert(IJTEMA_DATA.nodes[LANDMARK_NEAREST_NODE[landmark.id]], `Landmark ${landmark.id} nearest route node must exist`);
}

for (const gateId of ['C1', 'C2', 'C3', 'C4']) {
  const gate = IJTEMA_DATA.nodes[gateId];
  assert(gate, `${gateId} must exist`);
  assert.equal(gate.type, 'gate', `${gateId} must be a gate node`);
  assert(gate.nearestRoadNode, `${gateId} must route through nearestRoadNode`);
  assert(SearchService.search(gateId).some((place) => place.id === gateId), `${gateId} must be searchable`);
  assertRouteForPlace(IJTEMA_DATA.blocks.B1.center, SearchService.getPlaceById(gateId)!);
}

assert(SearchService.search('Block 2').some((place) => place.id === 'B2'), 'Block 2 must be searchable');
assert(SearchService.search('Member Masjid').some((place) => place.id === 'B2'), 'Member Masjid must resolve to Block 2');
assert(SearchService.searchByCategory('masjids').some((place) => place.id === 'B2'), 'Masjid category must include Block 2');
assertRouteForPlace(IJTEMA_DATA.blocks.B1.center, placeForBlock('B2'));

const expectedDms = {
  B2: { lat: dmsToDecimal(24, 58, 6.6, 'N'), lng: dmsToDecimal(66, 59, 59.7, 'E') },
  C1: { lat: dmsToDecimal(24, 58, 3.3, 'N'), lng: dmsToDecimal(66, 59, 57.6, 'E') },
  C2: { lat: dmsToDecimal(24, 58, 3.3, 'N'), lng: dmsToDecimal(67, 0, 1.9, 'E') },
  C3: { lat: dmsToDecimal(24, 58, 9.5, 'N'), lng: dmsToDecimal(66, 59, 57.8, 'E') },
  C4: { lat: dmsToDecimal(24, 58, 9.5, 'N'), lng: dmsToDecimal(67, 0, 2.0, 'E') },
};

near(IJTEMA_DATA.blocks.B2.center.latitude, expectedDms.B2.lat, 'B2 DMS latitude');
near(IJTEMA_DATA.blocks.B2.center.longitude, expectedDms.B2.lng, 'B2 DMS longitude');
for (const gateId of ['C1', 'C2', 'C3', 'C4'] as const) {
  near(IJTEMA_DATA.nodes[gateId].lat, expectedDms[gateId].lat, `${gateId} DMS latitude`);
  near(IJTEMA_DATA.nodes[gateId].lng, expectedDms[gateId].lng, `${gateId} DMS longitude`);
}

const blockIds = Object.keys(IJTEMA_DATA.blocks);
let routeCount = 0;
for (const fromId of blockIds) {
  for (const toId of blockIds) {
    if (fromId === toId) continue;
    const origin = IJTEMA_DATA.blocks[fromId].center;
    const destination = placeForBlock(toId);
    const route = RoutingService.calculateRoute(
      origin,
      RoutingService.resolveDestinationNodesFromPlace(destination, origin),
      undefined,
      1.4,
    );
    assert(route, `Missing block-to-block route ${fromId}->${toId}`);
    assert(route!.totalDistance > 0, `Block-to-block route ${fromId}->${toId} must have positive distance`);
    assert(route!.nodes[0] !== route!.nodes[route!.nodes.length - 1], `Block-to-block route ${fromId}->${toId} must not be same-node`);
    route!.nodes.forEach((nodeId) => assert(IJTEMA_DATA.nodes[nodeId], `Route ${fromId}->${toId} references missing node ${nodeId}`));
    route!.coordinates.forEach((coord, index) => {
      assertCoordinate(`route ${fromId}->${toId} coordinate ${index}`, coord);
      assert(insideVenueBounds(coord), `Route ${fromId}->${toId} coordinate ${index} must stay inside venue graph bounds`);
    });

    const instructions = InstructionService.generateInstructions(route!.nodes);
    assert(instructions.length > 0, `Route ${fromId}->${toId} must produce instructions`);
    const rawIdInstruction = instructions.find((step) => internalGraphNodePattern.test(step.text));
    assert(!rawIdInstruction, `Route instructions expose graph node IDs for ${fromId}->${toId}: ${rawIdInstruction?.text}`);
    routeCount += 1;
  }
}

const sameNearestPairs = new Map<string, string[]>();
for (const blockId of blockIds) {
  const nearest = RoutingService.findNearestNode(IJTEMA_DATA.blocks[blockId].center);
  sameNearestPairs.set(nearest, [...(sameNearestPairs.get(nearest) ?? []), blockId]);
}
for (const pairGroup of sameNearestPairs.values()) {
  if (pairGroup.length < 2) continue;
  for (let i = 0; i < pairGroup.length - 1; i += 1) {
    const fromId = pairGroup[i];
    const toId = pairGroup[i + 1];
    const route = RoutingService.calculateRoute(
      IJTEMA_DATA.blocks[fromId].center,
      RoutingService.resolveDestinationNodesFromPlace(placeForBlock(toId), IJTEMA_DATA.blocks[fromId].center),
      undefined,
      1.4,
    );
    assert(route && route.totalDistance > 0 && route.nodes.length > 1, `Same-nearest-node route ${fromId}->${toId} must be non-degenerate`);
  }
}

console.log(`Map data checks passed: ${Object.keys(IJTEMA_DATA.nodes).length} nodes, ${IJTEMA_DATA.edges.length} edges, ${blockIds.length} blocks, ${allPlaces.length} searchable places, ${routeCount} block routes.`);
