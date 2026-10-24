import { createNavigationController } from '@muslim-ummah/offline-navigation';
import {
  describeRouteStep, ENGLISH_ROUTE_STEP_COPY, formatDistance, type RouteStepCopy,
} from '@muslim-ummah/offline-navigation/ui';
import { testVenue } from './sdkTestVenue';

const step = (kind: 'depart' | 'turn_left' | 'turn_right' | 'arrive', distanceM: number) =>
  ({ kind, nodeId: 'a', toNodeId: 'b', distanceM }) as const;

describe('formatDistance', () => {
  it.each([
    [56.4, '56 m'],
    [0, '0 m'],
    [999.4, '999 m'],
    [999.6, '1.0 km'], // never "1000 m"
    [1000, '1.0 km'],
    [1549, '1.5 km'],
    [12_340, '12.3 km'],
  ])('%s m is %s', (m, expected) => {
    expect(formatDistance(m, ENGLISH_ROUTE_STEP_COPY)).toBe(expected);
  });

  it.each([NaN, Infinity, -5])('%s is not a distance, so none is shown', (m) => {
    expect(formatDistance(m, ENGLISH_ROUTE_STEP_COPY)).toBeNull();
  });
});

describe('describeRouteStep', () => {
  it('maps each step kind to the guide card props, with the distance of the walk', () => {
    const d = (s: ReturnType<typeof step>) => describeRouteStep(s, ENGLISH_ROUTE_STEP_COPY, 'Annex');
    expect(d(step('depart', 56))).toEqual({ instruction: 'Start walking', distance: '56 m' });
    expect(d(step('turn_left', 61))).toEqual({ instruction: 'Turn left', distance: '61 m' });
    expect(d(step('turn_right', 1549))).toEqual({ instruction: 'Turn right', distance: '1.5 km' });
  });

  it('arrival names the destination and has no distance', () => {
    expect(describeRouteStep(step('arrive', 0), ENGLISH_ROUTE_STEP_COPY, 'Annex')).toEqual({
      instruction: 'You have arrived at Annex', distance: null,
    });
  });

  it('uses host copy verbatim, so another language is just another object', () => {
    const host: RouteStepCopy = {
      depart: 'D!', turnLeft: 'L!', turnRight: 'R!', arrive: (name) => `A:${name}`,
      meters: (n) => `${n}M`, kilometers: (km) => `${km}K`,
    };
    expect(describeRouteStep(step('turn_right', 61), host, 'X')).toEqual({ instruction: 'R!', distance: '61M' });
    expect(describeRouteStep(step('arrive', 0), host, 'X')).toEqual({ instruction: 'A:X', distance: null });
    expect(formatDistance(2500, host)).toBe('2.5K');
  });

  it('describes every step of a real controller route', async () => {
    const c = createNavigationController({ venue: testVenue });
    c.selectDestination('annex');
    c.selectOrigin('lobby');
    const steps = c.getState().route!.steps.map((s) => describeRouteStep(s, ENGLISH_ROUTE_STEP_COPY, 'Annex'));
    expect(steps).toEqual([
      { instruction: 'Start walking', distance: '56 m' },
      { instruction: 'Turn right', distance: '61 m' },
      { instruction: 'You have arrived at Annex', distance: null },
    ]);
  });
});
