import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATA_ISSUES,
  IJTEMA_BLOCKS,
  IJTEMA_CENTRAL_POINTS,
  IJTEMA_GATES,
  IJTEMA_NAVIGATION_GRAPH_V2,
  IJTEMA_OFFICIAL_ENTRY_POLICY,
  IJTEMA_MAP_BOUNDS,
  IJTEMA_RASTAS,
  IJTEMA_SPECIAL_ROUTES,
  findNearestOfficialEntryGate,
  getNormalUserSearchableGates,
  getRoutableOfficialGates,
} from '../src/data/ijtema';
import { distanceMeters } from '../src/data/ijtema/graphBuilder';
import { Block, Coordinate, Gate, LocalizedLabel, Rasta, SpecialRoute } from '../src/data/ijtema/types';

const BROAD_KARACHI_BOUNDS = {
  minLat: 24.8,
  maxLat: 25.1,
  minLng: 66.8,
  maxLng: 67.2,
};

const internalPointIdPattern = /\b(?:R\d+-\d+|SPNP(?:-\d+)?|SPSP(?:-\d+)?|SPWP(?:-\d+)?|P\d+)\b/;
const activeGateNumbers = [1, 2, 3, 4, 5, 7, 8, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const nonexistentGateNumbers = [6, 9, 10, 11];
const outsideRoutingDoc = readFileSync(join(process.cwd(), 'docs/NAVIGATION_AND_ROUTING.md'), 'utf8');

const hasGraphConnection = (gate: Gate): boolean => (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[gate.id] ?? []).length > 0;

function assertLabel(label: LocalizedLabel, context: string): void {
  assert(label.en.trim().length > 0, `${context} must have an English label`);
  assert(label.ur?.trim().length, `${context} must have an Urdu label`);
  assert(label.romanUrdu?.trim().length, `${context} must have a Roman Urdu label`);
}

function assertCoordinate(coord: Coordinate, context: string): void {
  assert(Number.isFinite(coord.lat), `${context} latitude must be finite`);
  assert(Number.isFinite(coord.lng), `${context} longitude must be finite`);
  assert.notEqual(coord.lat, 0, `${context} latitude must not be zero`);
  assert.notEqual(coord.lng, 0, `${context} longitude must not be zero`);
  assert(coord.lat >= BROAD_KARACHI_BOUNDS.minLat && coord.lat <= BROAD_KARACHI_BOUNDS.maxLat, `${context} latitude outside broad Karachi bounds`);
  assert(coord.lng >= BROAD_KARACHI_BOUNDS.minLng && coord.lng <= BROAD_KARACHI_BOUNDS.maxLng, `${context} longitude outside broad Karachi bounds`);
  assert(!(coord.lat > 60 && coord.lng < 30), `${context} appears to have reversed lat/lng`);
}

function assertInsideBounds(coord: Coordinate, context: string): void {
  assert(coord.lat >= IJTEMA_MAP_BOUNDS.minLat, `${context} latitude below expanded bounds`);
  assert(coord.lat <= IJTEMA_MAP_BOUNDS.maxLat, `${context} latitude above expanded bounds`);
  assert(coord.lng >= IJTEMA_MAP_BOUNDS.minLng, `${context} longitude below expanded bounds`);
  assert(coord.lng <= IJTEMA_MAP_BOUNDS.maxLng, `${context} longitude above expanded bounds`);
}

function assertNoDuplicateIds(ids: string[], context: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    assert(!seen.has(id), `Duplicate ${context} ID ${id}`);
    seen.add(id);
  }
}

function assertIssueDocumented(issueId: string): void {
  assert(DATA_ISSUES.some((issue) => issue.id === issueId), `Data issue ${issueId} must be documented`);
}

