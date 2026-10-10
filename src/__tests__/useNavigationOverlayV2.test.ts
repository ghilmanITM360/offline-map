import { seedRunningNavigation } from './navigationFixture';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, BackHandler } from 'react-native';

import { act, renderHook, waitFor } from './test-utils';
import { useNavigationOverlayV2 } from '../viewmodels/useNavigationOverlayV2';
import { useAppStore } from '../store/useAppStore';

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

const FAKE_ROUTE = {
  id: 'route-v2', routeId: 'route-v2', sourceVersion: 'v2', destination: { blockId: 'B1' },
  coordinates: [{ latitude: 24.9, longitude: 67.1 }, { latitude: 24.901, longitude: 67.101 }],
  totalDistanceM: 100, etaMinutes: 2,
};
const DESTINATION = { id: 'B1', name: 'Block 1', category: 'Block', description: 'Block 1', sourceVersion: 'v2' } as any;

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
  afterEach(() => {
    jest.restoreAllMocks();
    mockVm.route = null;
    mockVm.arrived = false;
  });

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
    expect(alertSpy).toHaveBeenCalledWith('Stop directions?', expect.any(String), expect.any(Array), expect.any(Object));
    expect(mockVm.handleExit).not.toHaveBeenCalled();

    // Arrival: hardware Back completes immediately, same as visible Done.
    const cancelButton = (alertSpy.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void }>).find((button) => button.text === 'Cancel');
    cancelButton?.onPress?.();
    alertSpy.mockClear();
    mockVm.arrived = true;
    await rerender(baseProps);
    handler = latestHandler(addEventListenerSpy);
    expect(handler).toBeDefined();
    handler!();
    handler!();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockVm.handleExit).toHaveBeenCalledTimes(1);

    // Exit completes: route clears, and the listener is torn down entirely.
    addEventListenerSpy.mockClear();
    mockVm.route = null;
    mockVm.arrived = false;
    await rerender(baseProps);
    expect(latestHandler(addEventListenerSpy)).toBeUndefined();
  });

  test('direct-guide hardware Back uses the active-navigation confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const addEventListenerSpy = jest.spyOn(BackHandler, 'addEventListener');
    mockVm.route = {
      ...FAKE_ROUTE,
      outsideRoute: {
        provider: 'direct-guide',
        roadFollowing: false,
      },
    };
    mockVm.arrived = false;
    mockVm.handleExit = jest.fn();
    const cameraManager = {
      fitRoute: jest.fn(),
      fitVenueBounds: jest.fn(),
      enterNavigationCamera: jest.fn(),
      exitNavigationCamera: jest.fn(),
    } as any;
    const props = {
      mapRef: { current: null },
      mapReady: true,
      mapZoomLevel: 16,
      hasBaseMap: true,
      userPulseAnim: {} as any,
      cameraManager,
    };
    await renderHook(() => useNavigationOverlayV2(props));

    const handler = latestHandler(addEventListenerSpy);
    expect(handler).toBeDefined();
    expect(handler!()).toBe(true);
    expect(alertSpy).toHaveBeenCalledWith(
      'Stop directions?',
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
    expect(mockVm.handleExit).not.toHaveBeenCalled();
    expect(mockVm.route?.outsideRoute?.provider).toBe('direct-guide');
  });
});

describe('useNavigationOverlayV2 — per-trip camera ownership', () => {
  afterEach(() => {
    useAppStore.getState().stopNavigation();
    mockVm.route = null;
    mockVm.snappedLocation = null;
    mockVm.arrived = false;
  });

  test.each(['exit', 'arrival'] as const)('a new trip follows after %s ends the previous free-pan trip', async (ending) => {
    const cameraManager = {
      fitRoute: jest.fn(), fitVenueBounds: jest.fn(), enterNavigationCamera: jest.fn(), exitNavigationCamera: jest.fn(),
    } as any;
    const props = {
      mapRef: { current: {} as any }, mapReady: true, mapZoomLevel: 16, hasBaseMap: true,
      userPulseAnim: {} as any, cameraManager,
    };
    mockVm.route = FAKE_ROUTE;
    mockVm.snappedLocation = FAKE_ROUTE.coordinates[0];
    seedRunningNavigation(DESTINATION, FAKE_ROUTE as any, []);
    const hook = await renderHook(() => useNavigationOverlayV2(props));
    expect(hook.result.current.isAutoFollowing).toBe(true);
    await waitFor(() => expect(cameraManager.enterNavigationCamera).toHaveBeenCalledTimes(1));
    cameraManager.enterNavigationCamera.mockClear();

    await act(() => hook.result.current.setIsAutoFollowing(false));
    mockVm.snappedLocation = { latitude: 24.9002, longitude: 67.1002 };
    await hook.rerender(undefined);
    expect(cameraManager.enterNavigationCamera).not.toHaveBeenCalled();

    if (ending === 'arrival') {
      mockVm.arrived = true;
      await hook.rerender(undefined);
    }
    await act(() => useAppStore.getState().stopNavigation());
    mockVm.route = null;
    mockVm.arrived = false;
    await hook.rerender(undefined);
    const nextRoute = { ...FAKE_ROUTE, id: 'trip-2', routeId: 'trip-2' };
    mockVm.route = nextRoute;
    await act(() => seedRunningNavigation(DESTINATION, nextRoute as any, []));
    await hook.rerender(undefined);

    expect(hook.result.current.isAutoFollowing).toBe(true);
    await waitFor(() => expect(cameraManager.enterNavigationCamera).toHaveBeenCalledTimes(1));
  });

  test('initial fit runs once; follow and free-pan ownership survive multiple reroutes', async () => {
    const cameraManager = {
      fitRoute: jest.fn(), fitVenueBounds: jest.fn(), enterNavigationCamera: jest.fn(), exitNavigationCamera: jest.fn(),
    } as any;
    const props = {
      mapRef: { current: {} as any }, mapReady: true, mapZoomLevel: 16, hasBaseMap: true,
      userPulseAnim: {} as any, cameraManager,
    };
    mockVm.route = FAKE_ROUTE;
    mockVm.snappedLocation = FAKE_ROUTE.coordinates[0];
    seedRunningNavigation(DESTINATION, FAKE_ROUTE as any, []);
    const hook = await renderHook(() => useNavigationOverlayV2(props));
    await waitFor(() => expect(cameraManager.fitRoute).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(cameraManager.enterNavigationCamera).toHaveBeenCalledTimes(1));

    mockVm.route = { ...FAKE_ROUTE, id: 'reroute-1', routeId: 'reroute-1' };
    await hook.rerender(undefined);
    expect(cameraManager.fitRoute).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isAutoFollowing).toBe(true);

    await act(() => hook.result.current.setIsAutoFollowing(false));
    mockVm.route = { ...FAKE_ROUTE, id: 'reroute-2', routeId: 'reroute-2' };
    mockVm.snappedLocation = { latitude: 24.9004, longitude: 67.1004 };
    await hook.rerender(undefined);
    expect(cameraManager.fitRoute).toHaveBeenCalledTimes(1);
    expect(cameraManager.enterNavigationCamera).toHaveBeenCalledTimes(2);
    expect(hook.result.current.isAutoFollowing).toBe(false);
  });
});
