/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from './test-utils';
import { useCameraManager } from '../viewmodels/useCameraManager';

function makeFakeMapRef() {
  return {
    current: {
      animateToRegion: jest.fn(),
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn(),
    },
  } as any;
}

const ROUTE_COORDS = [
  { latitude: 24.9, longitude: 67.1 },
  { latitude: 24.91, longitude: 67.11 },
  { latitude: 24.92, longitude: 67.12 },
];
// Dimension-dependent commands (animateToRegion/fitToCoordinates) hit a native
// "Map size can't be 0" exception if issued before the map has both native-ready
// and a measured non-zero layout — see useCameraManager's readiness gate.
function markCameraReady(result: { current: ReturnType<typeof useCameraManager> }) {
  result.current.notifyNativeMapReady();
  result.current.notifyMapLayout(390, 844);
}

describe('route camera intent ownership (#307)', () => {
  test('expanded, partial and collapsed padding updates preserve the same route camera', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));
    await act(() => {
      markCameraReady(result);
      result.current.fitRoute(ROUTE_COORDS, { top: 50, right: 20, bottom: 700, left: 20 });
    });
    mapRef.current.fitToCoordinates.mockClear();
    for (const bottom of [400, 100]) {
      await act(() => result.current.fitRoute(ROUTE_COORDS.map(c => ({ ...c })), { top: 50, right: 20, bottom, left: 20 }));
      expect(mapRef.current.animateCamera).toHaveBeenLastCalledWith(
        { padding: { top: 50, right: 20, bottom, left: 20 } }, { duration: 0 });
    }
    await act(() => {
      result.current.notifyInitialRegionSettled();
      result.current.notifyInitialRegionSettled();
    });
    expect(mapRef.current.fitToCoordinates).not.toHaveBeenCalled();
  });

  test('manual pan survives sheet movement and delayed initial-region callbacks', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));
    await act(() => {
      markCameraReady(result);
      result.current.fitRoute(ROUTE_COORDS);
      result.current.cancelEarlyReplay();
      result.current.stopFollowing();
    });
    mapRef.current.fitToCoordinates.mockClear();
    await act(() => {
      result.current.fitRoute([...ROUTE_COORDS], { top: 50, right: 20, bottom: 100, left: 20 });
      result.current.notifyInitialRegionSettled();
      result.current.notifyInitialRegionSettled();
    });
    expect(mapRef.current.fitToCoordinates).not.toHaveBeenCalled();
    expect(result.current.mode).toBe('EXPLORING');
    await act(() => result.current.fitRoute([ROUTE_COORDS[0], ROUTE_COORDS[1]]));
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe('ROUTE_PREVIEW');
  });

  test('queued route and startup replay use latest padding, never stale expanded-sheet padding', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));
    const padding = { top: 50, right: 20, bottom: 100, left: 20 };
    await act(() => {
      result.current.fitRoute(ROUTE_COORDS);
      result.current.fitRoute([...ROUTE_COORDS], padding);
      markCameraReady(result);
      result.current.notifyInitialRegionSettled();
    });
    expect(mapRef.current.fitToCoordinates.mock.calls).toHaveLength(2);
    for (const call of mapRef.current.fitToCoordinates.mock.calls) expect(call[1].edgePadding).toEqual(padding);
  });
});
