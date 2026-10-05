/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from './test-utils';
import { useDestinationPulse, PULSE_START_HOLD_MS } from '../viewmodels/useDestinationPulse';
import { PULSE_DURATION_MS } from '../views/components/mapgl/mapDesign';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const run = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

describe('useDestinationPulse', () => {
  test('is idle without a destination', async () => {
    const { result } = await renderHook(() => useDestinationPulse(null, false));
    expect(result.current).toBe('idle');
  });

  test('plays exactly one cycle per destination: start, out, then idle for good', async () => {
    const { result } = await renderHook(() => useDestinationPulse('a', false));
    expect(result.current).toBe('start');
    await run(PULSE_START_HOLD_MS);
    expect(result.current).toBe('out');
    await run(PULSE_DURATION_MS + 100);
    expect(result.current).toBe('idle');
    await run(10_000);
    expect(result.current).toBe('idle');
  });

  test('re-rendering with the same destination does not restart the pulse', async () => {
    const { result, rerender } = await renderHook(({ k }: { k: string }) => useDestinationPulse(k, false), { initialProps: { k: 'a' } });
    await run(PULSE_START_HOLD_MS + PULSE_DURATION_MS + 100);
    await rerender({ k: 'a' });
    expect(result.current).toBe('idle');
  });

  test('a new destination restarts the cycle', async () => {
    const { result, rerender } = await renderHook(({ k }: { k: string }) => useDestinationPulse(k, false), { initialProps: { k: 'a' } });
    await run(PULSE_START_HOLD_MS + PULSE_DURATION_MS + 100);
    await rerender({ k: 'b' });
    expect(result.current).toBe('start');
  });

  test('clearing the destination goes idle and cancels a cycle in flight', async () => {
    const { result, rerender } = await renderHook(({ k }: { k: string | null }) => useDestinationPulse(k, false), { initialProps: { k: 'a' as string | null } });
    await rerender({ k: null });
    expect(result.current).toBe('idle');
    await run(5_000);
    expect(result.current).toBe('idle');
  });

  test('reduced motion shows a static emphasis for as long as the destination is chosen, never an animation', async () => {
    const { result, rerender } = await renderHook(({ k }: { k: string | null }) => useDestinationPulse(k, true), { initialProps: { k: 'a' as string | null } });
    expect(result.current).toBe('static');
    await run(10_000);
    expect(result.current).toBe('static');
    await rerender({ k: null });
    expect(result.current).toBe('idle');
  });
});
