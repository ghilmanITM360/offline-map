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

describe('useCameraManager', () => {
  test('current location button flow (followUser) calls animateToUser and enters FOLLOWING_USER', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    expect(result.current.mode).toBe('IDLE');

    await act(() => {
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

    await act(() => result.current.followUser(USER_COORD));
    expect(result.current.mode).toBe('FOLLOWING_USER');

    await act(() => result.current.stopFollowing());
    expect(result.current.mode).toBe('EXPLORING');
  });

  test('selecting a place with the default (half) sheet shifts the camera north so the marker clears it', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

    await act(() => {
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
      result.current.animateToPlace(PLACE);
    });

    const [, duration] = mapRef.current.animateToRegion.mock.calls[0];
    expect(duration).toBeGreaterThanOrEqual(150);
    expect(duration).toBeLessThanOrEqual(300);
  });

  test('animateToPlace shifts the camera further north the more the sheet covers (bottom edge > center > top)', async () => {
    const mapRef = makeFakeMapRef();
    const { result } = await renderHook(() => useCameraManager({ mapRef }));

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
