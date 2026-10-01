/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { SearchBarField } from '../views/components/common/SearchBarField';

describe('SearchBarField — large font scale', () => {
  test('#65: caps OS font scaling at 1.8x so the fixed-height row never clips text', async () => {
    await render(<SearchBarField testID="search-field" placeholder="Search" />);

    expect(screen.getByTestId('search-field').props.maxFontSizeMultiplier).toBe(1.8);
  });
});

describe('SearchBarField — hint at large font scale and narrow widths (#128 A)', () => {
  // Android draws a TextInput's native hint itself: at 200% font on a 320 dp window it wrapped to a second line
  // that the fixed-height field clipped, and it cannot ellipsize. The visible hint is therefore a one-line Text.
  const hint = (text: string) => screen.queryByText(text, { includeHiddenElements: true });

  test('shows the hint as a single ellipsizing line while the field is empty', async () => {
    await render(<SearchBarField testID="field" value="" onChangeText={jest.fn()} placeholder="Search destinations" />);

    const overlay = hint('Search destinations');
    expect(overlay).not.toBeNull();
    expect(overlay?.props.numberOfLines).toBe(1);
    expect(overlay?.props.ellipsizeMode).toBe('tail');
    expect(overlay?.props.maxFontSizeMultiplier).toBe(1.8);
  });

  test('the visible hint never competes with the field for touches or for TalkBack', async () => {
    await render(<SearchBarField testID="field" value="" onChangeText={jest.fn()} placeholder="Search destinations" />);

    const overlay = hint('Search destinations');
    expect(overlay?.props.accessible).toBe(false);
    expect(overlay?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(overlay?.props.pointerEvents).toBe('none');
  });

  test('keeps the native placeholder (transparent) and names the field once', async () => {
    await render(<SearchBarField testID="field" value="" onChangeText={jest.fn()} placeholder="Search destinations" />);

    const input = screen.getByTestId('field');
    expect(input.props.placeholder).toBe('Search destinations');
    expect(input.props.placeholderTextColor).toBe('transparent');
    expect(input.props.accessibilityLabel).toBe('Search destinations');
  });

  test('an explicit accessibilityLabel is not overridden', async () => {
    await render(<SearchBarField testID="field" value="" placeholder="Search…" accessibilityLabel="Search destinations" />);

    expect(screen.getByTestId('field').props.accessibilityLabel).toBe('Search destinations');
  });

  test('the hint disappears as soon as there is text, and the placeholder colour is restored', async () => {
    await render(<SearchBarField testID="field" value="24" onChangeText={jest.fn()} placeholder="Search destinations" />);

    expect(hint('Search destinations')).toBeNull();
    expect(screen.getByTestId('field').props.placeholderTextColor).not.toBe('transparent');
  });

  test('an uncontrolled field keeps the native placeholder and adds no overlay', async () => {
    await render(<SearchBarField testID="field" placeholder="Search destinations" />);

    expect(hint('Search destinations')).toBeNull();
    expect(screen.getByTestId('field').props.placeholderTextColor).not.toBe('transparent');
  });
});
