import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from './test-utils';
import { useAccessibilityFocus } from '../views/hooks/useAccessibilityFocus';

let callbacks: Map<number, FrameRequestCallback>;
let nextFrame: number;
beforeEach(() => {
  jest.clearAllMocks();
  callbacks = new Map();
  nextFrame = 1;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    const id = nextFrame++;
    callbacks.set(id, callback);
    return id;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
});
afterEach(() => jest.restoreAllMocks());
async function flushFrames() {
  await act(() => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach(callback => callback(0));
  });
}

test('focus belongs to new journey stage, not repeated render or locale update', async () => {
  const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
  const target = {} as never;
  const hook = await renderHook(({ stage }) => useAccessibilityFocus(stage), { initialProps: { stage: 'destination:B28' } });
  hook.result.current.ref.current = target;
  await flushFrames();
  expect(send).toHaveBeenCalledWith(target, 'focus');
  await hook.rerender({ stage: 'destination:B28' });
  await flushFrames();
  expect(send).toHaveBeenCalledTimes(1);
  await hook.rerender({ stage: 'chooser:from' });
  await flushFrames();
  expect(send).toHaveBeenCalledTimes(2);
});

test('hidden stage and unmount retire pending focus; returning stage receives focus', async () => {
  const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
  const hook = await renderHook(({ stage }) => useAccessibilityFocus(stage), { initialProps: { stage: 'manual-guide' as string | null } });
  hook.result.current.ref.current = {} as never;
  await hook.rerender({ stage: null });
  await flushFrames();
  expect(send).not.toHaveBeenCalled();
  await hook.rerender({ stage: 'manual-guide' });
  await flushFrames();
  expect(send).toHaveBeenCalledTimes(1);
  await hook.rerender({ stage: 'replacement-preview' });
  await hook.unmount();
  await flushFrames();
  expect(send).toHaveBeenCalledTimes(1);
});
