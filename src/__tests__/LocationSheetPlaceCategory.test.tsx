/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { LocationSheet } from '../views/components/map/LocationSheet';
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
