/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The ready-made screen with a place catalog: every catalog place is listed and searchable in every language, pending and unreachable places say
// so and never get a route, a provisional route says where it really ends. Karachi's real preset catalog; the ilaqas below are synthetic names.
import React from 'react';
import { Dimensions } from 'react-native';
import { act, fireEvent, render, screen } from './test-utils';
import { createNavigationController, createPlaceCatalog, parsePackPlaceCatalog } from '@muslim-ummah/offline-navigation';
import { createDefaultNavigationTheme, ENGLISH_NAVIGATION_SCREEN_COPY as copy, NavigationProvider, NavigationScreen } from '@muslim-ummah/offline-navigation/ui';
import { buildKarachiPlaceCatalog } from '../data/ijtema/packResources';
import { IJTEMA_VENUE_SOURCE } from '../data/ijtema/venueAdapter';

const ilaqa = (id: string, en: string, ur: string, latn: string, over: object = {}) => ({
  id, category: 'ilaqa', names: { en, ur, 'ur-Latn': latn }, aliases: [], marhala: 1, location: 'pending', routing: 'not-located', routingReason: 'LOCATION_PENDING',
  nodeIds: [], provenance: { source: 'test' }, flags: ['DRAFT_TRANSLATION'], ...over,
});
const doc = buildKarachiPlaceCatalog();
const parsed = parsePackPlaceCatalog(JSON.stringify({
  ...doc, places: [
    ...doc.places,
    ilaqa('IL-0001', 'Test Ilaqa One', 'ٹیسٹ علاقہ ایک', 'Test Ilaqa Aik'),
    ilaqa('IL-0005', 'Twin Name', 'جڑواں', 'Judwan', { flags: ['DUPLICATE_NAME', 'NEEDS_REVIEW'] }),
    ilaqa('IL-0029', 'Twin Name', 'جڑواں', 'Judwan', { flags: ['DUPLICATE_NAME', 'NEEDS_REVIEW'], marhala: 2 }),
  ],
}), { venueId: 'karachi-ijtema', languages: ['en', 'ur', 'ur-Latn'] });
if (!parsed.ok) throw new Error(parsed.error.message);
const catalog = createPlaceCatalog(parsed.catalog);

const mount = async (language = 'en') => {
  const controller = createNavigationController({ venue: IJTEMA_VENUE_SOURCE, availability: catalog.availability });
  await render(
    <NavigationProvider controller={controller}>
      <NavigationScreen copy={copy} theme={createDefaultNavigationTheme({ isRTL: false })} isRTL={false} catalog={catalog} language={language} />
    </NavigationProvider>,
  );
  return controller;
};
const search = async (q: string) => { await fireEvent.changeText(screen.getByLabelText(copy.directory.searchLabel), q); };
const row = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => { Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } }); });

describe('catalog directory', () => {
  it('lists blocks, gates and ilaqas together; a pending ilaqa says its location is not yet available', async () => {
    await mount();
    await search('Test Ilaqa');
    const r = row(/Test Ilaqa One/);
    expect(r.props.accessibilityLabel).toMatch(/Ilaqas · Marhala 1.*Location not yet available/);
    await search('block 5');
    expect(row(/Block 5\./).props.accessibilityLabel).toMatch(/Route ends at the block boundary/);
    await search('gate 18');
    expect(row(/Gate 18/).props.accessibilityLabel).toMatch(/No verified route yet/);
  });
  it('finds the same destination in English, Urdu and Roman Urdu whatever language the screen shows', async () => {
    await mount('ur');
    for (const q of ['Test Ilaqa One', 'ٹیسٹ علاقہ ایک', 'Test Ilaqa Aik', 'ilaqa aik']) {
      await search(q);
      expect(row(/ٹیسٹ علاقہ ایک/)).toBeTruthy(); // shown in the screen's own language
    }
  });
  it('duplicate names stay as two rows that can be told apart', async () => {
    await mount();
    await search('Twin Name');
    expect(screen.getAllByRole('button', { name: /Twin Name/ })).toHaveLength(2);
    expect(row(/IL-0029/).props.accessibilityLabel).toMatch(/Marhala 2.*Another place has the same name \(IL-0029\)/);
  });
  it('category chips filter the list and mark the selected one', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('category-chip-gate'));
    expect(screen.getByTestId('category-chip-gate').props.accessibilityState).toEqual({ selected: true });
    await search('block');
    expect(screen.queryByRole('button', { name: /Block 5\./ })).toBeNull();
    await search('gate');
    expect(row(/Gate 12/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('category-chip-ilaqa'));
    await search('');
    expect(screen.queryByRole('button', { name: /Gate 12/ })).toBeNull();
    expect(row(/Test Ilaqa One/)).toBeTruthy();
  });
});

describe('choosing a place that cannot be routed to', () => {
  it('a pending ilaqa gives an explanation and no route, Guide or Live', async () => {
    const controller = await mount();
    await search('Test Ilaqa');
    await act(async () => { fireEvent.press(row(/Test Ilaqa One/)); });
    expect(controller.getState()).toMatchObject({ loadState: 'error', error: 'destination_not_located', route: null, canStartGuide: false });
    expect(screen.getByText(copy.trip.errors.destination_not_located)).toBeTruthy();
    expect(screen.queryByText(copy.trip.startGuide.title)).toBeNull();
    expect(screen.queryByText(copy.trip.startLive.title)).toBeNull();
    expect(screen.queryByText(copy.trip.retry)).toBeNull();
  });
  it('Gate 18 explains the missing verified connection instead of offering a route', async () => {
    const controller = await mount();
    await search('gate 18');
    await act(async () => { fireEvent.press(row(/Gate 18/)); });
    expect(controller.getState()).toMatchObject({ error: 'destination_unreachable', route: null });
    expect(screen.getByText(copy.trip.errors.destination_unreachable)).toBeTruthy();
    // Nothing that cannot succeed is offered: not Live from my location (it ended in a second, misleading "no route found"), not Try again.
    expect(screen.queryByText(copy.trip.startLive.title)).toBeNull();
    expect(screen.queryByText(copy.trip.retry)).toBeNull();
    expect(screen.queryByText(copy.trip.startGuide.title)).toBeNull();
  });
  it('a block routes, and the screen says the route ends at the block boundary, not at an entrance', async () => {
    const controller = await mount();
    await search('block 5');
    await act(async () => { fireEvent.press(row(/Block 5\./)); });
    await act(async () => { controller.selectOrigin('GATE_12'); });
    expect(controller.getState().loadState).toBe('ready');
    expect(screen.getByTestId('navigation-provisional')).toBeTruthy();
    expect(screen.getByText(copy.trip.provisionalAccess)).toBeTruthy();
  });
  it('the start picker offers only places a route can begin at', async () => {
    const controller = await mount();
    await search('block 5');
    await act(async () => { fireEvent.press(row(/Block 5\./)); });
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: copy.trip.chooseStart })); });
    await search('Test Ilaqa');
    expect(screen.queryByRole('button', { name: /Test Ilaqa One/ })).toBeNull();
    await search('gate 18');
    expect(screen.queryByRole('button', { name: /Gate 18/ })).toBeNull();
    await search('gate 12');
    expect(row(/Gate 12/)).toBeTruthy();
    expect(controller.getState().originId).toBeNull();
  });
});