function assertBlock(block: Block): void {
  assert.equal(block.id, `B${block.number}`, `${block.id} must match block number`);
  assertLabel(block.name, block.id);
  assert.equal(block.category, 'block', `${block.id} category`);
  assertCoordinate(block.center, `${block.id} center`);
  assertInsideBounds(block.center, `${block.id} center`);
  assert(block.aliases.includes(`Block ${block.number}`), `${block.id} needs Block alias`);
  assert(block.aliases.includes(`B${block.number}`), `${block.id} needs B alias`);
  assert(block.aliases.includes(`بلاک ${block.number}`), `${block.id} needs Urdu alias`);
  assert.equal(block.visual.label, `Block ${block.number}`, `${block.id} normal visual label`);
  assert(!internalPointIdPattern.test(block.visual.label), `${block.id} visual label must not expose internal point IDs`);

  for (const cornerKey of ['c1', 'c2', 'c3', 'c4'] as const) {
    assertCoordinate(block.corners[cornerKey], `${block.id}.${cornerKey}`);
    assertCoordinate(block.entryPoints[cornerKey], `${block.id}.entry.${cornerKey}`);
    assertInsideBounds(block.corners[cornerKey], `${block.id}.${cornerKey}`);
  }

  const uniquePolygonPoints = new Set(block.polygon.map((point) => `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`));
  assert(block.polygon.length >= 3, `${block.id} polygon must have at least 3 points`);
  assert(uniquePolygonPoints.size >= 3, `${block.id} polygon must have at least 3 unique points`);
  block.polygon.forEach((point, index) => {
    assertCoordinate(point, `${block.id}.polygon[${index}]`);
    assertInsideBounds(point, `${block.id}.polygon[${index}]`);
  });
}

function assertGate(gate: Gate): void {
  const padded = String(gate.number).padStart(2, '0');
  assert.equal(gate.id, `GATE_${padded}`, `${gate.id} must match gate number`);
  assertLabel(gate.name, gate.id);
  assert.equal(gate.category, 'gate', `${gate.id} category`);
  assert(gate.aliases.includes(`Gate ${padded}`), `${gate.id} needs padded Gate alias`);
  assert(gate.aliases.includes(`Gate ${gate.number}`), `${gate.id} needs unpadded Gate alias`);
  assert(gate.aliases.includes(`G${gate.number}`), `${gate.id} needs short alias`);
  assert(gate.aliases.includes(`گیٹ ${gate.number}`), `${gate.id} needs Urdu alias`);
  assert(!internalPointIdPattern.test(gate.name.en), `${gate.id} English label must not expose internal point IDs`);
  assert.equal(gate.entryRole, 'official_entry_exit', `${gate.id} must be marked as an official entry/exit`);
  assert.equal(gate.isOfficialEntry, true, `${gate.id} must be an official numbered entry gate`);

  if (gate.status === 'missing_coordinate') {
    assert(!gate.coordinate, `${gate.id} missing-coordinate gate must not use a fake coordinate`);
    assert.equal(gate.routingStatus, 'missing_coordinate', `${gate.id} missing-coordinate gate must not be routable`);
    assert.equal(gate.canStartRouteFromOutside, false, `${gate.id} missing-coordinate gate must not start outside routes`);
    assert.equal(gate.userFacingBehavior.normalSearch, 'unavailable', `${gate.id} should be unavailable in normal route selection`);
    assert.equal(gate.userFacingBehavior.mapDisplay, 'unavailable', `${gate.id} should be shown as unavailable or hidden on normal maps`);
    return;
  }

  assert(gate.coordinate, `${gate.id} provided gate must have coordinate`);
  assert.equal(gate.routingStatus, 'routable', `${gate.id} provided gate must be routable`);
  if (gate.connectorStatus === 'ground_truth_required') {
    assert.equal(gate.canStartRouteFromOutside, false, `${gate.id} unverified connector must not start outside routes`);
    assert.equal(gate.userFacingBehavior.normalSearch, 'unavailable', `${gate.id} unverified connector must not appear in normal route search`);
    assert.equal(gate.userFacingBehavior.mapDisplay, 'visible', `${gate.id} unverified connector may remain visible for orientation`);
    assertCoordinate(gate.coordinate, `${gate.id}.coordinate`);
    assertInsideBounds(gate.coordinate, `${gate.id}.coordinate`);
    return;
  }
  assert.equal(gate.canStartRouteFromOutside, true, `${gate.id} provided gate must be able to start outside routes`);
  assert.equal(gate.userFacingBehavior.normalSearch, 'searchable', `${gate.id} should appear in normal search`);
  assert.equal(gate.userFacingBehavior.mapDisplay, 'visible', `${gate.id} should appear on normal maps`);
  assertCoordinate(gate.coordinate, `${gate.id}.coordinate`);
  assertInsideBounds(gate.coordinate, `${gate.id}.coordinate`);
}

