/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';
import type { Coordinate, Place, V2ActiveRoute } from '../models/types';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook } from './test-utils';

const initialStoreState = useAppStore.getState();
const coordinates: Coordinate[] = [
  { latitude: 24.965, longitude: 67.0041 },
  // This early leg passes about 10m from the destination, then turns away.
  { latitude: 24.966, longitude: 67.0041 },
  { latitude: 24.967, longitude: 67.006 },
  { latitude: 24.966, longitude: 67.006 },
  { latitude: 24.966, longitude: 67.004 },
];
const destination: Place = {
  id: 'arrival-loop', name: 'Loop destination', category: 'Block',
  description: 'Synthetic route fixture', coordinate: coordinates[4], sourceVersion: 'v2',
};
const totalDistanceM = coordinates.slice(1).reduce(
  (total, coordinate, index) => total + getDistance(coordinates[index], coordinate), 0,
);
const route: V2ActiveRoute = {
  id: 'arrival-loop', routeId: 'arrival-loop', sourceVersion: 'v2',
  coordinates, nodes: [], segments: [], edges: [],
  totalDistance: totalDistanceM, totalDistanceM, estimatedTimeMin: 10, etaMinutes: 10,
  origin: { coordinate: coordinates[0], label: 'Start', type: 'inside_snap' },
  destination: { coordinate: coordinates[4], label: destination.name, type: 'block', blockId: destination.id },
  metadata: { startedOutside: false, usesOfficialGateEntry: false, graphVersion: 'synthetic' },
  instructions: coordinates.slice(1).map((coordinate, index) => ({
    id: `step-${index}`, text: index === 3 ? 'Arrive' : 'Continue',
    type: index === 3 ? 'arrival' : 'straight', coordinate, routeIndex: index + 1,
    distance: getDistance(coordinates[index], coordinate),
    distanceM: getDistance(coordinates[index], coordinate),
  })),
};

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  useAppStore.setState({ settings: { ...initialStoreState.settings, autoReroute: false } });
  useAppStore.getState().startNavigation(destination, route, route.instructions);
});

async function publish(coordinate: Coordinate) {
  await act(async () => {
    useAppStore.setState({
      currentLocation: { ...coordinate, accuracy: 5, observedAtMs: Date.now() },
      currentLocationSource: 'live',
    });
  });
}

describe('V2 arrival requires final-leg progress (#95)', () => {
  test('passing within 20m on an early leg does not report arrival', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await publish(coordinates[1]);
    expect(hook.result.current.currentStepIndex).toBeLessThan(route.instructions.length - 1);
    expect(hook.result.current.remainingDistance).toBeGreaterThan(300);
    expect(hook.result.current.arrived).toBe(false);
  });

  test('a fresh fix on the final leg within 20m still reports arrival', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await publish({ latitude: 24.966, longitude: 67.00405 });
    expect(hook.result.current.currentStepIndex).toBe(route.instructions.length - 1);
    expect(hook.result.current.arrived).toBe(true);
  });

  test('final-leg progress alone does not report arrival outside 20m', async () => {
    const hook = await renderHook(() => useNavigationViewModelV2());
    await publish({ latitude: 24.966, longitude: 67.0045 });
    expect(hook.result.current.currentStepIndex).toBe(route.instructions.length - 1);
    expect(hook.result.current.arrived).toBe(false);
  });
});

// Production keeps a final edge instruction and a zero-distance arrival marker
// at the same endpoint. Reaching the final edge is sufficient for the 20m rule.
test('production-shaped final edge accepts proximity before the terminal arrival marker', async () => {
  const lastInstruction = route.instructions[route.instructions.length - 1];
  const productionRoute: V2ActiveRoute = {
    ...route,
    instructions: [
      ...route.instructions.slice(0, -1),
      { ...lastInstruction, type: 'straight', text: 'Walk the final edge' },
      { ...lastInstruction, id: 'arrival', distance: 0, distanceM: 0 },
    ],
  };
  useAppStore.getState().startNavigation(destination, productionRoute, productionRoute.instructions);
  const hook = await renderHook(() => useNavigationViewModelV2());
  await publish({ latitude: 24.966, longitude: 67.00405 });
  expect(hook.result.current.currentStepIndex).toBe(productionRoute.instructions.length - 2);
  expect(hook.result.current.arrived).toBe(true);
});
