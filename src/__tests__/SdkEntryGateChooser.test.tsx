/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The entry-gate chooser inside NavigationScreen, driven by the REAL Karachi pack (its gates, names and routing graph) and an outside-route
// provider built from the pack's own gate facts. SIMULATION: no GPS, no street routing; the provider draws the walker-to-gate leg as a
// straight line and uses the pack's real graph from the gate onward. It proves the screen's wiring, not an outside route's quality.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { Dimensions } from 'react-native';
import { act, fireEvent, render, screen, within } from './test-utils';
import {
  createNavigationController, findBestVenuePath, parsePackVenueData,
  type LiveFixCoordinate, type NavigationController, type NavigationLocationAdapter, type OutsideRoute, type OutsideRouteRequest,
  type VenueCoordinate, type VenueDataSource,
} from '@muslim-ummah/offline-navigation';
import { createDefaultNavigationTheme, ENGLISH_NAVIGATION_SCREEN_COPY, NavigationProvider, NavigationScreen, type NavigationScreenCopy } from '@muslim-ummah/offline-navigation/ui';
import { buildKarachiPack } from '../../scripts/sdk-pack/karachi';

jest.setTimeout(60_000);

const M_PER_DEG = 111_320;
const south = (p: VenueCoordinate, m: number): VenueCoordinate => ({ lat: p.lat - m / M_PER_DEG, lng: p.lng });
const hav = (a: VenueCoordinate, b: VenueCoordinate) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
};

let dir: string;
let venue: VenueDataSource;
let names: Map<string, string>;
let eligible: Array<{ id: string; label: string }>;
let blocked: string[];
let destination: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sdk-gates-'));
  const { manifest } = await buildKarachiPack(dir);
  const text = (kind: string) => readFileSync(join(dir, manifest.resources.find((r) => r.kind === kind)!.path), 'utf8');
  const loaded = parsePackVenueData(text('routing-graph'), text('place-directory'), 'karachi-ijtema');
  if (!loaded.ok) throw new Error(loaded.error.message);
  venue = loaded.source;
  names = new Map(JSON.parse(text('localization')).entries.map((e: { id: string; names: { en: string } }) => [e.id, e.names.en]));
  const gates = JSON.parse(text('gate-metadata')).gates as Array<{ id: string; canStartRouteFromOutside: boolean }>;
  eligible = gates.filter((g) => g.canStartRouteFromOutside).map((g) => ({ id: g.id, label: names.get(g.id) ?? g.id }));
  blocked = gates.filter((g) => !g.canStartRouteFromOutside).map((g) => g.id);
  destination = venue.placeIds().find((id) => venue.getPlace(id)?.kind === 'block')!;
});
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } }); });

const gateCoordinate = (id: string) => venue.graph.getNode(venue.getPlace(id)!.nodeIds[0])!.coordinate;

const outsideProvider = (listed: Array<{ id: string; label: string }>) => {
  const calls: OutsideRouteRequest[] = [];
  return {
    calls,
    provider: {
      entryGates: listed,
      route: (request: OutsideRouteRequest): OutsideRoute | null => {
        calls.push(request);
        const gateId = request.entryGateId ?? listed[0].id;
        const inside = findBestVenuePath(venue.graph, venue.getPlace(gateId)!.nodeIds, venue.getPlace(request.destination.id)!.nodeIds);
        if (!inside) return null;
        const points = [request.from, ...inside.nodes.map((n) => venue.graph.getNode(n)!.coordinate)];
        const leg = hav(points[0], points[1]);
        return {
          points,
          steps: [
            { kind: 'depart', nodeId: 'out/0', toNodeId: inside.nodes[0], distanceM: leg + inside.costM },
            { kind: 'arrive', nodeId: inside.nodes[inside.nodes.length - 1], toNodeId: inside.nodes[inside.nodes.length - 1], distanceM: 0 },
          ],
        };
      },
    },
  };
};