function assertRasta(rasta: Rasta): void {
  const padded = String(rasta.number).padStart(2, '0');
  assert.equal(rasta.id, `R${rasta.number}`, `${rasta.id} must match rasta number`);
  assertLabel(rasta.name, rasta.id);
  assert.equal(rasta.visual.label, `Rasta ${padded}`, `${rasta.id} visual label`);
  assert(rasta.aliases.includes(`Rasta ${padded}`), `${rasta.id} needs padded alias`);
  assert(rasta.aliases.includes(`Rasta ${rasta.number}`), `${rasta.id} needs unpadded alias`);
  assert(rasta.aliases.includes(`R${rasta.number}`), `${rasta.id} needs short alias`);
  assert(rasta.aliases.includes(`راستہ ${rasta.number}`), `${rasta.id} needs Urdu alias`);
  assert(!internalPointIdPattern.test(rasta.visual.label), `${rasta.id} visual label must not expose internal point IDs`);

  rasta.points.forEach((point, index) => {
    const expectedPointId = `${rasta.id}-${String(index + 1).padStart(2, '0')}`;
    assert.equal(point.id, expectedPointId, `${rasta.id} point ${index + 1} must be normalized`);
    assert.equal(point.sequence, index + 1, `${point.id} sequence`);
    assertLabel(point.name, point.id);
    assert(!internalPointIdPattern.test(point.name.en), `${point.id} normal label must not expose internal point ID`);
    assert(point.developerLabel?.includes(point.id), `${point.id} developer label should expose internal ID`);
    assertCoordinate(point.coordinate, `${point.id}.coordinate`);
    assertInsideBounds(point.coordinate, `${point.id}.coordinate`);
  });
}

function assertSpecialRoute(route: SpecialRoute): void {
  assertLabel(route.name, route.id);
  assert(route.aliases.length > 0, `${route.id} must have aliases`);
  assert(!internalPointIdPattern.test(route.visual.label), `${route.id} visual label must not expose internal point IDs`);
  route.points.forEach((point, index) => {
    assert.equal(point.sequence, index + 1, `${point.id} sequence`);
    assertLabel(point.name, point.id);
    assert(!internalPointIdPattern.test(point.name.en), `${point.id} normal label must not expose internal point ID`);
    assert(point.developerLabel?.includes(point.id), `${point.id} developer label should expose internal ID`);
    assertCoordinate(point.coordinate, `${point.id}.coordinate`);
    assertInsideBounds(point.coordinate, `${point.id}.coordinate`);
  });
}

assert.equal(IJTEMA_BLOCKS.length, 42, 'Exactly 42 block records must exist');
IJTEMA_BLOCKS.forEach(assertBlock);
assertNoDuplicateIds(IJTEMA_BLOCKS.map((block) => block.id), 'block');

