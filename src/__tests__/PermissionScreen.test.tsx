/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from './test-utils';

import { PermissionScreen } from '../views/screens/PermissionScreen';

const mockNavigation = { canGoBack: () => false, goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
let mockRouteParams: { revoked?: boolean } | undefined;
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => mockNavigation, useRoute: () => ({ params: mockRouteParams }) };
});

jest.mock('../viewmodels/PermissionViewModel', () => ({
  usePermissionViewModel: () => ({ loading: false, requestPermission: jest.fn(), skipPermission: jest.fn() }),
}));

beforeEach(() => {
  mockRouteParams = undefined;
});

describe('PermissionScreen (#153 Finding 2, PERM-005)', () => {
  test('a genuine first ask shows no "turned off" hint', async () => {
    await render(<PermissionScreen />);

    expect(screen.queryByText(/may have been turned off/)).not.toBeOnTheScreen();
  });

  test('a returning user after revocation sees a distinguishing hint', async () => {
    mockRouteParams = { revoked: true };
    await render(<PermissionScreen />);

    expect(screen.getByText(/may have been turned off/)).toBeOnTheScreen();
  });

  test('#153 Finding 5: persistent copy states the live-navigation consequence of skipping', async () => {
    await render(<PermissionScreen />);

    expect(screen.getByText(/live navigation won't work/)).toBeOnTheScreen();
  });
});
