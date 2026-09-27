/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { FacilityLayer } from '../views/components/map/FacilityLayer';
import { V1Place } from '../models/types';

function makePlace(overrides: Partial<V1Place> = {}): V1Place {
  return {
    id: 'LM_FOOD_01',
    name: 'Food Court 1',
    category: 'Landmark',
    description: '',
    coordinate: { latitude: 24.9645, longitude: 67.0065 },
    sourceVersion: 'v1',
    ...overrides,
  };
}

describe('FacilityLayer — marker accessibility (#151)', () => {
  test('exposes an accessible name on the facility marker', async () => {
    await render(<FacilityLayer places={[makePlace()]} onPressFacility={jest.fn()} />);

    expect(screen.getByLabelText('Food Court 1')).toBeTruthy();
  });
});