assert.equal(IJTEMA_GATES.length, 18, 'Only 18 active gates from latest dataset must exist');
assert.equal(IJTEMA_GATES.filter((gate) => gate.status !== 'missing_coordinate').length, 18, 'All active gates must have supplied coordinates');
assert.equal(IJTEMA_GATES.filter((gate) => gate.status === 'missing_coordinate').length, 0, 'No active gate should stay missing-coordinate');
assert.equal(IJTEMA_GATES.filter((gate) => gate.routingStatus === 'routable').length, 18, 'All active gates must be eligible for graph-connector validation');
assert.equal(IJTEMA_GATES.filter((gate) => gate.routingStatus === 'missing_coordinate').length, 0, 'No active gate should remain missing-coordinate');
assert.equal(IJTEMA_GATES.filter((gate) => gate.canStartRouteFromOutside).length, 16, 'Only field-connectivity-eligible active gates may support outside-start resolution');
assert.equal(IJTEMA_GATES.find((gate) => gate.number === 19)?.connectorStatus, 'ground_truth_required', 'Gate19 must remain deferred pending physical connectivity evidence');
assert.equal(IJTEMA_GATES.find((gate) => gate.number === 19)?.canStartRouteFromOutside, false, 'Gate19 must not silently become an outside-start gate');
activeGateNumbers.forEach((number) => assert(IJTEMA_GATES.some((gate) => gate.number === number && gate.status !== 'missing_coordinate'), `Gate ${number} must be active`));
nonexistentGateNumbers.forEach((number) => assert(!IJTEMA_GATES.some((gate) => gate.number === number), `Gate ${number} must be excluded as nonexistent`));
assert.equal(IJTEMA_GATES.find((gate) => gate.number === 13)?.status, 'provided', 'Gate 13 must use the verified coordinate, no longer needs_verification');
assert.equal(IJTEMA_GATES.find((gate) => gate.number === 14)?.status, 'provided', 'Gate 14 must use the verified coordinate, no longer needs_verification');
assert.deepEqual(IJTEMA_GATES.find((gate) => gate.number === 12)?.coordinate, { lat: 24.963676, lng: 67.006339 }, 'Gate 12 must use the project-owner-verified coordinate');
assert.deepEqual(IJTEMA_GATES.find((gate) => gate.number === 13)?.coordinate, { lat: 24.963718, lng: 67.006862 }, 'Gate 13 must use the project-owner-verified coordinate');
assert.deepEqual(IJTEMA_GATES.find((gate) => gate.number === 14)?.coordinate, { lat: 24.965516, lng: 67.007675 }, 'Gate 14 must use the project-owner-verified coordinate');
assert.equal(IJTEMA_GATES.find((gate) => gate.number === 12)?.status, 'provided', 'Gate 12 must be a normal provided gate, not needs_verification');
{
  const gate12Coordinate = IJTEMA_GATES.find((gate) => gate.number === 12)?.coordinate;
  const gate13Coordinate = IJTEMA_GATES.find((gate) => gate.number === 13)?.coordinate;
  const gate14Coordinate = IJTEMA_GATES.find((gate) => gate.number === 14)?.coordinate;
  assert.ok(gate12Coordinate && gate13Coordinate && gate14Coordinate, 'Gate 12, Gate 13, and Gate 14 must all have coordinates for the identity check');
  const gate12To13M = distanceMeters(gate12Coordinate!, gate13Coordinate!);
  const gate12To14M = distanceMeters(gate12Coordinate!, gate14Coordinate!);
  const gate13To14M = distanceMeters(gate13Coordinate!, gate14Coordinate!);
  assert.ok(gate12To13M > 50, `Gate 12 and Gate 13 must be distinct, routable locations, not near-duplicates (only ${gate12To13M.toFixed(1)}m apart)`);
  assert.ok(gate12To14M > 50, `Gate 12 and Gate 14 must be distinct, routable locations, not near-duplicates (only ${gate12To14M.toFixed(1)}m apart)`);
  assert.ok(gate13To14M > 50, `Gate 13 and Gate 14 must be distinct, routable locations, not near-duplicates (only ${gate13To14M.toFixed(1)}m apart)`);
}
assert.deepEqual(IJTEMA_GATES.find((gate) => gate.number === 15)?.coordinate, { lat: 24.968126, lng: 67.008578 }, 'Gate 15 must use latest coordinate');
IJTEMA_GATES.forEach(assertGate);
assertNoDuplicateIds(IJTEMA_GATES.map((gate) => gate.id), 'gate');

const routableOfficialGates = getRoutableOfficialGates();
const connectedProvidedGateNumbers = IJTEMA_GATES.filter(
  (gate) => gate.routingStatus === 'routable' && gate.coordinate && hasGraphConnection(gate),
)
  .map((gate) => gate.number)
  .sort((a, b) => a - b);
