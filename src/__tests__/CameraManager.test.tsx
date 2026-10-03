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

const USER_COORD = { latitude: 24.91, longitude: 67.12 };
const PLACE = { coordinate: { latitude: 24.92, longitude: 67.13 } };
const ROUTE_COORDS = [
  { latitude: 24.9, longitude: 67.1 },
  { latitude: 24.91, longitude: 67.11 },
  { latitude: 24.92, longitude: 67.12 },
];
const BOUNDARY_COORDS = [
  { latitude: 24.895, longitude: 67.095 },
  { latitude: 24.905, longitude: 67.115 },
];

// Dimension-dependent commands (animateToRegion/fitToCoordinates) hit a native
// "Map size can't be 0" exception if issued before the map has both native-ready
// and a measured non-zero layout — see useCameraManager's readiness gate.
function markCameraReady(result: { current: ReturnType<typeof useCameraManager> }) {
  result.current.notifyNativeMapReady();
  result.current.notifyMapLayout(390, 844);
}

describe('useCameraManager', () => {
  test('current location button flow (followUser) calls animateToUser and enters FOLLOWING_USER', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    expect(result.current.mode).toBe('IDLE');

    await act(() => {
      markCameraReady(result);
      result.current.followUser(USER_COORD);
    });

    expect(mapRef.current.animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: USER_COORD.latitude, longitude: USER_COORD.longitude }),
      expect.any(Number),
    );
    expect(result.current.mode).toBe('FOLLOWING_USER');
  });

  test('manually dragging the map exits follow mode (stopFollowing), same as Google Maps', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.followUser(USER_COORD);
    });
    expect(result.current.mode).toBe('FOLLOWING_USER');

    await act(() => result.current.stopFollowing());
    expect(result.current.mode).toBe('EXPLORING');
  });

  test('selecting a place with the default (half) sheet shifts the camera north so the marker clears it', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.animateToPlace(PLACE);
    });

    expect(mapRef.current.animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ longitude: PLACE.coordinate.longitude }),
      expect.any(Number),
    );
    // The LocationSheet opens over roughly half the screen right after this call
    // (HomeViewModel.handlePlaceSelect), so the region center must sit south of the
    // marker — otherwise the marker renders right behind the sheet's top edge instead
    // of visible above it.
    const [region] = mapRef.current.animateToRegion.mock.calls[0];
    expect(region.latitude).toBeLessThan(PLACE.coordinate.latitude);
  });

  test('animateToPlace uses a short (150-300ms) pan by default, not the slower 1s used elsewhere', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.animateToPlace(PLACE);
    });

    const [, duration] = mapRef.current.animateToRegion.mock.calls[0];
    expect(duration).toBeGreaterThanOrEqual(150);
    expect(duration).toBeLessThanOrEqual(300);
  });

  test('animateToPlace shifts the camera further north the more the sheet covers (bottom edge > center > top)', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));
    await act(() => markCameraReady(result));

    // "place near bottom edge" — sheet nearly full-screen (expanded snap point).
    await act(() => result.current.animateToPlace(PLACE, 0.92));
    const expandedLatitude = mapRef.current.animateToRegion.mock.calls[0][0].latitude;

    // "place near center" — sheet at its default half-screen snap point.
    await act(() => result.current.animateToPlace(PLACE, 0.5));
    const halfLatitude = mapRef.current.animateToRegion.mock.calls[1][0].latitude;

    // "place near top" — sheet collapsed to a small peek.
    await act(() => result.current.animateToPlace(PLACE, 0.15));
    const collapsedLatitude = mapRef.current.animateToRegion.mock.calls[2][0].latitude;

    // A bigger sheet must push the marker (and so the region center) further north —
    // i.e. a smaller/more negative latitude offset from the marker's real latitude.
    expect(expandedLatitude).toBeLessThan(halfLatitude);
    expect(halfLatitude).toBeLessThan(collapsedLatitude);
    // Even a barely-open sheet still biases the camera slightly north of dead-center,
    // per Google Maps POI selection behavior — never regresses to a plain centered camera.
    expect(collapsedLatitude).toBeLessThan(PLACE.coordinate.latitude);
  });

  test('opening route preview calls fitRoute and enters ROUTE_PREVIEW showing the whole route', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.fitRoute(ROUTE_COORDS);
    });

    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledWith(
      ROUTE_COORDS,
      expect.objectContaining({ animated: true }),
    );
    expect(result.current.mode).toBe('ROUTE_PREVIEW');
  });

  test('starting navigation enables a following camera (enterNavigationCamera)', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      result.current.enterNavigationCamera(USER_COORD, { zoom: 18, pitch: 30 });
    });

    expect(mapRef.current.animateCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { latitude: USER_COORD.latitude, longitude: USER_COORD.longitude },
        zoom: 18,
        pitch: 30,
      }),
      expect.any(Object),
    );
    expect(result.current.mode).toBe('NAVIGATION');

    await act(() => result.current.exitNavigationCamera());
    expect(result.current.mode).toBe('EXPLORING');
  });
});

