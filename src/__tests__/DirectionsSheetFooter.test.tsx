/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen } from './test-utils';

import { DirectionsSheetFooter, publishDirectionsFooter } from '../views/components/map/DirectionsSheetFooter';

describe('DirectionsSheetFooter — system navigation bar (#128)', () => {
  afterEach(async () => {
    await act(async () => {
      publishDirectionsFooter(null);
    });
  });

  test('pads the pinned footer by the bottom safe-area inset so Start Navigation clears the navigation bar', async () => {
    await act(async () => {
      publishDirectionsFooter(<Text>Start Navigation</Text>);
    });
    await render(<DirectionsSheetFooter animatedFooterPosition={{ value: 0 } as never} />);

    // The sheet container runs to the window bottom, behind the bar; test-utils reports a 34 dp bottom inset.
    const footer = screen.getByText('Start Navigation').parent;
    expect(StyleSheet.flatten(footer?.props.style).paddingBottom).toBe(8 + 34);
  });
});
