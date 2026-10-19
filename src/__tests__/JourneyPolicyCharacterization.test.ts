// B2b characterization: pins today's journey-start decisions (store intent eligibility, start action, navigation
// start gate, request freshness) so the pure-policy extraction can be proven behaviour-neutral. Deterministic:
// every time-dependent input is an explicit nowMs or a faked system clock.
import type { Coordinate, Place } from '../models/types';
import { t } from '../i18n/translate';
import { useAppStore } from '../store/useAppStore';
import { evaluateLocationCapability } from '../services/LocationCapability';
import { evaluateNavigationLocationCapability, resolveStartAction } from '../services/LocationNavigationCapability';

const NOW = 1_700_000_000_000;
const place = (id: string) => ({ id, name: id, category: 'Block', description: '', coordinate: { latitude: 24.9, longitude: 67 }, sourceVersion: 'v2' }) as Place;
const fix = (over: Partial<Coordinate> = {}): Coordinate => ({ latitude: 24.965, longitude: 67.006, accuracy: 8, observedAtMs: NOW - 2_000, ...over });
const initial = useAppStore.getState();

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  useAppStore.setState(initial, true);
});
afterEach(() => jest.useRealTimers());

type Seed = Partial<ReturnType<typeof useAppStore.getState>>;
const live = (over: Seed = {}): Seed => ({
  hasLocationPermission: true, locationPermissionCanAskAgain: true, locationPermissionPrecision: 'fine',
  locationServicesState: 'enabled', currentLocationSource: 'live', currentLocation: fix(), ...over,
});
const autoLiveFor = (seed: Seed) => {
  useAppStore.setState(seed);
  useAppStore.getState().setPendingJourney({ destination: place('B2') });
  return useAppStore.getState().destinationJourneyIntent!.autoLive;
};

describe('destination tap: automatic live eligibility (Flow A vs B)', () => {
  test.each<[string, Seed, 'eligible' | 'ineligible']>([
    ['fresh precise live fix', live(), 'eligible'],
    ['fix exactly 30 s old', live({ currentLocation: fix({ observedAtMs: NOW - 30_000 }) }), 'eligible'],
    ['stale fix (30 001 ms)', live({ currentLocation: fix({ observedAtMs: NOW - 30_001 }) }), 'ineligible'],
    ['fix without timestamp', live({ currentLocation: fix({ observedAtMs: undefined }) }), 'ineligible'],
    ['weak fix (51 m)', live({ currentLocation: fix({ accuracy: 51 }) }), 'ineligible'],
    ['approximate permission', live({ locationPermissionPrecision: 'coarse' }), 'ineligible'],
    ['precision unknown', live({ locationPermissionPrecision: 'none' }), 'ineligible'],
    ['permission denied', live({ hasLocationPermission: false }), 'ineligible'],
    ['services disabled', live({ locationServicesState: 'disabled' }), 'ineligible'],
    ['services unknown', live({ locationServicesState: 'unknown' }), 'ineligible'],
    ['no fix at all', live({ currentLocation: null }), 'ineligible'],
    ['remembered (non-live) position', live({ currentLocationSource: 'remembered' }), 'ineligible'],
    ['device last-known position', live({ currentLocationSource: 'device_last_known' }), 'ineligible'],
    ['already navigating', live({ isNavigating: true }), 'ineligible'],
  ])('%s -> %s', (_name, seed, expected) => expect(autoLiveFor(seed)).toBe(expected));

  test('Flow B: no usable GPS invents no position and starts nothing', () => {
    autoLiveFor({});
    const s = useAppStore.getState();
    expect(s.currentLocation).toBeNull();
    expect(s.routePlannerOrigin).toBeNull();
    expect(s.isNavigating).toBe(false);
  });
});

