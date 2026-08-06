/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, BackHandler } from 'react-native';

import { renderHook } from './test-utils';
import { useNavigationOverlayV1 } from '../viewmodels/useNavigationOverlayV1';

const mockVm = {
  route: null as any,
  snappedLocation: null,
  arrived: false,
  handleExit: jest.fn(),
};

jest.mock('../viewmodels/NavigationViewModel', () => ({
  useNavigationViewModel: () => mockVm,
}));

const FAKE_ROUTE = { id: 'route-v1', coordinates: [], totalDistance: 0 };

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
