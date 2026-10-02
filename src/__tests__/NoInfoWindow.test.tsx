/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from './test-utils';

import { NoInfoWindow } from '../views/components/map/NoInfoWindow';

describe('NoInfoWindow (#128 C)', () => {
  // react-native-maps (Android) skips wrapping a Callout that has no native children, and React Native
  // flattens an empty <View />, so the default title bubble and Google toolbar appeared on every tap.
  test('keeps one real, non-collapsable child inside a tooltip callout', async () => {
    await render(<NoInfoWindow />);

    const child = screen.getByTestId('no-info-window-child');
    expect(child.props.collapsable).toBe(false);
    expect(StyleSheet.flatten(child.props.style)).toEqual({ width: 1, height: 1 });
    expect(child.parent?.props.tooltip).toBe(true);
  });
});
