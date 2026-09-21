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
