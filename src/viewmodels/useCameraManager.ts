/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { MapCameraHandle } from '../views/components/mapgl/MapCameraHandle';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coordinate } from '../models/types';
import { NAV_TRANSITION_TIMINGS } from '../constants/navigationTransitions';
import { OVERLAY_CONTROL_GAP } from './useOverlayInsets';

export type CameraMode = 'IDLE' | 'EXPLORING' | 'FOLLOWING_USER' | 'ROUTE_PREVIEW' | 'NAVIGATION';

/** North-up (locked bearing) vs follow-heading (bearing tracks device compass) —
 * driven by the compass button, independent of CameraMode (position/follow state). */
export type CompassMode = 'NORTH_UP' | 'FOLLOW_HEADING';

interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Params {
  mapRef: React.RefObject<MapCameraHandle | null>;
}

const USER_ZOOM_DELTA = 0.005;
// How many times a camera move issued before the map's initial region was applied is re-run (the first region-complete
// and the time bound, whichever order they arrive in).
const INITIAL_REGION_SETTLE_REPLAYS = 2;
const PLACE_ZOOM_DELTA = 0.002;
const DEFAULT_ROUTE_PADDING: EdgePadding = { top: 90, right: 64, bottom: 140, left: 64 };
const DEFAULT_BOUNDS_PADDING: EdgePadding = { top: 48, right: 48, bottom: 48, left: 48 };

// Google Maps pans quickly on POI selection, not the slower 1s used for recenter/follow —
// exported so HomeViewModel can stagger the LocationSheet's own present() call to land
// after the pan (see FIX 3: camera moves, then the sheet springs in over it).
export const PLACE_SELECTION_CAMERA_DURATION_MS = 260;

// animateToPlace must keep the selected marker visible above whatever LocationSheet snap
// height is about to cover the bottom of the screen — collapsed (15%), half (50%), or
// expanded (92%) all obstruct a different amount, so a single fixed offset (the old
// approach) only looked right at one snap height. These bounds keep the marker from ever
// landing under the safe area/top chrome (MIN) or sinking back toward screen-center even
// when the sheet is barely covering anything (MAX) — Google Maps always biases "upper".
const MARKER_SCREEN_FRACTION_MIN = 0.14;
const MARKER_SCREEN_FRACTION_MAX = 0.42;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Single orchestration point for MapView camera movement. Callers (HomeViewModel, HomeScreen,
 * the nav overlay viewmodels) call one of these methods instead of reaching into mapRef.current
 * directly, so "what is the camera doing right now" (CameraMode) can never drift out of sync
 * with what actually moved it — mirrors how useMapMode is the single source of truth for what
 * the map surface is showing.
 */
