import { getDistance } from 'geolib';
import { seedRunningNavigation } from './navigationFixture';
import type { Coordinate, Place, V2ActiveRoute } from '../models/types';
import { VoiceService } from '../services/VoiceService';
import { ARRIVAL_THRESHOLD_METERS } from '../constants/navigation';
import { useAppStore } from '../store/useAppStore';
import { useNavigationViewModelV2 } from '../viewmodels/NavigationViewModelV2';
import { act, renderHook } from './test-utils';

// A5-03 characterization. These tests PIN the current arrival policy so a future change is a conscious, field-driven
// decision. They are not a statement that the policy is right: arrival is a raw 20 m radius around the route destination,
// the fix's reported accuracy (accepted up to 50 m) is ignored, and the first qualifying fix latches for the session.
// Field calibration and an owner-approved policy are still required: the only evidence for arrival behaviour is
// automated Jest tests (UX_ACCEPTANCE_EVIDENCE.md); no emulator, physical-device or field walk covers this policy.

jest.setTimeout(15_000);

const initialStoreState = useAppStore.getState();
const M_PER_DEG_LAT = 111_320;
const START: Coordinate = { latitude: 24.985, longitude: 67.02 };
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((START.latitude * Math.PI) / 180);
const at = (origin: Coordinate, northM: number, eastM: number): Coordinate => ({
  latitude: origin.latitude + northM / M_PER_DEG_LAT,
  longitude: origin.longitude + eastM / M_PER_DEG_LON,
});

const destination: Place = {
  id: 'a503-destination', name: 'A5-03 destination', category: 'Block',
  description: 'Synthetic arrival-radius fixture', coordinate: at(START, 100, 0), sourceVersion: 'v2',
};

// 100 m north in four 25 m legs; as in production, the arrival marker shares the last walking step's routeIndex.
const vertices = [0, 1, 2, 3, 4].map((leg) => at(START, 25 * leg, 0));
function buildJourney(): V2ActiveRoute {
  const legs = vertices.slice(1).map((vertex, index) => getDistance(vertices[index], vertex));
  const totalDistanceM = legs.reduce((sum, leg) => sum + leg, 0);
  const instructions: V2ActiveRoute['instructions'] = legs.map((leg, index) => ({
    id: `v2-step-${index + 1}`, text: `step ${index + 1}`, type: 'straight',
    coordinate: vertices[index + 1], routeIndex: index + 1, distance: leg, distanceM: leg,
  }));
  instructions.push({
    id: 'v2-step-5', text: 'arrive', type: 'arrival', coordinate: vertices[4], routeIndex: 4, distance: 0, distanceM: 0,
  });
  return {
    id: 'A', routeId: 'A', sourceVersion: 'v2', coordinates: vertices, nodes: [], segments: [], edges: [],
    totalDistance: totalDistanceM, totalDistanceM, estimatedTimeMin: 1, etaMinutes: 1,
    origin: { coordinate: vertices[0], label: 'start', type: 'inside_snap' },
    destination: { coordinate: vertices[4], label: destination.name, type: 'block', blockId: destination.id },
    metadata: { startedOutside: true, usesOfficialGateEntry: false, graphVersion: 'synthetic' },
    instructions,
  };
}

const publish = (coordinate: Coordinate, accuracy: number) =>
  act(async () => {
    useAppStore.setState({ currentLocation: { ...coordinate, accuracy, observedAtMs: Date.now() }, currentLocationSource: 'live' });
  });

// On the final walking segment (step 3, 23 m short of the node: outside the radius), so only the arrival radius is under test.
async function mountOnFinalSegment() {
  const route = buildJourney();
  seedRunningNavigation(destination, route, route.instructions);
  const hook = await renderHook(() => useNavigationViewModelV2());
  await publish(at(START, 2, 0), 5);
  for (const vertex of vertices.slice(1, 4)) await publish(vertex, 5);
  await publish(at(vertices[3], 2, 0), 5);
  expect(hook.result.current.currentStepIndex).toBe(3);
  expect(hook.result.current.arrived).toBe(false);
  return hook;
}

// A fix east of the final node: its distance to the destination is the only thing that differs between cases.
const eastOfDestination = (metres: number) => at(vertices[4], 0, metres);

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  jest.spyOn(VoiceService, 'speakInstruction').mockImplementation(() => undefined as never);
  jest.spyOn(VoiceService, 'stopSpeaking').mockImplementation(() => undefined as never);
});
afterEach(() => jest.restoreAllMocks());

describe('A5-03 arrival radius (characterization of the current policy)', () => {
  test('the radius is the 20 m constant, measured as a whole-metre geolib distance', () => {
    expect(ARRIVAL_THRESHOLD_METERS).toBe(20);
    expect(getDistance(vertices[4], eastOfDestination(20.3))).toBe(20);
    expect(getDistance(vertices[4], eastOfDestination(20.7))).toBe(21);
  });

  test.each([
    [5, 15, true], [5, 19, true], [5, 20.3, true], [5, 20.7, false], [5, 22, false], [5, 40, false],
  ])('accurate fix (%i m) %f m from the destination: arrived=%s', async (accuracy, metres, expected) => {
    const hook = await mountOnFinalSegment();

    await publish(eastOfDestination(metres), accuracy);

    expect(hook.result.current.arrived).toBe(expected);
  });
});

describe('A5-03 reported accuracy does not enter the arrival decision', () => {
  test('a fix reporting 45 m of uncertainty latches arrival at 15 m, exactly like an accurate one', async () => {
    const hook = await mountOnFinalSegment();

    await publish(eastOfDestination(15), 45);

    expect(hook.result.current.arrived).toBe(true);
  });

  test('the accepted accuracy envelope is inclusive: a fix reporting 50 m latches at 15 m', async () => {
    const hook = await mountOnFinalSegment();

    await publish(eastOfDestination(15), 50);

    expect(hook.result.current.arrived).toBe(true);
  });

  test('a fix at 40 m does not arrive even when its accuracy radius (50 m) contains the destination', async () => {
    const hook = await mountOnFinalSegment();

    await publish(eastOfDestination(40), 50);

    expect(hook.result.current.arrived).toBe(false);
  });

  test('a fix just past the accepted envelope (51 m) does not latch at the same 15 m position that 50 m does', async () => {
    const hook = await mountOnFinalSegment();

    await publish(eastOfDestination(15), 51);

    expect(hook.result.current.arrived).toBe(false);
  });
});

describe('A5-03 a single qualifying fix latches for the session', () => {
  test('later accurate fixes far from the destination do not un-report arrival', async () => {
    const hook = await mountOnFinalSegment();
    await publish(eastOfDestination(15), 45);
    expect(hook.result.current.arrived).toBe(true);

    await publish(eastOfDestination(120), 5);
    await publish(eastOfDestination(240), 5);

    expect(hook.result.current.arrived).toBe(true);
  });
});
