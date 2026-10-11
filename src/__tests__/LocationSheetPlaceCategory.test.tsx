/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen, userEvent } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
import { useLocaleStore } from '../i18n';
import type { Place } from '../models/types';

// The place sheet printed the raw data enum under the name ("SpecialRoute"); the Directory and Get
// Directions already call it Shahr-e-Pindal (#128 E, #157).
const specialRoute = {
  id: 'SP_NORTH',
  name: 'Shahr-e-Pindal North',
  category: 'SpecialRoute',
  description: 'Special route.',
  coordinate: { latitude: 24.9, longitude: 67.1 },
  sourceVersion: 'v2',
} as Place;

function renderPlaceSheet(place: Place) {
  return render(
    <LocationSheet
      {...({
        mode: 'preview',
        place,
        theme: { subtext: '#666', text: '#111', card: '#fff', border: '#ddd', primary: '#06c' },
        entryPoints: [],
        blockGates: [],
        selectedEntryIdx: 0,
        onSelectEntryIdx: jest.fn(),
        walkingTimeMin: null,
        isFav: false,
        onToggleFavorite: jest.fn(),
        onSelectGate: jest.fn(),
        onOpenDirections: jest.fn(),
        onClose: jest.fn(),
        onShowDetails: jest.fn(),
        onCloseDetails: jest.fn(),
        developerModeEnabled: false,
      } as never)}
    />,
  );
}

describe('LocationSheet place header — category copy', () => {
  test('a special route shows its Directory name, not the SpecialRoute enum', async () => {
    await renderPlaceSheet(specialRoute);

    expect(screen.getByText('Shahr-e-Pindal')).toBeOnTheScreen();
    expect(screen.queryByText('SpecialRoute')).not.toBeOnTheScreen();
  });
});

beforeEach(() => useLocaleStore.setState({ locale: 'en' }));
afterEach(() => useLocaleStore.setState({ locale: 'en' }));

test('place actions update language and direction without replacing destination', async () => {
  const directions = jest.fn();
  const close = jest.fn();
  await render(<LocationSheet mode="preview" place={specialRoute}
    theme={{ subtext: '#666', text: '#111', card: '#fff', border: '#ddd', primary: '#06c' } as never}
    entryPoints={[]} blockGates={[]} selectedEntryIdx={0} onSelectEntryIdx={jest.fn()}
    walkingTimeMin={5} isFav={false} onToggleFavorite={jest.fn()} onSelectGate={jest.fn()}
    onOpenDirections={directions} onClose={close} onShowDetails={jest.fn()}
    onCloseDetails={jest.fn()} developerModeEnabled={false} />);
  expect(screen.getByRole('button', { name: 'Directions' })).toBeVisible();
  await act(() => useLocaleStore.setState({ locale: 'ur' }));
  expect(screen.getByTestId('place-sheet-content')).toHaveStyle({ direction: 'rtl' });
  expect(screen.getByText('⁨5⁩ منٹ پیدل')).toBeVisible();
  expect(screen.getByRole('button', { name: 'لوکیشن محفوظ کریں' })).toBeVisible();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'راستہ' }));
  await user.press(screen.getByRole('button', { name: 'بند کریں' }));
  expect(directions).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  await act(() => useLocaleStore.setState({ locale: 'ur-Latn' }));
  expect(screen.getByTestId('place-sheet-content')).toHaveStyle({ direction: 'ltr' });
  expect(screen.getByRole('button', { name: 'Rasta' })).toBeVisible();
  expect(screen.getByText('5 minute paidal')).toBeVisible();
});
