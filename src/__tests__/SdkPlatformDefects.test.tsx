// Codex independent audit (13f4629): PLAT-01 (map availability must recover) and PLAT-02 (iOS safety announcements). Jest evidence only:
// the VoiceOver speech itself and a real map load/failure sequence are physical-device / native-run gates.
import React from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { act, render, renderHook } from '@testing-library/react-native';
import { createMapLibreNavigationMap } from '@muslim-ummah/offline-navigation/maplibre';
import { useSafetyAnnouncements, type SafetyAnnouncementInput } from '@muslim-ummah/offline-navigation/ui';
import { testVenue } from './sdkTestVenue';

jest.mock('@maplibre/maplibre-react-native', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    Map: (p: any) => R.createElement(View, { testID: 'map', ...p }, p.children),
    Camera: (p: any) => { R.useImperativeHandle(p.ref, () => ({ setStop: jest.fn(async () => undefined) }), []); return null; },
    GeoJSONSource: (p: any) => R.createElement(View, null, p.children),
    Layer: () => null,
  };
});

describe('PLAT-01: a recovered native map clears the unavailable warning', () => {
  const Map = createMapLibreNavigationMap({ venue: testVenue, archiveUri: 'file:///v.pmtiles', archiveZoom: { min: 12, max: 16 }, initialCenter: { lat: 24.9, lng: 67 }, initialZoom: 17 });
  const base: any = { phase: 'browsing', route: null, originId: null, destinationId: null, position: null, stepIndex: 0 };
  const events = (api: Awaited<ReturnType<typeof render>>) => ({
    load: () => act(async () => api.getByTestId('map').props.onDidFinishLoadingMap()),
    fail: () => act(async () => api.getByTestId('map').props.onDidFailLoadingMap()),
  });

  it('success, failure, success reports true, false, true (also across a style change)', async () => {
    const changes = jest.fn();
    const api = await render(<Map {...base} onAvailabilityChange={changes} />);
    const native = events(api);
    await native.load();
    await native.fail();
    await api.rerender(<Map {...base} onAvailabilityChange={changes} colorScheme="dark" />);
    await native.load();
    expect(changes.mock.calls.map(([v]) => v)).toEqual([true, false, true]);
  });

  it('a failed first load can recover, and repeated identical events are reported once', async () => {
    const changes = jest.fn();
    const api = await render(<Map {...base} onAvailabilityChange={changes} />);
    const native = events(api);
    await native.fail();
    await native.fail();
    await native.load();
    await native.load();
    expect(changes.mock.calls.map(([v]) => v)).toEqual([false, true]);
  });

  it('camera framing still happens once per map, not on every recovered load', async () => {
    const setStop = jest.fn(async () => undefined);
    jest.requireMock('@maplibre/maplibre-react-native').Camera = (p: any) => { React.useImperativeHandle(p.ref, () => ({ setStop }), []); return null; };
    const points = [{ lat: 24.9, lng: 67 }, { lat: 24.91, lng: 67.01 }];
    const route = { originId: 'a', destinationId: 'b', nodeIds: [], distanceM: 1, steps: [], line: { points, cumulativeM: [0, 1], totalM: 1 } } as any;
    const Framed = createMapLibreNavigationMap({ venue: testVenue, archiveUri: 'file:///v.pmtiles', archiveZoom: { min: 12, max: 16 }, initialCenter: points[0], initialZoom: 15 });
    const api = await render(<Framed {...base} phase="preview" route={route} onAvailabilityChange={() => {}} />);
    const native = events(api);
    await native.load();
    const afterFirst = setStop.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    await native.fail();
    await native.load();
    expect(setStop.mock.calls.length).toBe(afterFirst);
  });
});