assert.equal(routableOfficialGates.length, connectedProvidedGateNumbers.length, 'Routable official gate helper must return only connected provided gates');
assert(routableOfficialGates.every((gate) => gate.routingStatus === 'routable' && gate.coordinate), 'Routable official gate helper must not include missing gates');
assert(
  routableOfficialGates.every(hasGraphConnection),
  'Routable official gate helper must not include disconnected gates',
);
assert.deepEqual(
  getNormalUserSearchableGates().map((gate) => gate.number).sort((a, b) => a - b),
  connectedProvidedGateNumbers,
  'Normal user search must not present missing or disconnected gates as routable destinations',
);
const nearestGate = findNearestOfficialEntryGate({ lat: 24.9755, lng: 67.0147 });
assert(nearestGate, 'Nearest-entry-gate helper must exist for outside-user routing');
assert.equal(nearestGate.routingStatus, 'routable', 'Nearest-entry-gate helper must only return routable gates');
assert(nearestGate.coordinate, 'Nearest-entry-gate helper must not return missing-coordinate gates');
assert.equal(IJTEMA_OFFICIAL_ENTRY_POLICY.outsideUser.mustEnterThroughOfficialGate, true, 'Outside-user rule must require official entry gate first');
assert.equal(IJTEMA_OFFICIAL_ENTRY_POLICY.outsideUser.mustNotSnapDirectlyToInternalGraph, true, 'Outside-user rule must forbid direct internal graph snapping');
assert.equal(IJTEMA_OFFICIAL_ENTRY_POLICY.outsideUser.internalRouteStartsFromSelectedGate, true, 'Outside-user internal route must begin at selected/nearest gate');
assert.equal(IJTEMA_OFFICIAL_ENTRY_POLICY.insideUser.maySnapToInternalGraph, true, 'Inside-user rule must allow internal graph snapping');
assert(
  outsideRoutingDoc.includes('Outside users must enter through an official gate'),
  'Outside-user routing rule must be documented with the official gate flow',
);
assert(
  outsideRoutingDoc.includes('Inside users may snap directly to the internal graph'),
  'Inside-user routing rule must be documented with the internal graph flow',
);
assert(
  outsideRoutingDoc.includes('A gate with no confirmed coordinate must never be offered as a routable entry choice'),
  'Outside-user routing documentation must prohibit missing-coordinate gate suggestions',
);

assert.equal(IJTEMA_RASTAS.length, 11, 'Rasta 01-11 must exist');
IJTEMA_RASTAS.forEach(assertRasta);
assertNoDuplicateIds(IJTEMA_RASTAS.map((rasta) => rasta.id), 'rasta');
assertNoDuplicateIds(IJTEMA_RASTAS.flatMap((rasta) => rasta.points.map((point) => point.id)), 'rasta point');
const rasta9 = IJTEMA_RASTAS.find((rasta) => rasta.id === 'R9');
assert(rasta9, 'Rasta 09 must exist');
assert.deepEqual(rasta9.points.map((point) => point.id), ['R9-01', 'R9-02', 'R9-03', 'R9-04', 'R9-05', 'R9-06', 'R9-07', 'R9-08', 'R9-09'], 'Rasta 09 points must be normalized to R9 IDs');

