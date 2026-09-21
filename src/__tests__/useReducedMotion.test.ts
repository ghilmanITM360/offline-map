/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from './test-utils';
import { useReducedMotion } from '../viewmodels/useReducedMotion';

describe('useReducedMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reads the initial OS reduce-motion setting', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  test('defaults to false before the OS setting resolves, and false when it is off', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  test('updates live when the OS setting changes while mounted', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    let changeHandler: ((enabled: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, handler) => {
      changeHandler = handler as (enabled: boolean) => void;
      return { remove: jest.fn() };
    });

    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await act(async () => changeHandler?.(true));

    expect(result.current).toBe(true);
  });
});