describe('PLAT-02: safety changes are announced on iOS and only once', () => {
  const words = { gpsLost: 'GPS lost', gpsWeak: 'GPS weak', signalRecovered: 'GPS back', rerouting: 'Rerouting', rerouted: 'New route', keptRoute: 'Keeping route' };
  const input = (over: Partial<SafetyAnnouncementInput> = {}): SafetyAnnouncementInput => ({
    active: true, signal: 'good', rerouting: false, notice: null, instructionKey: 'r1#0', instruction: 'Walk straight. 50 m', copy: words, ...over,
  });
  const spoken: Array<[string, boolean]> = [];
  const speak = (message: string, interrupt: boolean) => { spoken.push([message, interrupt]); };
  beforeEach(() => { spoken.length = 0; });
  const mount = (first: SafetyAnnouncementInput) => renderHook((props: SafetyAnnouncementInput) => useSafetyAnnouncements(props, speak), { initialProps: first });

  it('says the first instruction when Live begins, and nothing while idle', async () => {
    const hook = await mount(input({ active: false }));
    expect(spoken).toEqual([]);
    await hook.rerender(input());
    expect(spoken).toEqual([['Walk straight. 50 m', false]]);
  });

  it('GPS loss interrupts, weak and recovery wait their turn, and each is spoken once however often it renders', async () => {
    const hook = await mount(input());
    spoken.length = 0;
    await hook.rerender(input({ signal: 'weak' }));
    await hook.rerender(input({ signal: 'weak', instruction: 'Walk straight. 40 m' }));
    await hook.rerender(input({ signal: 'lost' }));
    await hook.rerender(input({ signal: 'lost' }));
    await hook.rerender(input({ signal: 'good' }));
    expect(spoken).toEqual([['GPS weak', false], ['GPS lost', true], ['GPS back', false]]);
  });

  it('a recovery without wording is silent instead of half-translated', async () => {
    const hook = await mount(input({ signal: 'lost', copy: { ...words, signalRecovered: undefined } }));
    spoken.length = 0;
    await hook.rerender(input({ signal: 'good', copy: { ...words, signalRecovered: undefined } }));
    expect(spoken).toEqual([]);
  });

  it('a falling distance is not re-announced, a new instruction is', async () => {
    const hook = await mount(input());
    spoken.length = 0;
    await hook.rerender(input({ instruction: 'Walk straight. 30 m' }));
    await hook.rerender(input({ instruction: 'Walk straight. 10 m' }));
    expect(spoken).toEqual([]);
    await hook.rerender(input({ instructionKey: 'r1#1', instruction: 'Turn right' }));
    expect(spoken).toEqual([['Turn right', false]]);
  });

  it('a reroute is announced when it starts and when it ends, then the new first instruction', async () => {
    const hook = await mount(input());
    spoken.length = 0;
    await hook.rerender(input({ rerouting: true }));
    await hook.rerender(input({ rerouting: true, instructionKey: 'r1#0' }));
    await hook.rerender(input({ rerouting: false, notice: 'rerouted', instructionKey: 'r2#0', instruction: 'Head north' }));
    expect(spoken).toEqual([['Rerouting', false], ['New route', false], ['Head north', false]]);
  });

  it('a reroute that keeps the old route says so and repeats no instruction', async () => {
    const hook = await mount(input());
    spoken.length = 0;
    await hook.rerender(input({ rerouting: true }));
    await hook.rerender(input({ rerouting: false, notice: 'kept_route' }));
    expect(spoken).toEqual([['Rerouting', false], ['Keeping route', false]]);
  });

  it('leaving Live forgets what was said, so the next trip starts fresh', async () => {
    const hook = await mount(input({ signal: 'lost' }));
    await hook.rerender(input({ active: false }));
    spoken.length = 0;
    await hook.rerender(input({ signal: 'lost' }));
    expect(spoken).toEqual([['Walk straight. 50 m', false]]);
  });

  describe('through the real announcement API', () => {
    const original = Platform.OS;
    // A spy that survives restoreAllMocks keeps its calls, so clear them explicitly.
    afterEach(() => { Platform.OS = original; jest.restoreAllMocks(); jest.clearAllMocks(); });

    it('on iOS an interruption uses announceForAccessibility and the rest are queued', async () => {
      Platform.OS = 'ios';
      const now = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
      const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
      const hook = await renderHook((p: SafetyAnnouncementInput) => useSafetyAnnouncements(p), { initialProps: input() });
      await hook.rerender(input({ signal: 'lost' }));
      expect(queued).toHaveBeenCalledWith('Walk straight. 50 m', { queue: true });
      expect(now).toHaveBeenCalledWith('GPS lost');
      await hook.unmount();
    });

    it('on Android nothing is announced here: the views keep their live regions', async () => {
      Platform.OS = 'android';
      const now = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
      const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
      const hook = await renderHook((p: SafetyAnnouncementInput) => useSafetyAnnouncements(p), { initialProps: input() });
      await hook.rerender(input({ signal: 'lost' }));
      expect(now).not.toHaveBeenCalled();
      expect(queued).not.toHaveBeenCalled();
    });
  });
});