describe('destination intent lifecycle: one-shot, replaceable, cancellable', () => {
  test('a newer tap replaces the intent and the old id can no longer consume', () => {
    useAppStore.setState(live());
    useAppStore.getState().setPendingJourney({ destination: place('A') });
    const first = useAppStore.getState().destinationJourneyIntent!;
    useAppStore.getState().setPendingJourney({ destination: place('B') });
    const second = useAppStore.getState().destinationJourneyIntent!;
    expect(second.id).toBe(first.id + 1);
    expect(second.destinationId).toBe('B');
    expect(useAppStore.getState().consumeDestinationIntent(first.id)).toBe(false);
    expect(useAppStore.getState().destinationJourneyIntent).toBe(second);
  });

  test('consume succeeds once, then the intent is spent', () => {
    useAppStore.setState(live());
    useAppStore.getState().setPendingJourney({ destination: place('A') });
    const { id } = useAppStore.getState().destinationJourneyIntent!;
    expect(useAppStore.getState().consumeDestinationIntent(id)).toBe(true);
    expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
    expect(useAppStore.getState().consumeDestinationIntent(id)).toBe(false);
  });

  test('an ineligible intent can never be consumed', () => {
    useAppStore.getState().setPendingJourney({ destination: place('A') });
    const { id, autoLive } = useAppStore.getState().destinationJourneyIntent!;
    expect(autoLive).toBe('ineligible');
    expect(useAppStore.getState().consumeDestinationIntent(id)).toBe(false);
  });

  test('retire spends only the matching, unspent intent', () => {
    useAppStore.setState(live());
    useAppStore.getState().setPendingJourney({ destination: place('A') });
    const intent = useAppStore.getState().destinationJourneyIntent!;
    useAppStore.getState().retireDestinationIntent(intent.id + 1);
    expect(useAppStore.getState().destinationJourneyIntent).toBe(intent);
    useAppStore.getState().retireDestinationIntent(intent.id);
    expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
  });

  test('opening a chooser spends the intent (cancelled chooser cannot resurrect auto-live)', () => {
    useAppStore.setState(live());
    useAppStore.getState().setPendingJourney({ destination: place('A') });
    useAppStore.getState().setRoutePlannerDest(place('A'));
    useAppStore.getState().setDirectoryPurpose('start');
    useAppStore.getState().setDirectoryPurpose(null);
    expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('consumed');
  });

  test('clearing the planner drops the intent; consuming the handoff does not cancel it', () => {
    useAppStore.setState(live());
    useAppStore.getState().setPendingJourney({ destination: place('A') });
    useAppStore.getState().setPendingJourney(null);
    expect(useAppStore.getState().destinationJourneyIntent?.autoLive).toBe('eligible');
    useAppStore.getState().clearRoutePlanner();
    expect(useAppStore.getState().destinationJourneyIntent).toBeNull();
  });
});

describe('directory choice freshness (superseded asynchronous answers)', () => {
  const open = () => {
    useAppStore.getState().setPendingJourney({ destination: place('D') });
    useAppStore.getState().setRoutePlannerDest(place('D'));
    useAppStore.getState().setDirectoryPurpose('start');
    return { purpose: 'start' as const, place: place('O'), request: useAppStore.getState().directoryRequest! };
  };

  test('matching answer is accepted once and consumable only for its own destination', () => {
    const answer = open();
    expect(useAppStore.getState().setDirectoryChoice(answer)).toBe(true);
    expect(useAppStore.getState().consumeDirectoryChoice(useAppStore.getState().directoryChoice!, 'other')).toBe(false);
    expect(useAppStore.getState().consumeDirectoryChoice(useAppStore.getState().directoryChoice!, 'D')).toBe(true);
    expect(useAppStore.getState().directoryChoice).toBeNull();
  });

  test.each([
    ['older serial', (r: any) => ({ ...r, serial: r.serial - 1 })],
    ['older journey', (r: any) => ({ ...r, journeyId: r.journeyId - 1 })],
    ['other destination', (r: any) => ({ ...r, destinationId: 'X' })],
    ['other purpose', (r: any) => ({ ...r, purpose: 'destination' })],
  ])('rejects %s', (_n, mutate) => {
    const answer = open();
    expect(useAppStore.getState().setDirectoryChoice({ ...answer, request: mutate(answer.request) })).toBe(false);
  });

  test('rejects an answer after the journey was superseded', () => {
    const answer = open();
    useAppStore.getState().setPendingJourney({ destination: place('E') });
    expect(useAppStore.getState().setDirectoryChoice(answer)).toBe(false);
  });
});

