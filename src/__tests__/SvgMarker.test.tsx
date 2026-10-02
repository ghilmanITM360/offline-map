/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated } from 'react-native';
import { act, render, screen } from './test-utils';

import { UserLocationMarker } from '../views/components/map/UserLocationMarker';
import { MARKER_PAINT_MS } from '../views/components/map/useMarkerPaintWindow';

// Markers with an SVG child freeze a blank bitmap when tracksViewChanges is false from the first frame
// (#128 C: facility markers; the same applies to the pins and the user dot).
describe('SvgMarker users (#128 C)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('the user location dot tracks view changes while its icon paints, then freezes', async () => {
    await render(
      <UserLocationMarker coordinate={{ latitude: 24.96, longitude: 67.0 }} pulseAnim={new Animated.Value(0)} />,
    );
    const marker = () => screen.getByTestId('browse-user-location-marker');
    expect(marker().props.tracksViewChanges).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(MARKER_PAINT_MS + 100);
    });
    expect(marker().props.tracksViewChanges).toBe(false);
  });
});
