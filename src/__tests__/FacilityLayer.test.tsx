/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen } from './test-utils';

import { FacilityLayer } from '../views/components/map/FacilityLayer';
import { MARKER_PAINT_MS } from '../views/components/map/useMarkerPaintWindow';
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
  test('#128: the facility marker carries its name as the native title so TalkBack does not say "Map Marker"', async () => {
    await render(<FacilityLayer places={[makePlace()]} onPressFacility={jest.fn()} />);

    // Android's Google Maps SDK names a marker for TalkBack from its title and ignores accessibilityLabel
    // (react-native-maps#3500).
    expect(screen.getByTestId('facility_marker_LM_FOOD_01').props.title).toBe('Food Court 1');
  });

  test('exposes an accessible name on the facility marker', async () => {
    await render(<FacilityLayer places={[makePlace()]} onPressFacility={jest.fn()} />);

    expect(screen.getByLabelText('Food Court 1')).toBeTruthy();
  });
});

describe('FacilityLayer — marker rendering (#128 C)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const tracks = () => screen.getByTestId('facility_marker_LM_FOOD_01').props.tracksViewChanges;

  // With tracksViewChanges={false} from the first frame, Android freezes the marker bitmap before the
  // lucide SVG child has painted and the facility icons never appear on the map.
  test('tracks view changes while the icon first paints, then freezes the bitmap', async () => {
    await render(<FacilityLayer places={[makePlace()]} onPressFacility={jest.fn()} />);
    expect(tracks()).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(MARKER_PAINT_MS + 100);
    });
    expect(tracks()).toBe(false);
  });

  test('tracks again briefly when the selected style changes, so the gold ring is captured', async () => {
    const view = await render(<FacilityLayer places={[makePlace()]} onPressFacility={jest.fn()} />);
    await act(async () => {
      jest.advanceTimersByTime(MARKER_PAINT_MS + 100);
    });
    expect(tracks()).toBe(false);

    await view.rerender(<FacilityLayer places={[makePlace()]} selectedPlaceId="LM_FOOD_01" onPressFacility={jest.fn()} />);
    expect(tracks()).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(MARKER_PAINT_MS + 100);
    });
    expect(tracks()).toBe(false);
  });
});