describe('start action (button decision) with an injected clock', () => {
  const base = { startSource: 'live_gps' as const, permission: { granted: true, precision: 'fine' as const }, nowMs: NOW };
  test('fresh precise fix starts live navigation', () => {
    expect(resolveStartAction({ ...base, liveFix: fix() })).toMatchObject({ kind: 'start', primaryLabel: t('capability.startNavigation'), title: t('capability.ready') });
  });
  test('fix expiry flips on the 30 s boundary using only nowMs', () => {
    const f = fix({ observedAtMs: NOW });
    expect(resolveStartAction({ ...base, liveFix: f, nowMs: NOW + 30_000 }).kind).toBe('start');
    expect(resolveStartAction({ ...base, liveFix: f, nowMs: NOW + 30_001 }).kind).toBe('use_location');
  });
  test.each([
    ['denied', { permission: { granted: false, precision: 'none' as const }, liveFix: null }, 'turn_on_location', t('capability.turnOnStart')],
    ['approximate', { permission: { granted: true, precision: 'coarse' as const }, liveFix: fix() }, 'precise_location', t('capability.precise')],
    ['precision unknown', { permission: { granted: true, precision: 'none' as const }, liveFix: fix() }, 'use_location', t('directions.checkLocation')],
    ['no fix', { liveFix: null }, 'use_location', t('capability.useStart')],
  ])('%s', (_n, over, kind, label) => {
    expect(resolveStartAction({ ...base, ...over })).toMatchObject({ kind, primaryLabel: label });
  });
  test('manual start is a route guide with a live-upgrade secondary action', () => {
    expect(resolveStartAction({ ...base, startSource: 'manual_place', liveFix: null })).toEqual({
      kind: 'route_guide', primaryLabel: t('capability.startRoute'), secondaryLabel: t('capability.guideLocation') });
  });
  test('direct guide is a route guide with no secondary action, whatever the location state', () => {
    expect(resolveStartAction({ ...base, liveFix: null, directGuide: true })).toEqual({ kind: 'route_guide', primaryLabel: t('capability.startRoute') });
  });
});

describe('navigation start gate / manual-to-live upgrade eligibility', () => {
  const gate = (over: object) => evaluateNavigationLocationCapability({ startSource: 'live_gps', coordinate: fix(), precision: 'fine', nowMs: NOW, ...over });
  test('fresh precise live fix can start', () => expect(gate({})).toEqual({ canStart: true, message: '' }));
  test.each([
    ['manual_place', t('capability.manualLive')], ['hypothetical_place', t('capability.manualLive')],
    ['remembered_location', t('capability.savedLive')], ['device_last_known', t('capability.savedLive')],
  ])('%s start source never goes live (%s)', (startSource, message) => {
    expect(gate({ startSource })).toEqual({ canStart: false, message });
  });
  test('coarse -> exact message; omitted/none precision fails closed', () => {
    expect(gate({ precision: 'coarse' }).message).toBe(t('capability.exactLive'));
    expect(gate({ precision: undefined }).message).toBe(t('directions.precisionUnknown'));
    expect(gate({ precision: 'none' }).message).toBe(t('directions.precisionUnknown'));
  });
  test('missing/stale fix -> acquiring, weak fix -> open area; boundary uses nowMs', () => {
    expect(gate({ coordinate: null }).message).toBe(t('capability.acquiring'));
    expect(gate({ coordinate: fix({ observedAtMs: NOW - 30_001 }) }).message).toBe(t('capability.acquiring'));
    expect(gate({ coordinate: fix({ accuracy: 51 }) }).message).toBe(t('capability.openArea'));
    expect(gate({ coordinate: fix({ observedAtMs: NOW }), nowMs: NOW + 30_000 }).canStart).toBe(true);
    expect(gate({ coordinate: fix({ observedAtMs: NOW }), nowMs: NOW + 30_001 }).canStart).toBe(false);
  });
  test('clock rollback (future fix) fails closed', () => {
    expect(gate({ coordinate: fix({ observedAtMs: NOW + 1 }) }).canStart).toBe(false);
  });
});

describe('capability: explicit nowMs is the only clock when supplied', () => {
  test('same inputs, different nowMs, deterministic outcome', () => {
    const permission = { granted: true, canAskAgain: true, precision: 'fine' as const, servicesState: 'enabled' as const };
    const f = fix({ observedAtMs: NOW });
    expect(evaluateLocationCapability({ permission, liveFix: f, nowMs: NOW + 30_000 }).mode).toBe('live_navigation');
    expect(evaluateLocationCapability({ permission, liveFix: f, nowMs: NOW + 30_001 }).liveBlocker).toBe('stale_fix');
  });
});
