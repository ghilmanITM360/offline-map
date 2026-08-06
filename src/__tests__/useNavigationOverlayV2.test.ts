/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, BackHandler } from 'react-native';

import { renderHook } from './test-utils';
import { useNavigationOverlayV2 } from '../viewmodels/useNavigationOverlayV2';

const mockVm = {
  route: null as any,
  destination: null,
  snappedLocation: null,
  arrived: false,
  handleExit: jest.fn(),
};

jest.mock('../viewmodels/NavigationViewModelV2', () => ({
  useNavigationViewModelV2: () => mockVm,
}));

const FAKE_ROUTE = { destination: { blockId: 'B1' }, coordinates: [], totalDistanceM: 0, etaMinutes: 0 };

function latestHandler(spy: jest.SpyInstance) {
  const calls = spy.mock.calls.filter(([eventName]) => eventName === 'hardwareBackPress');
  return calls[calls.length - 1]?.[1] as (() => boolean) | undefined;
}

// Stage 4 back-navigation completeness — NAVIGATION and ARRIVAL are the two MapMode
// states useNavigationOverlayV2 itself owns hardware-back handling for (HomeScreen's own
// BackHandler listener explicitly skips them, see HomeScreen.tsx's comment above its
// hardwareBackPress effect). Modeled as a single continuous trip (one render, driven
// through rerender()) rather than three separate mounts — this is also how it actually
// happens at runtime (arrived flips true mid-session, the hook instance never remounts).
// Calling the captured handler directly (no act() wrapper) is deliberate: the handler
// itself only calls Alert.alert (mocked) or the handleExit stub, neither of which touches
// this tree's own React state, so there's nothing here for act() to flush.
describe('useNavigationOverlayV2 — hardware back (NAVIGATION vs ARRIVAL)', () => {
  test('back-press handling adapts as the trip progresses from mid-trip to arrival to exit', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const addEventListenerSpy = jest.spyOn(BackHandler, 'addEventListener');
    mockVm.route = FAKE_ROUTE;
    mockVm.arrived = false;
    mockVm.handleExit = jest.fn();
    const cameraManager = {
      fitRoute: jest.fn(),
      fitVenueBounds: jest.fn(),
      enterNavigationCamera: jest.fn(),
      exitNavigationCamera: jest.fn(),
    } as any;
    const baseProps = {
      mapRef: { current: null },
      mapReady: true,
      mapZoomLevel: 16,
      hasBaseMap: true,
      // useNavigationOverlayV2 only passes this through untouched (never reads/animates
      // it), so a real Animated.Value isn't needed here.
      userPulseAnim: {} as any,
      cameraManager,
    };
    const { rerender } = await renderHook((props: typeof baseProps) => useNavigationOverlayV2(props), {
      initialProps: baseProps,
    });

    // Mid-trip: back shows the exit-navigation confirmation, does not exit directly.
    let handler = latestHandler(addEventListenerSpy);
    expect(handler).toBeDefined();
    handler!();
    expect(alertSpy).toHaveBeenCalledWith('Exit navigation?', expect.any(String), expect.any(Array), expect.any(Object));
    expect(mockVm.handleExit).not.toHaveBeenCalled();

    // Arrival: hardware Back still confirms; only visible Done skips confirmation.
    const cancelButton = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find((button) => button.text === 'Cancel');
    cancelButton?.onPress?.();
    alertSpy.mockClear();
    mockVm.arrived = true;
    await rerender(baseProps);
    handler = latestHandler(addEventListenerSpy);
    expect(handler).toBeDefined();
    handler!();
    expect(alertSpy).toHaveBeenCalledWith('Exit navigation?', expect.any(String), expect.any(Array), expect.any(Object));
    expect(mockVm.handleExit).not.toHaveBeenCalled();
    const exitButton = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find((button) => button.text === 'Exit');
    exitButton?.onPress?.();
    expect(mockVm.handleExit).toHaveBeenCalledTimes(1);

    // Exit completes: route clears, and the listener is torn down entirely.
    addEventListenerSpy.mockClear();
    mockVm.route = null;
    mockVm.arrived = false;
    await rerender(baseProps);
    expect(latestHandler(addEventListenerSpy)).toBeUndefined();
  });
});
