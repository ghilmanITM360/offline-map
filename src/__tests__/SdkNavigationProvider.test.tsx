import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from './test-utils';
import {
  createNavigationController,
  type LiveFixCoordinate,
  type NavigationController,
  type NavigationLocationAdapter,
} from '@muslim-ummah/offline-navigation';
import { NavigationProvider, useNavigationController, useNavigationState } from '@muslim-ummah/offline-navigation/ui';
import { testVenue } from './sdkTestVenue';

const N1 = testVenue.graph.getNode('n/1')!.coordinate;
let t = 1_000_000;
const fixAt = (): LiveFixCoordinate => ({ latitude: N1.lat, longitude: N1.lng, accuracy: 5, observedAtMs: t });
const FINE = { granted: true, canAskAgain: true, precision: 'fine' as const, servicesState: 'enabled' as const };

const makeLocation = () => {
  const L = {
    permissionReads: 0,
    watching: 0,
    getPermission: async () => { L.permissionReads += 1; return FINE; },
    requestPermission: async () => FINE,
    getCurrentFix: async () => fixAt(),
    watch: () => { L.watching += 1; return () => { L.watching -= 1; }; },
  };
  return L satisfies NavigationLocationAdapter & Record<string, unknown>;
};

function Probe() {
  const phase = useNavigationState((s) => s.phase);
  const destination = useNavigationState((s) => s.destinationId);
  const signal = useNavigationState((s) => s.live?.signal ?? 'none');
  return <Text testID="probe">{`${phase}|${destination ?? '-'}|${signal}`}</Text>;
}
const probe = () => screen.getByTestId('probe').props.children as string;

const ctrl = (extra = {}): NavigationController => createNavigationController({ venue: testVenue, now: () => t, ...extra });

beforeEach(() => {
  t = 1_000_000;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('NavigationProvider and hooks', () => {
  it('renders the controller state and re-renders when it changes', async () => {
    const c = ctrl();
    await render(<NavigationProvider controller={c}><Probe /></NavigationProvider>);
    expect(probe()).toBe('browsing|-|none');
    await act(async () => c.selectDestination('annex'));
    expect(probe()).toBe('preview|annex|none');
    await act(async () => c.exit());
    expect(probe()).toBe('browsing|-|none');
  });

  it('gives hooks the same controller the host created', async () => {
    const c = ctrl();
    let seen: NavigationController | null = null;
    function Grab() {
      seen = useNavigationController();
      return null;
    }
    await render(<NavigationProvider controller={c}><Grab /></NavigationProvider>);
    expect(seen).toBe(c);
  });

  it('fails loudly when a hook is used outside a provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow(/NavigationProvider/);
    spy.mockRestore();
  });

  it('does not own the controller: unmounting leaves it usable', async () => {
    const c = ctrl();
    const view = await render(<NavigationProvider controller={c}><Probe /></NavigationProvider>);
    await view.unmount();
    c.selectDestination('annex');
    expect(c.getState().phase).toBe('preview');
  });
});

describe('live clock', () => {
  const live = async () => {
    const L = makeLocation();
    const c = ctrl({ location: L });
    c.selectDestination('annex');
    expect(await c.requestLive()).toBe(true);
    return { c, L };
  };

  it('runs no interval until live, ticks once a second while live, and stops when live ends', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');
    const mine = () => started.mock.calls.flatMap((call, i) => (call[1] === 1_000 ? [started.mock.results[i].value] : []));
    const L = makeLocation();
    const c = ctrl({ location: L });
    await render(<NavigationProvider controller={c}><Probe /></NavigationProvider>);
    expect(mine()).toHaveLength(0);
    c.selectDestination('annex');
    await act(async () => { await c.requestLive(); });
    expect(probe()).toBe('live|annex|good');
    expect(mine()).toHaveLength(1);
    t += 8_000;
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(probe()).toBe('live|annex|lost'); // GPS loss is noticed with no fix arriving
    await act(async () => c.exit());
    expect(cleared).toHaveBeenCalledWith(mine()[0]);
    started.mockRestore();
    cleared.mockRestore();
  });

  it('the tick interval is configurable', async () => {
    const { c } = await live();
    await render(<NavigationProvider controller={c} tickMs={250}><Probe /></NavigationProvider>);
    t += 8_000;
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(probe()).toBe('live|annex|lost');
  });

  it('stops ticking on unmount', async () => {
    const { c } = await live();
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');
    const view = await render(<NavigationProvider controller={c}><Probe /></NavigationProvider>);
    const mine = started.mock.results.filter((_, i) => started.mock.calls[i][1] === 1_000).map((r) => r.value);
    expect(mine).toHaveLength(1);
    await view.unmount();
    expect(cleared).toHaveBeenCalledWith(mine[0]);
    started.mockRestore();
    cleared.mockRestore();
  });
});

describe('lifecycle', () => {
  const lifecycle = () => {
    const listeners = new Set<() => void>();
    return {
      listeners,
      adapter: { onForeground: (cb: () => void) => { listeners.add(cb); return () => void listeners.delete(cb); } },
      foreground: () => [...listeners].forEach((cb) => cb()),
    };
  };

  it('resumes live navigation when the app returns to the foreground', async () => {
    const L = makeLocation();
    const c = ctrl({ location: L });
    c.selectDestination('annex');
    await c.requestLive();
    const lc = lifecycle();
    await render(<NavigationProvider controller={c} lifecycle={lc.adapter}><Probe /></NavigationProvider>);
    const before = L.permissionReads;
    await act(async () => { lc.foreground(); });
    expect(L.permissionReads).toBe(before + 1); // resume re-reads permission (and never prompts)
  });

  it('stops listening on unmount', async () => {
    const lc = lifecycle();
    const view = await render(<NavigationProvider controller={ctrl()} lifecycle={lc.adapter}><Probe /></NavigationProvider>);
    expect(lc.listeners.size).toBe(1);
    await view.unmount();
    expect(lc.listeners.size).toBe(0);
  });

  it('a foreground event outside live does nothing', async () => {
    const L = makeLocation();
    const c = ctrl({ location: L });
    c.selectDestination('annex');
    const lc = lifecycle();
    await render(<NavigationProvider controller={c} lifecycle={lc.adapter}><Probe /></NavigationProvider>);
    await act(async () => { lc.foreground(); });
    expect(L.permissionReads).toBe(0);
  });
});
