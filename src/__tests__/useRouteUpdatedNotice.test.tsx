/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { act, renderHook } from './test-utils';
import { ROUTE_UPDATED_MESSAGE, ROUTE_UPDATED_VISIBLE_MS, useRouteUpdatedNotice } from '../viewmodels/useRouteUpdatedNotice';

function setup() {
  return renderHook(() => {
    const [message, setMessage] = useState<string | null>(null);
    return { message, setMessage, notice: useRouteUpdatedNotice(setMessage) };
  });
}

describe('useRouteUpdatedNotice', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('says "Route updated", then clears itself', async () => {
    const hook = await setup();
    await act(async () => hook.result.current.notice.announce());
    expect(hook.result.current.message).toBe(ROUTE_UPDATED_MESSAGE);
    await act(async () => { jest.advanceTimersByTime(ROUTE_UPDATED_VISIBLE_MS + 10); });
    expect(hook.result.current.message).toBeNull();
  });

  test('never erases a newer status that replaced it', async () => {
    const hook = await setup();
    await act(async () => hook.result.current.notice.announce());
    await act(async () => hook.result.current.setMessage('Weak GPS'));
    await act(async () => { jest.advanceTimersByTime(ROUTE_UPDATED_VISIBLE_MS + 10); });
    expect(hook.result.current.message).toBe('Weak GPS');
  });

  test('a new reroute attempt cancels the pending clear, and the handle is stable across renders', async () => {
    const hook = await setup();
    const first = hook.result.current.notice;
    await act(async () => hook.result.current.notice.announce());
    await act(async () => hook.result.current.notice.cancel());
    await act(async () => hook.result.current.setMessage('Recalculating...'));
    await act(async () => { jest.advanceTimersByTime(ROUTE_UPDATED_VISIBLE_MS * 2); });
    expect(hook.result.current.message).toBe('Recalculating...');
    expect(hook.result.current.notice).toBe(first);
  });
});
