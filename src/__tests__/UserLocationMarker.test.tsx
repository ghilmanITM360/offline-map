/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated } from 'react-native';
import { render, screen } from './test-utils';

import { UserLocationMarker } from '../views/components/map/UserLocationMarker';

describe('UserLocationMarker — marker accessibility (#157)', () => {
  test('exposes an accessible name for a live fix', async () => {
    await render(
      <UserLocationMarker coordinate={{ latitude: 24.9645, longitude: 67.0065 }} pulseAnim={new Animated.Value(0)} />,
    );

    expect(screen.getByLabelText('Your location')).toBeTruthy();
  });

  test('distinguishes a remembered ("last known") fix in its accessible name', async () => {
    await render(
      <UserLocationMarker
        coordinate={{ latitude: 24.9645, longitude: 67.0065 }}
        pulseAnim={new Animated.Value(0)}
        isRemembered
      />,
    );

    expect(screen.getByLabelText('Your last known location')).toBeTruthy();
  });

  test('announces the "last known" badge politely only for a remembered fix', async () => {
    const coordinate = { latitude: 24.9645, longitude: 67.0065 };
    await render(<UserLocationMarker coordinate={coordinate} pulseAnim={new Animated.Value(0)} isRemembered />);

    // The badge is a live region so a fix that turns stale is announced without moving focus.
    expect(screen.getByText('last known').parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  test('renders no "last known" badge for a live fix', async () => {
    await render(
      <UserLocationMarker coordinate={{ latitude: 24.9645, longitude: 67.0065 }} pulseAnim={new Animated.Value(0)} />,
    );

    expect(screen.queryByText('last known')).not.toBeOnTheScreen();
  });
});