describe('useCameraManager - a move issued before the initial region is applied is re-run (#222)', () => {
  test('the last early move is replayed on the first settle and again on the second, then never more', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.animateToPlace(PLACE);
    });
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(1);

    await act(() => result.current.notifyInitialRegionSettled());
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(2);

    await act(() => result.current.notifyInitialRegionSettled());
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(3);

    await act(() => result.current.notifyInitialRegionSettled());
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(3);
  });

  test('a newer move replaces the remembered one, so the replay never goes back to an older target', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.animateToPlace(PLACE);
      result.current.animateToUser(USER_COORD);
    });
    mapRef.current.animateToRegion.mockClear();

    await act(() => result.current.notifyInitialRegionSettled());

    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(1);
    expect(mapRef.current.animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: USER_COORD.latitude, longitude: USER_COORD.longitude }),
      expect.any(Number),
    );
  });

  test('a move queued until the map became ready is also replayed on settle', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => result.current.animateToPlace(PLACE));
    expect(mapRef.current.animateToRegion).not.toHaveBeenCalled();

    await act(() => markCameraReady(result));
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(1);

    await act(() => result.current.notifyInitialRegionSettled());
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(2);
  });

  test('a user gesture after the first positioning cancels the replay, so a pan is never pulled back', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.animateToPlace(PLACE);
    });
    await act(() => result.current.notifyInitialRegionSettled());
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(2);

    await act(() => result.current.cancelEarlyReplay());
    await act(() => result.current.notifyInitialRegionSettled());

    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(2);
  });

  test('a move that already ran after the region was applied can be released so it is not applied a second time', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.notifyInitialRegionSettled();
      result.current.animateToUser(USER_COORD);
      result.current.cancelEarlyReplay();
    });
    await act(() => result.current.notifyInitialRegionSettled());

    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(1);
  });

  test('a move issued after a cancel is remembered again, so a later place selection still gets its replay', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.cancelEarlyReplay();
      result.current.animateToPlace(PLACE);
    });
    await act(() => result.current.notifyInitialRegionSettled());

    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(2);
  });

  test('settling with no early move does nothing', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      markCameraReady(result);
      result.current.notifyInitialRegionSettled();
    });

    expect(mapRef.current.animateToRegion).not.toHaveBeenCalled();
  });
});


