import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { Button } from '../views/components/common/Button';

describe('shared CTA label layout', () => {
  it.each([
    'Choose a different starting point for this destination',
    'Is manzil ke liye doosra shuruati maqam chunein',
    'اس منزل کے لیے دوسرا ابتدائی مقام منتخب کریں',
  ])('allows a long label to wrap between icons: %s', async label => {
    const { getByText, getByRole } = await render(
      <Button label={label} icon={<Text>+</Text>} trailingIcon={<Text>›</Text>} />,
    );
    const text = getByText(label);
    // A row's Text otherwise keeps its intrinsic width and pushes the trailing
    // control outside a narrow CTA. Shrinking permits wrapping at large fonts.
    expect(StyleSheet.flatten(text.props.style)).toEqual(
      expect.objectContaining({ flexShrink: 1, textAlign: 'center' }),
    );
    expect(text.props.numberOfLines).toBeUndefined();
    expect(getByRole('button')).toBeTruthy();
  });
});
