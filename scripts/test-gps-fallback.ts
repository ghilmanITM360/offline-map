import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { RerouteService } from '../src/services/RerouteService';
import { SnapToRoadService } from '../src/services/SnapToRoadService';
import { IJTEMA_DATA } from '../src/constants/data';

const route = {
  id: 'test',
  coordinates: [
    { latitude: 24.968, longitude: 67.0 },
    { latitude: 24.969, longitude: 67.0 },
  ],
  nodes: ['A', 'B'],
  totalDistance: 100,
  estimatedTimeMin: 2,
  segments: [],
};

const nearLine = { latitude: 24.9685, longitude: 67.0002 };
const farther = { latitude: 24.9685, longitude: 67.00045 };

assert(RerouteService.isOffRoute(nearLine, route as any, 5) === false, 'Expected near point to stay on route');
assert(RerouteService.isOffRoute(farther, route as any, 5) === true, 'Expected farther point to be off route in strong GPS');
assert(RerouteService.isOffRoute(farther, route as any, 50) === false, 'Expected weak GPS to widen reroute tolerance');

const directions = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const navVm = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const navChrome = readFileSync('src/views/components/navigation/NavigationChromeV1.tsx', 'utf8');
const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');

assert(directions.includes('Use my current location'), 'Directions should offer current-location start action');
assert(directions.includes('Choose start manually'), 'Directions should keep manual-start fallback');
assert(directions.includes('Find best eligible official gate automatically'), 'Directions should explain destination-aware outside-location gate selection');
assert(navVm.includes('REROUTE_COOLDOWN_MS'), 'Navigation should include reroute cooldown to avoid loops');
assert(navVm.includes('OFF_ROUTE_CONSECUTIVE_REQUIRED'), 'Navigation should require consecutive off-route samples before rerouting');
assert(navVm.includes('MIN_MOVEMENT_FOR_REROUTE_M'), 'Navigation should block reroutes when movement is too small');
assert(navVm.includes('OFF_ROUTE_PENDING_MS'), 'Navigation should wait before rerouting when off-route is uncertain');
assert(navVm.includes('projectProgressMetersOnRoute'), 'Navigation should project user progress on active route');
assert(navVm.includes('holdRouteForWeakGps'), 'Navigation should hold route stable when GPS accuracy is poor');
assert(navVm.includes('continuing current route'), 'Navigation should preserve current route when candidate reroute fails');
assert(navChrome.includes('Weak GPS signal detected'), 'Navigation UI should show weak GPS warning');
// Navigation now runs on HomeScreen's single persistent MapView, so the "map still loading"
// state is HomeScreen's own cold-start overlay, not a nav-specific one.
assert(homeScreenSource.includes('Loading map...'), 'Home map should show a loading state instead of a blank map');

const c2BoundaryPoint = {
  latitude: IJTEMA_DATA.nodes.C2.lat,
  longitude: IJTEMA_DATA.nodes.C2.lng,
};
const resolvedBoundaryStart = SnapToRoadService.resolveRoutingNode(c2BoundaryPoint);
const resolvedBoundaryNode = IJTEMA_DATA.nodes[resolvedBoundaryStart.nodeId];
assert(
  !!resolvedBoundaryNode && !resolvedBoundaryNode.nearestRoadNode,
  'Boundary reroute resolution must return an on-graph road node, not an off-graph landmark gate',
);

console.log('GPS fallback checks passed.');
