/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'react-native';
import { render, screen } from './test-utils';

import { Card } from '../views/components/common/Card';
import { DARK_THEME, LIGHT_THEME } from '../services/ThemeService';

function flattenBg(node: ReturnType<typeof screen.getByText>) {
  const style = node.parent!.props.style;
  const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
  return flat.backgroundColor;
}

describe('Card — theme-aware surface', () => {
  test('neutral variant uses light theme card surface, not a hardcoded white', async () => {
    await render(
      <Card theme={LIGHT_THEME}>
        <Text>content</Text>
      </Card>,
    );
    expect(flattenBg(screen.getByText('content'))).toBe(LIGHT_THEME.card);
  });

  test('neutral variant uses dark theme card surface', async () => {
    await render(
      <Card theme={DARK_THEME}>
        <Text>content</Text>
      </Card>,
    );
    expect(flattenBg(screen.getByText('content'))).toBe(DARK_THEME.card);
    expect(flattenBg(screen.getByText('content'))).not.toBe(LIGHT_THEME.card);
  });

  test('success variant background also follows theme in dark mode', async () => {
    await render(
      <Card theme={DARK_THEME} variant="success">
        <Text>content</Text>
      </Card>,
    );
    expect(flattenBg(screen.getByText('content'))).toBe(DARK_THEME.card);
  });
});
