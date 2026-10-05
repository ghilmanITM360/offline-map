/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// #307: the Route Guide is the honest manual mode — a route from a chosen FROM to a chosen TO that the user
// follows by reading steps. It is not a navigation session: no live position, progress, reroute or arrival,
// so it must never set isNavigating, never write a marker and never touch currentLocation.

import type { Place } from '../models/types';
import { useAppStore } from '../store/useAppStore';

const initialStoreState = useAppStore.getState();
const steps = [
  { text: 'Walk along Rasta 1', distanceM: 60 },
  { text: 'Turn right onto Rasta 4', distanceM: 40 },
  { text: 'Arrive at Block 2', distanceM: 0 },
];
const place: Place = {
  id: 'B2', name: 'Block 2', category: 'Block', description: 'Block 2',
  coordinate: { latitude: 24.966, longitude: 67.004 }, sourceVersion: 'v2',
};

beforeEach(() => useAppStore.setState(initialStoreState, true));

describe('route guide state', () => {
  test('starts empty', () => {
    expect(useAppStore.getState().routeGuide).toBeNull();
  });

  test('startRouteGuide opens the guide at the first step without starting navigation or faking a position', () => {
    useAppStore.setState({ currentLocation: null, currentLocationSource: null });
    useAppStore.getState().startRouteGuide(steps);
    const s = useAppStore.getState();
    expect(s.routeGuide).toEqual({ steps, stepIndex: 0 });
    expect(s.isNavigating).toBe(false);
    expect(s.unfinishedJourney).toBeNull();
    expect(s.currentLocation).toBeNull();
    expect(s.navigationSessionId).toBe(0);
  });

  test('an empty step list does not open a guide', () => {
    useAppStore.getState().startRouteGuide([]);
    expect(useAppStore.getState().routeGuide).toBeNull();
  });

  test('stepping is clamped to the real steps', () => {
    const { startRouteGuide, setRouteGuideStep } = useAppStore.getState();
    startRouteGuide(steps);
    setRouteGuideStep(99);
    expect(useAppStore.getState().routeGuide?.stepIndex).toBe(2);
    setRouteGuideStep(-4);
    expect(useAppStore.getState().routeGuide?.stepIndex).toBe(0);
  });

  test('stepping with no guide open is a no-op', () => {
    useAppStore.getState().setRouteGuideStep(1);
    expect(useAppStore.getState().routeGuide).toBeNull();
  });

  test('endRouteGuide, cancelling the route and starting live navigation all close the guide', () => {
    const s = useAppStore.getState();
    s.startRouteGuide(steps);
    s.endRouteGuide();
    expect(useAppStore.getState().routeGuide).toBeNull();

    s.startRouteGuide(steps);
    s.clearRoutePlanner();
    expect(useAppStore.getState().routeGuide).toBeNull();

    s.startRouteGuide(steps);
    s.startNavigation(place, null, []);
    expect(useAppStore.getState().routeGuide).toBeNull();
    expect(useAppStore.getState().isNavigating).toBe(true);

    s.startRouteGuide(steps);
    s.stopNavigation();
    expect(useAppStore.getState().routeGuide).toBeNull();
  });
});