const T0 = 5_000_000;
const walkerAt = (p: VenueCoordinate): LiveFixCoordinate => ({ latitude: p.lat, longitude: p.lng, accuracy: 5, observedAtMs: T0 });
const location = (p: VenueCoordinate): NavigationLocationAdapter => ({
  getPermission: async () => ({ granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' }),
  requestPermission: async () => ({ granted: true, canAskAgain: true, precision: 'fine', servicesState: 'enabled' }),
  getCurrentFix: async () => walkerAt(p),
  watch: () => () => {},
});

const mount = async (c: NavigationController, over: { copy?: NavigationScreenCopy; isRTL?: boolean } = {}) => {
  const isRTL = over.isRTL ?? false;
  await render(
    <NavigationProvider controller={c}>
      <NavigationScreen
        copy={over.copy ?? ENGLISH_NAVIGATION_SCREEN_COPY}
        theme={createDefaultNavigationTheme({ isRTL })}
        isRTL={isRTL}
        describePlace={(place) => ({ title: names.get(place.id) ?? place.id })}
      />
    </NavigationProvider>,
  );
};
// The directory is virtualised, so the trip starts through the controller exactly as the directory's own row press would.
const toDestination = (c: NavigationController, id = destination) => act(async () => c.selectDestination(id));
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const chooser = () => within(screen.getByTestId('entry-gate-chooser'));
const copy = ENGLISH_NAVIGATION_SCREEN_COPY;
const choose = copy.entryGate!;
const startLive = `${copy.trip.startLive.title}. ${copy.trip.startLive.subtitle}`;
const outside = () => south(gateCoordinate(eligible[0].id), 2_000);

const setup = (listed = eligible, extra: Partial<Parameters<typeof createNavigationController>[0]> = {}) => {
  const o = outsideProvider(listed);
  const c = createNavigationController({ venue, now: () => T0, location: location(outside()), outside: o.provider, ...extra });
  return { c, ...o };
};

describe('entry-gate chooser (real Karachi data)', () => {
  it('offers exactly the gates the provider lists; Gates 18 and 19 are not among them', async () => {
    expect(blocked).toEqual(expect.arrayContaining(['GATE_18', 'GATE_19']));
    expect(eligible.length).toBeGreaterThan(10);
    const { c } = setup();
    await mount(c);
    await toDestination(c);
    const shown = chooser().getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(shown).toEqual([choose.automaticA11y, ...eligible.map((g) => choose.option(g.label))]);
    for (const id of blocked) expect(shown).not.toContain(choose.option(names.get(id)!));
  });

  it('selecting a gate is one controller command and is exposed as selected; "Let the app choose" clears it', async () => {
    const { c } = setup();
    await mount(c);
    await toDestination(c);
    const state = (name: string) => chooser().getByRole('button', { name }).props.accessibilityState.selected;
    expect(state(choose.automaticA11y)).toBe(true);
    const gate = eligible[2];
    await press(choose.option(gate.label));
    expect(c.getState().entryGateId).toBe(gate.id);
    expect(state(choose.option(gate.label))).toBe(true);
    expect(state(choose.automaticA11y)).toBe(false);
    await press(choose.automaticA11y);
    expect(c.getState().entryGateId).toBeNull();
    expect(state(choose.automaticA11y)).toBe(true);
  });

  it('a gate the provider does not list cannot be chosen, even by a direct command', async () => {
    const { c } = setup();
    await mount(c);
    await toDestination(c);
    await act(async () => c.selectEntryGate('GATE_18'));
    expect(c.getState().entryGateId).toBeNull();
    await act(async () => c.selectEntryGate(eligible[0].id));
    await act(async () => c.selectEntryGate('GATE_19'));
    expect(c.getState().entryGateId).toBe(eligible[0].id);
  });

  it('the chosen gate reaches the provider when the walker outside prepares Live; changing it retires the prepared route', async () => {
    const { c, calls } = setup();
    await mount(c);
    await toDestination(c);
    const first = eligible[3];
    await press(choose.option(first.label));
    await press(startLive);
    expect(await screen.findByText(copy.upgrade.preview)).toBeOnTheScreen();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ entryGateId: first.id, destination: { id: destination } });
    expect(c.getState().liveCandidate).not.toBeNull();
    expect(chooser().getByRole('button', { name: choose.option(first.label) })).toBeOnTheScreen(); // still choosable under the candidate
    const second = eligible[5];
    await press(choose.option(second.label));
    expect(c.getState()).toMatchObject({ entryGateId: second.id, liveCandidate: null, liveAttempt: { status: 'idle' } });
    expect(screen.queryByText(copy.upgrade.preview)).toBeNull();
    await press(startLive);
    expect(await screen.findByText(copy.upgrade.preview)).toBeOnTheScreen();
    expect(calls[1].entryGateId).toBe(second.id);
  });

  it('a new destination or Exit clears the choice', async () => {
    const { c } = setup();
    await mount(c);
    await toDestination(c);
    await press(choose.option(eligible[1].label));
    expect(c.getState().entryGateId).toBe(eligible[1].id);
    await act(async () => c.exit());
    await toDestination(c);
    expect(c.getState().entryGateId).toBeNull();
    await press(choose.option(eligible[1].label));
    const other = venue.placeIds().filter((id) => venue.getPlace(id)?.kind === 'block')[1];
    await act(async () => c.selectDestination(other));
    expect(c.getState().entryGateId).toBeNull();
    expect(chooser().getByRole('button', { name: choose.automaticA11y }).props.accessibilityState.selected).toBe(true);
  });

  it('is absent without a provider list or without the host\'s wording', async () => {
    const none = setup([]);
    await mount(none.c);
    await toDestination(none.c);
    expect(screen.queryByTestId('entry-gate-chooser')).toBeNull();
  });

  it('does not appear until a destination is chosen, and not for a screen whose copy has no entry-gate wording', async () => {
    const { c } = setup();
    const withoutGates: Partial<NavigationScreenCopy> = { ...ENGLISH_NAVIGATION_SCREEN_COPY };
    delete withoutGates.entryGate;
    await mount(c, { copy: withoutGates as NavigationScreenCopy });
    expect(screen.queryByTestId('entry-gate-chooser')).toBeNull();
    await toDestination(c);
    expect(screen.queryByTestId('entry-gate-chooser')).toBeNull();
  });

  it('renders in Urdu RTL with the panel direction set and every option still named', async () => {
    const { c } = setup();
    await mount(c, { isRTL: true });
    await toDestination(c);
    const flat = Object.assign({}, ...[screen.getByTestId('navigation-panel').props.style].flat(3).filter(Boolean));
    expect(flat.direction).toBe('rtl');
    for (const button of chooser().getAllByRole('button')) expect(button.props.accessibilityLabel).toBeTruthy();
  });

  it('at AX5 scale the chooser is inside the scrolling content, so every gate can be reached', async () => {
    Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 3.1 } }); // set before mounting, so the screen starts at this scale
    const { c } = setup();
    await mount(c);
    await toDestination(c);
    const target = chooser().getByRole('button', { name: choose.option(eligible[eligible.length - 1].label) });
    let node: { type: unknown; parent: unknown } | null = (target as unknown as { parent: { type: unknown; parent: unknown } }).parent;
    while (node && !String(node.type).includes('ScrollView')) node = node.parent as typeof node;
    expect(node).toBeTruthy();
  });
});
