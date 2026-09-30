import { IJTEMA_NAVIGATION_GRAPH_V2 } from '../data/ijtema/navigationGraph';
import { RoutingServiceV2 } from '../services/RoutingServiceV2';
import { V2NavigationAdapter } from '../services/V2NavigationAdapter';
import { V2PlaceAdapter } from '../services/V2PlaceAdapter';
import { buildV2RerouteRequest } from '../services/V2NavigationRuntimeService';

const preview = RoutingServiceV2.calculateRoute({ start: { type: 'gate', gateId: 'GATE_13' },
  destination: { type: 'block', blockId: 'B1' } })!;
const route = V2NavigationAdapter.fromPreview({ previewRoute: preview,
  destination: V2PlaceAdapter.getPlaceById('B1')! });
const previous = route.nodes.map(id => IJTEMA_NAVIGATION_GRAPH_V2.nodes[id])
  .find(node => ['rasta_point', 'special_route_point', 'central_point'].includes(node.type))!;
const previousSnapCoordinate = { latitude: previous.coordinate.lat, longitude: previous.coordinate.lng };
const build = buildV2RerouteRequest;

test('internal reroute carries the prior walkable node from this route only', () => {
  const request = build({ route, coordinate: previousSnapCoordinate, previousSnapCoordinate, walkingSpeedMs: 1.4 });
  expect(request.start).toMatchObject({ type: 'inside_coordinate', previousNodeId: previous.id });
});

test('outside reroute keeps automatic gate policy without prior-node bias', () => {
  const request = build({ route, coordinate: { latitude: 24.98, longitude: 67.03 }, previousSnapCoordinate, walkingSpeedMs: 1.4 });
  expect(request.start.type).toBe('outside_coordinate');
  expect(request.start).not.toHaveProperty('previousNodeId');
});

test('invalid prior coordinates cannot introduce snap history', () => {
  const request = build({ route, coordinate: previousSnapCoordinate,
    previousSnapCoordinate: { latitude: NaN, longitude: 67 }, walkingSpeedMs: 1.4 });
  expect(request.start).not.toHaveProperty('previousNodeId');
});
