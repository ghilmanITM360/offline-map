import type { MessageKey } from '../i18n/messages';
import { translate } from '../i18n/translate';
import { useLocaleStore } from '../i18n/localeStore';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { act, renderHook } from './test-utils';
import { ROUTE_UPDATED_MESSAGE, ROUTE_UPDATED_VISIBLE_MS, useRouteUpdatedNotice } from '../viewmodels/useRouteUpdatedNotice';

function setup() {
  return renderHook(() => {
    const [storedMessage, setMessage] = useState<string | { key: MessageKey } | null>(null);
    const locale = useLocaleStore(state => state.locale);
    const message = typeof storedMessage === 'object' && storedMessage !== null
      ? translate(locale, storedMessage.key)
      : storedMessage;
    return { message, setMessage, notice: useRouteUpdatedNotice(setMessage) };
  });
}

describe('useRouteUpdatedNotice', () => {
  beforeEach(() => { jest.useFakeTimers(); useLocaleStore.getState().setLocale('en'); });
  afterEach(() => { jest.useRealTimers(); useLocaleStore.getState().setLocale('en'); });

  test('says "Route updated", then clears itself', async () => {
    const hook = await setup();
    await act(async () => hook.result.current.notice.announce());
    expect(hook.result.current.message).toBe(ROUTE_UPDATED_MESSAGE());
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
    await act(async () => hook.result.current.setMessage('Finding a new way…'));
    await act(async () => { jest.advanceTimersByTime(ROUTE_UPDATED_VISIBLE_MS * 2); });
    expect(hook.result.current.message).toBe('Finding a new way…');
    expect(hook.result.current.notice).toBe(first);
  });
});

it('clears the accepted notice after a locale change without erasing a newer status', async () => {
  jest.useFakeTimers();
  const hook = await setup();
  await act(async () => useLocaleStore.getState().setLocale('ur'));
  await act(async () => hook.result.current.notice.announce());
  expect(hook.result.current.message).toBe(ROUTE_UPDATED_MESSAGE());
  await act(async () => useLocaleStore.getState().setLocale('en'));
  await act(async () => { jest.advanceTimersByTime(ROUTE_UPDATED_VISIBLE_MS + 10); });
  expect(hook.result.current.message).toBeNull();
  jest.useRealTimers();
});

const noticeCopy = {
  en: 'Route updated',
  'ur-Latn': 'Rasta badal gaya',
  ur: 'راستہ بدل گیا',
} as const;

test.each(['en', 'ur-Latn', 'ur'] as const)(
  'a notice created in %s translates on every locale change and expires at its original deadline',
  async initialLocale => {
    jest.useFakeTimers();
    useLocaleStore.getState().setLocale(initialLocale);
    const hook = await setup();
    await act(async () => hook.result.current.notice.announce());
    const handle = hook.result.current.notice;
    for (const locale of ['en', 'ur', 'ur-Latn'] as const) {
      await act(async () => { jest.advanceTimersByTime(1000); useLocaleStore.getState().setLocale(locale); });
      expect(hook.result.current.message).toBe(noticeCopy[locale]);
      expect(hook.result.current.notice).toBe(handle);
    }
    await act(async () => { jest.advanceTimersByTime(ROUTE_UPDATED_VISIBLE_MS - 3000 - 1); });
    expect(hook.result.current.message).toBe(noticeCopy['ur-Latn']);
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(hook.result.current.message).toBeNull();
    jest.useRealTimers();
    await act(async () => useLocaleStore.getState().setLocale('en'));
  },
);

test('changing locale during a notice never lets its deadline erase a newer generated status', async () => {
  jest.useFakeTimers();
  const hook = await setup();
  await act(async () => hook.result.current.notice.announce());
  await act(async () => { jest.advanceTimersByTime(1000); useLocaleStore.getState().setLocale('ur'); });
  await act(async () => hook.result.current.setMessage({key: 'navigation.keepRoute'}));
  await act(async () => { useLocaleStore.getState().setLocale('ur-Latn'); jest.advanceTimersByTime(4000); });
  expect(hook.result.current.message).toBe('Maujooda raste par chalte rahein.');
  jest.useRealTimers();
  await act(async () => useLocaleStore.getState().setLocale('en'));
});
