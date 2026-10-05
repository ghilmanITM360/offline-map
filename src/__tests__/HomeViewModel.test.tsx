import { act, renderHook } from './test-utils';
import { useHomeViewModel } from '../viewmodels/HomeViewModel';
import { useAppStore } from '../store/useAppStore';
import { Place } from '../models/types';

const initialStoreState = useAppStore.getState();
const originalV2MapFlag = process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;

beforeEach(() => {
  useAppStore.setState(initialStoreState, true);
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'true';
});

afterEach(() => {
  if (originalV2MapFlag === undefined) {
    delete process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP;
    return;
  }
  process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = originalV2MapFlag;
});

describe('HomeViewModel pending directory selection', () => {
  const directoryPlace: Place = {
    id: 'B1',
    name: 'Block 1',
    category: 'Block',
    description: 'Block 1 of Karachi Ijtema ground.',
    coordinate: { latitude: 24.9, longitude: 67.0 },
    sourceVersion: 'v2',
    sourceKind: 'block',
  };

  test('consumes a destination handed off by the Locations Directory screen through the existing selection pipeline', async () => {
    const hook = await renderHook(() => useHomeViewModel());

    await act(() => {
      useAppStore.getState().setPendingDirectorySelection(directoryPlace);
    });

    // Routed through the same handlePlaceSelect every map tap/search result uses —
    // selectedPlace updates and the hand-off field clears itself immediately after.
    expect(hook.result.current.selectedPlace).toEqual(directoryPlace);
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
  });

  test('holds a hand-off until Home is the focused screen (#190)', async () => {
    const hook = await renderHook(
      (props: { isFocused: boolean }) => useHomeViewModel({ isFocused: props.isFocused }),
      { initialProps: { isFocused: false } },
    );

    await act(() => {
      useAppStore.getState().setPendingDirectorySelection(directoryPlace);
    });

    // The Directory has not finished popping: applying the selection now would present
    // the sheet over the screen that is still on top.
    expect(hook.result.current.selectedPlace).toBeNull();
    expect(useAppStore.getState().pendingDirectorySelection).toEqual(directoryPlace);

    await hook.rerender({ isFocused: true });

    expect(hook.result.current.selectedPlace).toEqual(directoryPlace);
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
  });

  test('moves the camera onto a handed-off place while the Directory is still closing, so the map is revealed on it', async () => {
    const hook = await renderHook(
      (props: { isFocused: boolean }) => useHomeViewModel({ isFocused: props.isFocused }),
      { initialProps: { isFocused: false } },
    );
    const animateToRegion = jest.fn();
    (hook.result.current.mapRef as { current: unknown }).current = { animateToRegion, animateCamera: jest.fn(), fitToCoordinates: jest.fn() };
    await act(() => {
      hook.result.current.cameraManager.notifyNativeMapReady();
      hook.result.current.cameraManager.notifyMapLayout(390, 844);
    });

    await act(() => {
      useAppStore.getState().setPendingDirectorySelection(directoryPlace);
    });

    // An instant jump (the Directory covers the map), not an ease the user would watch after the reveal.
    expect(animateToRegion).toHaveBeenCalledTimes(1);
    const [region, duration] = animateToRegion.mock.calls[0];
    expect(duration).toBe(0);
    expect(region.longitude).toBeCloseTo(directoryPlace.coordinate!.longitude, 5);
    // Selection (and the sheet) still wait for focus.
    expect(hook.result.current.selectedPlace).toBeNull();

    await hook.rerender({ isFocused: true });
    expect(hook.result.current.selectedPlace).toEqual(directoryPlace);
    // The camera is already there: the focus-time selection must not queue a second, visible ease over the jump.
    expect(animateToRegion.mock.calls.every(([, ms]) => ms === 0)).toBe(true);
  });

  test('does nothing when no destination is pending', async () => {
    const hook = await renderHook(() => useHomeViewModel());

    expect(hook.result.current.selectedPlace).toBeNull();
    expect(useAppStore.getState().pendingDirectorySelection).toBeNull();
  });
});

describe('HomeViewModel committed location venue status', () => {
  test('classifies each externally committed live location in its first render without a watcher tick', async () => {
    const renders: Array<{
      currentLocation: { latitude: number; longitude: number } | null;
      venueStatus: { insideVenue: boolean; insideBlock: string | null };
    }> = [];
    const insideVenue = { latitude: 24.965, longitude: 67.005 };
    const outsideVenue = { latitude: 24.9022, longitude: 67.1024 };
    // Inside only RoutingService's legacy rectangular venue boundary, not V2's
    // precise geometry. This proves flag-off classification still uses canonical V1.
    const v1OnlyVenue = { latitude: 24.9656, longitude: 66.9985 };

    const hook = await renderHook(() => {
      const model = useHomeViewModel();
      renders.push({
        currentLocation: model.currentLocation,
        venueStatus: model.venueStatus,
      });
      return model;
    });

    const insideRenderStart = renders.length;
    await act(() => {
      useAppStore.getState().setCurrentLocation(insideVenue, 'live');
    });

    expect(useAppStore.getState().currentLocationSource).toBe('live');
    const insideRenders = renders.slice(insideRenderStart).filter((render) => render.currentLocation === insideVenue);
    expect(insideRenders[0]).toEqual({
      currentLocation: insideVenue,
      venueStatus: { insideVenue: true, insideBlock: 'B35' },
    });
    expect(insideRenders).not.toContainEqual({
      currentLocation: insideVenue,
      venueStatus: { insideVenue: false, insideBlock: null },
    });

    const outsideRenderStart = renders.length;
    await act(() => {
      useAppStore.getState().setCurrentLocation(outsideVenue, 'live');
    });

    expect(useAppStore.getState().currentLocationSource).toBe('live');
    const outsideRenders = renders.slice(outsideRenderStart).filter((render) => render.currentLocation === outsideVenue);
    expect(outsideRenders[0]).toEqual({
      currentLocation: outsideVenue,
      venueStatus: { insideVenue: false, insideBlock: null },
    });
    expect(outsideRenders).not.toContainEqual({
      currentLocation: outsideVenue,
      venueStatus: { insideVenue: true, insideBlock: null },
    });
    expect(hook.result.current.venueStatus.insideVenue).toBe(false);

    process.env.EXPO_PUBLIC_USE_IJTEMA_V2_MAP = 'false';
    const v1RenderStart = renders.length;
    await act(() => {
      useAppStore.getState().setCurrentLocation(v1OnlyVenue, 'live');
    });

    expect(useAppStore.getState().currentLocationSource).toBe('live');
    const v1Renders = renders.slice(v1RenderStart).filter((render) => render.currentLocation === v1OnlyVenue);
    expect(v1Renders[0]).toEqual({
      currentLocation: v1OnlyVenue,
      venueStatus: { insideVenue: true, insideBlock: null },
    });
    expect(v1Renders).not.toContainEqual({
      currentLocation: v1OnlyVenue,
      venueStatus: { insideVenue: false, insideBlock: null },
    });
  });
});
