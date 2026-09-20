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