export function useCameraManager({ mapRef }: Params) {
  const [mode, setMode] = useState<CameraMode>('IDLE');
  const modeRef = useRef<CameraMode>('IDLE');
  const setCameraMode = useCallback((next: CameraMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  // Dimension-dependent commands (animateToRegion/fitToCoordinates, used below by
  // animateToUser/animateToPlace/fitVenueBounds/fitRoute) reach a native
  // newLatLngBounds() call that throws "Map size can't be 0" if issued before the
  // map view has both fired native onMapReady AND been measured with a non-zero
  // layout size — the two signals are independent and either can arrive first.
  // Local refs (not state) so a remount starts genuinely unready rather than
  // inheriting a previous mount's readiness.
  const nativeMapReadyRef = useRef(false);
  const layoutSizeRef = useRef({ width: 0, height: 0 });
  const pendingIntentRef = useRef<(() => void) | null>(null);

  const isCameraReady = useCallback(
    () => nativeMapReadyRef.current && layoutSizeRef.current.width > 0 && layoutSizeRef.current.height > 0,
    [],
  );

  // The native map applies its initial region some time after onMapReady (about 6 s on a loaded emulator) and
  // drops a camera command issued before that. So the last move run in that window is remembered and re-run
  // when the initial region is reported applied (see notifyInitialRegionSettled).
  const lastEarlyIntentRef = useRef<(() => void) | null>(null);
  const settleCountRef = useRef(0);

  const flushPendingIntent = useCallback(() => {
    if (!isCameraReady() || !pendingIntentRef.current) return;
    const intent = pendingIntentRef.current;
    pendingIntentRef.current = null;
    intent();
    // A move queued until the map became ready (the usual Directory-to-place case) runs inside the same window.
    if (settleCountRef.current < INITIAL_REGION_SETTLE_REPLAYS) lastEarlyIntentRef.current = intent;
  }, [isCameraReady]);

  // Callers never lose an intent issued too early — the latest one simply
  // supersedes whatever was still pending, mirroring how a real camera only ever
  // has one "next destination" in flight.
  const runWhenReady = useCallback(
    (intent: () => void) => {
      if (isCameraReady()) {
        intent();
        if (settleCountRef.current < INITIAL_REGION_SETTLE_REPLAYS) lastEarlyIntentRef.current = intent;
        return;
      }
      pendingIntentRef.current = intent;
    },
    [isCameraReady],
  );

  /** Called when the map's initial region is known to be applied (its first region-complete) and once more after
   * a short time bound in case that event never comes, so a move dropped before then is re-run. Idempotent moves
   * only; at most two replays, and a newer move replaces the remembered one. */
  const notifyInitialRegionSettled = useCallback(() => {
    if (settleCountRef.current >= INITIAL_REGION_SETTLE_REPLAYS) return;
    settleCountRef.current += 1;
    lastEarlyIntentRef.current?.();
    if (settleCountRef.current >= INITIAL_REGION_SETTLE_REPLAYS) lastEarlyIntentRef.current = null;
  }, []);

  /** Forget the remembered early move: the user has taken the camera (a pan), or the move already ran after the
   * initial region was applied. A later move is remembered again as usual. */
  const cancelEarlyReplay = useCallback(() => {
    lastEarlyIntentRef.current = null;
  }, []);

  const notifyNativeMapReady = useCallback(() => {
    if (nativeMapReadyRef.current) return;
    nativeMapReadyRef.current = true;
    flushPendingIntent();
  }, [flushPendingIntent]);

  const notifyMapLayout = useCallback(
    (width: number, height: number) => {
      layoutSizeRef.current = { width, height };
      flushPendingIntent();
    },
    [flushPendingIntent],
  );

  // Sheet-aware camera offset inputs — same safe-area/frame primitives useOverlayInsets.ts
  // already establishes as the single source of truth for "how much of the screen is
  // covered right now", reused here instead of a second ad hoc measurement.
  const frame = useSafeAreaFrame();
  const insets = useSafeAreaInsets();

  const animateToUser = useCallback(
    (coord: Coordinate, duration = 1000) => {
      runWhenReady(() => {
        mapRef.current?.animateToRegion(
          { latitude: coord.latitude, longitude: coord.longitude, latitudeDelta: USER_ZOOM_DELTA, longitudeDelta: USER_ZOOM_DELTA },
          duration,
        );
      });
    },
    [mapRef, runWhenReady],
  );

  const animateToPlace = useCallback(
    (
      place: { coordinate?: Coordinate | null },
      sheetCoverageFraction = 0.5,
      duration = PLACE_SELECTION_CAMERA_DURATION_MS,
    ) => {
      if (!place.coordinate) return;
      const coordinate = place.coordinate;
      const windowHeight = frame.height || 1;
      const sheetHeightPx = clamp(sheetCoverageFraction, 0, 1) * windowHeight;
      // Top clearance mirrors the same OVERLAY_CONTROL_GAP used to keep floating controls
      // clear of the bottom overlay — applied here to the top edge/safe area instead.
      const visibleTopPx = insets.top + OVERLAY_CONTROL_GAP;
      const visibleBottomPx = Math.max(windowHeight - sheetHeightPx, visibleTopPx + 1);
      // Marker lands at the vertical center of whatever screen band is NOT covered by the
      // sheet or the top chrome, clamped to stay "upper" even at the extremes (barely-open
      // or nearly-full-screen sheet).
      const markerScreenFraction = clamp(
        (visibleTopPx + visibleBottomPx) / 2 / windowHeight,
        MARKER_SCREEN_FRACTION_MIN,
        MARKER_SCREEN_FRACTION_MAX,
      );
      runWhenReady(() => {
        mapRef.current?.animateToRegion(
          {
            // Screen fraction 0.5 (dead center) needs no shift; below 0.5 (marker pushed
            // toward the top) needs the region center shifted south of the marker
            // (northern-hemisphere latitudes here) so the marker renders further up-screen.
            latitude: coordinate.latitude + PLACE_ZOOM_DELTA * (markerScreenFraction - 0.5),
            longitude: coordinate.longitude,
            latitudeDelta: PLACE_ZOOM_DELTA,
            longitudeDelta: PLACE_ZOOM_DELTA,
          },
          duration,
        );
        setCameraMode('EXPLORING');
      });
    },
    [frame.height, insets.top, mapRef, runWhenReady, setCameraMode],
  );

  const fitVenueBounds = useCallback(
    (boundary: Coordinate[], edgePadding: EdgePadding = DEFAULT_BOUNDS_PADDING) => {
      if (boundary.length === 0) return;
      runWhenReady(() => {
        mapRef.current?.fitToCoordinates(boundary, { edgePadding, animated: true });
        setCameraMode('EXPLORING');
      });
    },
    [mapRef, runWhenReady, setCameraMode],
  );

  const fitRoute = useCallback(
    (coordinates: Coordinate[], edgePadding: EdgePadding = DEFAULT_ROUTE_PADDING) => {
      if (coordinates.length < 2) return;
      runWhenReady(() => {
        mapRef.current?.fitToCoordinates(coordinates, { edgePadding, animated: true });
        setCameraMode('ROUTE_PREVIEW');
      });
    },
    [mapRef, runWhenReady, setCameraMode],
  );

  const followUser = useCallback(
    (coord: Coordinate, duration = 1000) => {
      animateToUser(coord, duration);
      setCameraMode('FOLLOWING_USER');
    },
    [animateToUser, setCameraMode],
  );

  const stopFollowing = useCallback(() => {
    if (modeRef.current === 'FOLLOWING_USER') setCameraMode('EXPLORING');
  }, [setCameraMode]);

  const enterNavigationCamera = useCallback(
    (coord: Coordinate, opts?: { heading?: number; zoom?: number; pitch?: number; duration?: number }) => {
      mapRef.current?.animateCamera(
        {
          center: { latitude: coord.latitude, longitude: coord.longitude },
          zoom: opts?.zoom ?? 18,
          heading: opts?.heading ?? coord.heading ?? 0,
          pitch: opts?.pitch ?? 30,
        },
        { duration: opts?.duration ?? NAV_TRANSITION_TIMINGS.cameraEnterMs },
      );
      setCameraMode('NAVIGATION');
    },
    [mapRef, setCameraMode],
  );

  const exitNavigationCamera = useCallback(() => {
    if (modeRef.current === 'NAVIGATION') setCameraMode('EXPLORING');
  }, [setCameraMode]);

  const resetCompass = useCallback(
    (duration = 500) => {
      mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration });
    },
    [mapRef],
  );

  /** Rotates the camera bearing to match a device heading without touching CameraMode —
   * used by the compass button's FOLLOW_HEADING mode, called on each GPS heading tick. */
  const rotateToHeading = useCallback(
    (heading: number, duration = 300) => {
      mapRef.current?.animateCamera({ heading }, { duration });
    },
    [mapRef],
  );

  const nudgeZoom = useCallback(
    (delta: number, onZoom?: (zoom: number) => void) => {
      mapRef.current
        ?.getCamera()
        .then((camera) => {
          if (camera.zoom !== undefined) {
            camera.zoom += delta;
            mapRef.current?.animateCamera(camera);
            onZoom?.(camera.zoom);
          }
        })
        .catch(() => undefined); // map not ready / torn down: nothing to zoom
    },
    [mapRef],
  );

  return useMemo(
    () => ({
      mode,
      animateToUser,
      animateToPlace,
      fitVenueBounds,
      fitRoute,
      followUser,
      stopFollowing,
      enterNavigationCamera,
      exitNavigationCamera,
      resetCompass,
      rotateToHeading,
      nudgeZoom,
      notifyNativeMapReady,
      notifyInitialRegionSettled,
      cancelEarlyReplay,
      notifyMapLayout,
    }),
    [
      mode,
      animateToUser,
      animateToPlace,
      fitVenueBounds,
      fitRoute,
      followUser,
      stopFollowing,
      enterNavigationCamera,
      exitNavigationCamera,
      resetCompass,
      rotateToHeading,
      nudgeZoom,
      notifyNativeMapReady,
      notifyInitialRegionSettled,
      cancelEarlyReplay,
      notifyMapLayout,
    ],
  );
}

export type CameraManager = ReturnType<typeof useCameraManager>;
