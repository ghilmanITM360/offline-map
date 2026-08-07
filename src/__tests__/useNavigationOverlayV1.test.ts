/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, BackHandler } from 'react-native';

import { act, renderHook, waitFor } from './test-utils';
import { useNavigationOverlayV1 } from '../viewmodels/useNavigationOverlayV1';
import { useAppStore } from '../store/useAppStore';

const mockVm = {
  route: null as any,
  snappedLocation: null,
  arrived: false,
  handleExit: jest.fn(),
};

jest.mock('../viewmodels/NavigationViewModel', () => ({
  useNavigationViewModel: () => mockVm,
}));

const FAKE_ROUTE = {
  id: 'route-v1',
  coordinates: [{ latitude: 24.966, longitude: 67.004 }, { latitude: 24.9662, longitude: 67.0042 }],
  totalDistance: 100,
};
const DESTINATION = { id: 'B1', name: 'Block 1', category: 'Block', description: 'Block 1' } as any;

function latestHandler(spy: jest.SpyInstance) {
  const calls = spy.mock.calls.filter(([eventName]) => eventName === 'hardwareBackPress');
  return calls[calls.length - 1]?.[1] as (() => boolean) | undefined;
}

describe('useNavigationOverlayV1 — hardware Back', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('confirms mid-navigation, then completes Arrival immediately once', async () => {
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
      hasBaseMap: true,
      userPulseAnim: {} as any,
      cameraManager,
    };
    const { rerender } = await renderHook((props: typeof baseProps) => useNavigationOverlayV1(props), {
      initialProps: baseProps,
    });

    let handler = latestHandler(addEventListenerSpy);
    expect(handler).toBeDefined();
    handler!();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockVm.handleExit).not.toHaveBeenCalled();

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
  });
});

describe('useNavigationOverlayV1 — per-trip camera ownership', () => {
  afterEach(() => {
    useAppStore.getState().stopNavigation();
    mockVm.route = null;
    mockVm.snappedLocation = null;
  });

  test('pan suspends follow for the trip, recenter restores it, and a new trip starts following', async () => {
    const cameraManager = {
      fitRoute: jest.fn(), fitVenueBounds: jest.fn(), enterNavigationCamera: jest.fn(), exitNavigationCamera: jest.fn(),
    } as any;
    const props = {
      mapRef: { current: {} as any }, mapReady: true, hasBaseMap: true,
      userPulseAnim: {} as any, cameraManager,
    };
    mockVm.route = FAKE_ROUTE;
    mockVm.snappedLocation = FAKE_ROUTE.coordinates[0];
    useAppStore.getState().startNavigation(DESTINATION, FAKE_ROUTE as any, []);
    const hook = await renderHook(() => useNavigationOverlayV1(props));

    expect(hook.result.current.isAutoFollowing).toBe(true);
    await waitFor(() => expect(cameraManager.enterNavigationCamera).toHaveBeenCalledTimes(1));

    await act(() => hook.result.current.setIsAutoFollowing(false));
    mockVm.snappedLocation = { latitude: 24.9661, longitude: 67.0041 };
    await hook.rerender(undefined);
    expect(cameraManager.enterNavigationCamera).toHaveBeenCalledTimes(1);

    await act(() => hook.result.current.setIsAutoFollowing(true));
    const callsAfterRecenter = cameraManager.enterNavigationCamera.mock.calls.length;
    mockVm.snappedLocation = { latitude: 24.96615, longitude: 67.00415 };
    await hook.rerender(undefined);
    expect(cameraManager.enterNavigationCamera).toHaveBeenCalledTimes(callsAfterRecenter + 1);

    await act(() => useAppStore.getState().stopNavigation());
    mockVm.route = null;
    await hook.rerender(undefined);
    const nextRoute = { ...FAKE_ROUTE, id: 'route-v1-next' };
    mockVm.route = nextRoute;
    await act(() => useAppStore.getState().startNavigation(DESTINATION, nextRoute as any, []));
    await hook.rerender(undefined);
    expect(hook.result.current.isAutoFollowing).toBe(true);
  });

  test('fits once per trip but never refits for reroute route identities', async () => {
    const cameraManager = {
      fitRoute: jest.fn(), fitVenueBounds: jest.fn(), enterNavigationCamera: jest.fn(), exitNavigationCamera: jest.fn(),
    } as any;
    const props = {
      mapRef: { current: {} as any }, mapReady: true, hasBaseMap: true,
      userPulseAnim: {} as any, cameraManager,
    };
    mockVm.route = FAKE_ROUTE;
    useAppStore.getState().startNavigation(DESTINATION, FAKE_ROUTE as any, []);
    const hook = await renderHook(() => useNavigationOverlayV1(props));
    await waitFor(() => expect(cameraManager.fitRoute).toHaveBeenCalledTimes(1));

    mockVm.route = { ...FAKE_ROUTE, id: 'reroute-1' };
    await hook.rerender(undefined);
    mockVm.route = { ...FAKE_ROUTE, id: 'reroute-2' };
    await hook.rerender(undefined);
    expect(cameraManager.fitRoute).toHaveBeenCalledTimes(1);

    await act(() => useAppStore.getState().stopNavigation());
    mockVm.route = null;
    await hook.rerender(undefined);
    mockVm.route = { ...FAKE_ROUTE, id: 'trip-2-route' };
    await act(() => useAppStore.getState().startNavigation(DESTINATION, mockVm.route as any, []));
    await hook.rerender(undefined);
    await waitFor(() => expect(cameraManager.fitRoute).toHaveBeenCalledTimes(2));
  });
});