// Phase 0D-A: dimension-dependent camera commands (animateToRegion/fitToCoordinates,
// via animateToUser/animateToPlace/fitVenueBounds/fitRoute) hit a native
// "Map size can't be 0" exception when issued before the map view has both fired
// native onMapReady AND been measured with a non-zero layout size. useCameraManager is
// the single camera-policy owner, so it gates those commands on
// nativeMapReady && layoutWidth > 0 && layoutHeight > 0, queuing the latest pending
// intent and releasing it exactly once when readiness becomes true. animateCamera-based
// commands (enterNavigationCamera/resetCompass/rotateToHeading/nudgeZoom) don't need
// bounds and stay ungated — covered above.
describe('useCameraManager camera-readiness gate (Phase 0D-A)', () => {
  test('onMapReady before positive layout: command queues, then fires once layout goes positive', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      result.current.notifyNativeMapReady();
      result.current.fitVenueBounds(BOUNDARY_COORDS);
    });
    expect(mapRef.current.fitToCoordinates).not.toHaveBeenCalled();

    await act(() => {
      result.current.notifyMapLayout(390, 844);
    });
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledTimes(1);
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledWith(
      BOUNDARY_COORDS,
      expect.objectContaining({ animated: true }),
    );
  });

  test('positive layout before onMapReady: command queues, then fires once native map is ready', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      result.current.notifyMapLayout(390, 844);
      result.current.animateToUser(USER_COORD);
    });
    expect(mapRef.current.animateToRegion).not.toHaveBeenCalled();

    await act(() => {
      result.current.notifyNativeMapReady();
    });
    expect(mapRef.current.animateToRegion).toHaveBeenCalledTimes(1);
  });

  test('zero-size layout does not release a queued camera command', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      result.current.notifyNativeMapReady();
      result.current.fitRoute(ROUTE_COORDS);
    });
    await act(() => result.current.notifyMapLayout(0, 844));
    expect(mapRef.current.fitToCoordinates).not.toHaveBeenCalled();

    await act(() => result.current.notifyMapLayout(390, 0));
    expect(mapRef.current.fitToCoordinates).not.toHaveBeenCalled();
  });

  test('zero to positive layout releases the pending intent exactly once', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      result.current.notifyNativeMapReady();
      result.current.fitRoute(ROUTE_COORDS);
      result.current.notifyMapLayout(0, 0);
    });
    expect(mapRef.current.fitToCoordinates).not.toHaveBeenCalled();

    await act(() => result.current.notifyMapLayout(390, 844));
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe('ROUTE_PREVIEW');
  });

  test('latest pending camera intent wins if several arrive before readiness', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      result.current.fitVenueBounds(BOUNDARY_COORDS);
      result.current.animateToUser(USER_COORD);
      result.current.fitRoute(ROUTE_COORDS);
    });
    expect(mapRef.current.fitToCoordinates).not.toHaveBeenCalled();
    expect(mapRef.current.animateToRegion).not.toHaveBeenCalled();

    await act(() => markCameraReady(result));

    // Only the last queued intent (fitRoute) actually reaches native — the earlier
    // fitVenueBounds/animateToUser intents were superseded, not queued alongside it.
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledTimes(1);
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledWith(
      ROUTE_COORDS,
      expect.objectContaining({ animated: true }),
    );
    expect(mapRef.current.animateToRegion).not.toHaveBeenCalled();
    expect(result.current.mode).toBe('ROUTE_PREVIEW');
  });

  test('already-ready camera operations still execute immediately, synchronously', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));
    await act(() => markCameraReady(result));

    await act(() => result.current.fitVenueBounds(BOUNDARY_COORDS));

    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledTimes(1);
  });

  test('readiness does not cause duplicate camera execution on repeated ready/layout notifications', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
      result.current.notifyNativeMapReady();
      result.current.fitVenueBounds(BOUNDARY_COORDS);
      result.current.notifyMapLayout(390, 844);
    });
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledTimes(1);

    // Native onLayout can fire repeatedly with the same/other positive sizes, and
    // onMapReady-style signals could in principle re-fire — neither should replay
    // the already-executed intent.
    await act(() => {
      result.current.notifyMapLayout(390, 844);
      result.current.notifyMapLayout(400, 900);
      result.current.notifyNativeMapReady();
    });
    expect(mapRef.current.fitToCoordinates).toHaveBeenCalledTimes(1);
  });

  test('remount does not reuse stale readiness from a previous mount', async () => {
    const mapRefA = makeFakeMapRef();
    const first = await renderHook(() => useCameraManager({ mapRef: mapRefA }));
    await act(() => markCameraReady(first.result));
    first.unmount();

    const mapRefB = makeFakeMapRef();
    const second = await renderHook(() => useCameraManager({ mapRef: mapRefB }));

    await act(() => {
      second.result.current.fitVenueBounds(BOUNDARY_COORDS);
    });

    // The fresh hook instance starts unready again — it must not inherit readiness
    // (or fire immediately) just because a prior mount had already become ready.
    expect(mapRefB.current.fitToCoordinates).not.toHaveBeenCalled();

    await act(() => second.result.current.notifyNativeMapReady());
    await act(() => second.result.current.notifyMapLayout(390, 844));
    expect(mapRefB.current.fitToCoordinates).toHaveBeenCalledTimes(1);
  });
});
