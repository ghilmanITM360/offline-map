import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { RerouteService } from '../src/services/RerouteService';

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
const farther = { latitude: 24.9685, longitude: 67.0003 };

assert(RerouteService.isOffRoute(nearLine, route as any, 5) === false, 'Expected near point to stay on route');
assert(RerouteService.isOffRoute(farther, route as any, 5) === true, 'Expected farther point to be off route in strong GPS');
assert(RerouteService.isOffRoute(farther, route as any, 50) === false, 'Expected weak GPS to widen reroute tolerance');

const directions = readFileSync('src/views/screens/DirectionsScreen.tsx', 'utf8');
const navVm = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const navScreen = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');

assert(directions.includes('Use My Current Location'), 'Directions should offer Use My Current Location');
assert(directions.includes('Choose starting point'), 'Directions should show Choose starting point fallback');
assert(navVm.includes('REROUTE_COOLDOWN_MS'), 'Navigation should include reroute cooldown to avoid loops');
assert(navScreen.includes('Weak GPS signal detected'), 'Navigation UI should show weak GPS warning');

console.log('GPS fallback checks passed.');