const specialRouteIds = IJTEMA_SPECIAL_ROUTES.map((route) => route.id);
assert(specialRouteIds.includes('SHAHR_E_PINDAL_NORTH'), 'Shahr-e-Pindal North route must exist');
assert(specialRouteIds.includes('SHAHR_E_PINDAL_SOUTH'), 'Shahr-e-Pindal South route must exist');
assert(specialRouteIds.includes('SHAHR_E_PINDAL_WEST'), 'Shahr-e-Pindal West route must exist');
assert.equal(IJTEMA_SPECIAL_ROUTES.find((route) => route.id === 'SHAHR_E_PINDAL_NORTH')?.name.en, 'Shahr-e-Pindal North', 'North route must have exact user-facing English name');
assert.equal(IJTEMA_SPECIAL_ROUTES.find((route) => route.id === 'SHAHR_E_PINDAL_SOUTH')?.name.en, 'Shahr-e-Pindal South', 'South route must have exact user-facing English name');
assert.equal(IJTEMA_SPECIAL_ROUTES.find((route) => route.id === 'SHAHR_E_PINDAL_WEST')?.name.en, 'Shahr-e-Pindal West', 'West route must have exact user-facing English name');
assert.equal(IJTEMA_SPECIAL_ROUTES.find((route) => route.id === 'SHAHR_E_PINDAL_NORTH')?.name.ur, 'شہرِ پنڈال شمال', 'North route must have exact Urdu name');
assert.equal(IJTEMA_SPECIAL_ROUTES.find((route) => route.id === 'SHAHR_E_PINDAL_SOUTH')?.name.ur, 'شہرِ پنڈال جنوب', 'South route must have exact Urdu name');
assert.equal(IJTEMA_SPECIAL_ROUTES.find((route) => route.id === 'SHAHR_E_PINDAL_WEST')?.name.ur, 'شہرِ پنڈال مغرب', 'West route must have exact Urdu name');
IJTEMA_SPECIAL_ROUTES.forEach(assertSpecialRoute);
assertNoDuplicateIds(specialRouteIds, 'special route');
assertNoDuplicateIds(IJTEMA_SPECIAL_ROUTES.flatMap((route) => route.points.map((point) => point.id)), 'special route point');
const spwpRoute = IJTEMA_SPECIAL_ROUTES.find((route) => route.id === 'SHAHR_E_PINDAL_WEST');
assert(spwpRoute?.aliases.includes('PRP'), 'Shahr-e-Pindal West must expose PRP alias');
assert(spwpRoute?.aliases.includes('Paidal Rasta'), 'Shahr-e-Pindal West must expose Paidal Rasta alias');

assert.equal(IJTEMA_CENTRAL_POINTS.length, 12, 'P1-P12 central points must exist');
IJTEMA_CENTRAL_POINTS.forEach((point) => {
  assertLabel(point.name, point.id);
  assert(!internalPointIdPattern.test(point.name.en), `${point.id} normal label must not expose internal point ID`);
  assert.equal(point.developerLabel, point.id, `${point.id} developer label should expose internal ID`);
  assertCoordinate(point.coordinate, `${point.id}.coordinate`);
  assertInsideBounds(point.coordinate, `${point.id}.coordinate`);
});
assertNoDuplicateIds(IJTEMA_CENTRAL_POINTS.map((point) => point.id), 'central point');

assertIssueDocumented('RASTA_09_SOURCE_POINT_ID_TYPO');
assertIssueDocumented('SPNP_03_DUPLICATE_SOURCE_ID');
assertIssueDocumented('GATE_13_14_NEAR_DUPLICATE');
assertIssueDocumented('POLYGON_CORNER_ORDER_NORMALIZED');

const b24 = IJTEMA_BLOCKS.find((block) => block.id === 'B24');
assert(b24, 'B24 must exist');
assert.deepEqual(b24.center, { lat: 24.9668611, lng: 67.0056111 }, 'B24 center must match corrected dataset');
assert.deepEqual(b24.entryPoints.c2, { lat: 24.966382, lng: 67.006228 }, 'B24 C2 must match corrected dataset');
assert.deepEqual(b24.entryPoints.c3, { lat: 24.967281, lng: 67.005029 }, 'B24 C3 must match corrected dataset');

const allIds = [
  ...IJTEMA_BLOCKS.map((block) => block.id),
  ...IJTEMA_GATES.map((gate) => gate.id),
  ...IJTEMA_RASTAS.map((rasta) => rasta.id),
  ...IJTEMA_RASTAS.flatMap((rasta) => rasta.points.map((point) => point.id)),
  ...IJTEMA_SPECIAL_ROUTES.map((route) => route.id),
  ...IJTEMA_SPECIAL_ROUTES.flatMap((route) => route.points.map((point) => point.id)),
  ...IJTEMA_CENTRAL_POINTS.map((point) => point.id),
];
assertNoDuplicateIds(allIds, 'global v2 data');

console.log(
  `Ijtema v2 map data checks passed: ${IJTEMA_BLOCKS.length} blocks, ${IJTEMA_GATES.length} gates, ${IJTEMA_RASTAS.length} rastas, ${IJTEMA_SPECIAL_ROUTES.length} special routes, ${IJTEMA_CENTRAL_POINTS.length} central points.`,
);
