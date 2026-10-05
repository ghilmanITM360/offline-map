/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from './test-utils';
import { useRerouteRevealKey } from '../views/components/mapgl/useRerouteRevealKey';

const hook = (initial: string | null) =>
  renderHook(({ k }: { k: string | null }) => useRerouteRevealKey(k), { initialProps: { k: initial } });

describe('useRerouteRevealKey', () => {
  it('is undefined for the route navigation starts with, and while there is no route', async () => {
    const { result, rerender } = await hook(null);
    expect(result.current).toBeUndefined();
    await rerender({ k: 'A' });
    expect(result.current).toBeUndefined();
    await rerender({ k: 'A' });
    expect(result.current).toBeUndefined();
  });

  it('gives a new key when the route is replaced, and keeps it stable until the next replacement', async () => {
    const { result, rerender } = await hook('A');
    await rerender({ k: 'B' });
    const first = result.current;
    expect(first).toBeDefined();
    await rerender({ k: 'B' });
    expect(result.current).toBe(first);
    await rerender({ k: 'C' });
    expect(result.current).not.toBe(first);
  });

  it('treats a return to an earlier route as a new reroute, not as the start route', async () => {
    const { result, rerender } = await hook('A');
    await rerender({ k: 'B' });
    await rerender({ k: 'A' });
    expect(result.current).toBeDefined();
  });

  it('forgets everything when navigation ends, so the next trip starts clean', async () => {
    const { result, rerender } = await hook('A');
    await rerender({ k: 'B' });
    await rerender({ k: null });
    expect(result.current).toBeUndefined();
    await rerender({ k: 'B' });
    expect(result.current).toBeUndefined();
  });
});
