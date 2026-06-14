import { strict as assert } from 'node:assert';
import { IJTEMA_GATES, IJTEMA_NAVIGATION_GRAPH_V2 } from '../src/data/ijtema';
import { EntryGateRoutingService } from '../src/services/EntryGateRoutingService';

const outsideWest = { latitude: 24.9696, longitude: 66.9967 };
const outsideDeclaredInsideBounds = { latitude: 24.9696, longitude: 66.9975 };
const outsideNearDisconnectedGate18 = { latitude: 24.9762, longitude: 67.0149 };
const insideRasta = { latitude: 24.9694, longitude: 67.0039 };

const outsideStart = EntryGateRoutingService.resolveRouteStartForUser(outsideWest);
assert.equal(outsideStart.mode, 'outside', 'outside coordinate must resolve through official gate mode');
assert.equal(outsideStart.startType, 'nearest_official_gate', 'outside coordinate must use nearest official gate start');
assert(outsideStart.gate, 'outside coordinate should return nearest official gate');
assert.equal(outsideStart.gate?.routingStatus, 'routable', 'outside nearest gate must be routable');
assert(outsideStart.candidateNodes.every((nodeId) => nodeId.startsWith('GATE_')), 'outside coordinate must not snap directly to internal rasta nodes');

const insideStart = EntryGateRoutingService.resolveRouteStartForUser(insideRasta);
assert.equal(insideStart.mode, 'inside', 'inside coordinate must resolve as inside mode');
assert.equal(insideStart.startType, 'internal_snap', 'inside coordinate should use internal snap');
assert(!insideStart.gate, 'inside coordinate should not force official gate first');
assert(insideStart.candidateNodes.length > 0, 'inside coordinate should return internal candidate nodes');
assert(insideStart.candidateNodes.every((nodeId) => !nodeId.startsWith('GATE_')), 'inside coordinate should not start from entry gate');
const insideSnapNode = IJTEMA_NAVIGATION_GRAPH_V2.nodes[insideStart.candidateNodes[0]];
assert(insideSnapNode, 'inside coordinate should resolve to a real graph node');
assert.equal(insideStart.coordinate.latitude, insideSnapNode.coordinate.lat, 'inside coordinate must snap to resolved graph latitude');
assert.equal(insideStart.coordinate.longitude, insideSnapNode.coordinate.lng, 'inside coordinate must snap to resolved graph longitude');

const manualGateStart = EntryGateRoutingService.resolveRouteStartForUser(outsideWest, { manualGateId: 'GATE_05' });
assert.equal(manualGateStart.mode, 'outside', 'manual gate outside start should remain outside flow');
assert.equal(manualGateStart.startType, 'selected_official_gate', 'manual routable gate should be accepted');
assert.equal(manualGateStart.gate?.id, 'GATE_05', 'manual routable gate should be selected');
assert.deepEqual(manualGateStart.candidateNodes, ['GATE_05'], 'manual routable gate should be the only start candidate');

const missingGateStart = EntryGateRoutingService.resolveRouteStartForUser(outsideWest, { manualGateId: 'GATE_06' });
assert.equal(missingGateStart.mode, 'outside', 'nonexistent manual gate keeps outside flow');
assert.equal(missingGateStart.startType, 'unresolved', 'nonexistent manual gate must not resolve');
assert.equal(missingGateStart.candidateNodes.length, 0, 'nonexistent manual gate must not be a start candidate');
assert(missingGateStart.error?.includes('not routable'), 'nonexistent manual gate should explain non-routable status');

const gate15Start = EntryGateRoutingService.resolveRouteStartForUser(outsideWest, { manualGateId: 'GATE_15' });
assert.equal(gate15Start.startType, 'selected_official_gate', 'manual Gate 15 must be accepted');
assert.equal(gate15Start.gate?.id, 'GATE_15', 'manual Gate 15 must resolve to Gate 15');

const forcedOutsideStart = EntryGateRoutingService.resolveRouteStartForUser(outsideDeclaredInsideBounds, { forceOutside: true });
assert.equal(forcedOutsideStart.mode, 'outside', 'forced outside coordinate inside broad bounds must remain outside flow');
assert.equal(forcedOutsideStart.startType, 'nearest_official_gate', 'forced outside coordinate must use official gate start');
assert(forcedOutsideStart.candidateNodes.every((nodeId) => nodeId.startsWith('GATE_')), 'forced outside coordinate must not snap directly to internal graph');

const disconnectedGateStart = EntryGateRoutingService.resolveRouteStartForUser(outsideWest, { manualGateId: 'GATE_18' });
assert.equal(disconnectedGateStart.startType, 'unresolved', 'manual isolated gate must not resolve as a usable route start');
assert.equal(disconnectedGateStart.candidateNodes.length, 0, 'manual isolated gate must not be a start candidate');
assert(disconnectedGateStart.error?.includes('not connected'), 'manual isolated gate should explain graph connectivity status');

const outsideNearDisconnectedGateStart = EntryGateRoutingService.resolveRouteStartForUser(outsideNearDisconnectedGate18, { forceOutside: true });
assert.equal(outsideNearDisconnectedGateStart.mode, 'outside', 'outside near isolated gate keeps outside flow');
assert.notEqual(outsideNearDisconnectedGateStart.gate?.id, 'GATE_18', 'outside nearest helper must skip isolated gates');
assert(
  outsideNearDisconnectedGateStart.candidateNodes.every((nodeId) => (IJTEMA_NAVIGATION_GRAPH_V2.adjacency[nodeId] ?? []).length > 0),
  'outside nearest helper must return connected gate candidates',
);

const nearestGate = EntryGateRoutingService.findNearestOfficialEntryGateForOutsideUser(outsideWest);
assert(nearestGate, 'nearest gate helper must return a routable gate for outside user');
assert.equal(nearestGate.routingStatus, 'routable', 'nearest gate helper must only return routable gates');
assert.notEqual(nearestGate.id, 'GATE_06', 'nearest gate helper must not return nonexistent gates');

const missingGateNumbers = IJTEMA_GATES.filter((gate) => gate.routingStatus === 'missing_coordinate').map((gate) => gate.number);
assert.deepEqual(missingGateNumbers, [], 'active gate list must not keep missing-coordinate placeholders');

console.log('Entry gate routing checks passed.');
