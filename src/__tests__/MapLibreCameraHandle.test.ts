import { createMapLibreCameraHandle, googleZoomToMapLibre, mapLibreZoomToGoogle, regionToMapLibreZoom } from '../views/components/mapgl/maplibreCameraHandle';

// Fakes record what the adapter asks MapLibre to do, so the contract with useCameraManager is pinned
// without a native map.
function setup(viewport = { width: 400, height: 800 }, ready = true) {
  const stops: Record<string, unknown>[] = [];
  const camera = { setStop: jest.fn(async (s: Record<string, unknown>) => void stops.push(s)) };
  const map = {
    getViewState: jest.fn(async () => ({ center: [67.0, 25.0] as [number, number], zoom: 16, bearing: 30, pitch: 10, bounds: [66.99, 24.99, 67.01, 25.01] })),
    project: jest.fn(async (lngLat: [number, number]) => [lngLat[0] * 10, lngLat[1] * 10] as [number, number]),
  };
  const handle = createMapLibreCameraHandle({ getCamera: () => camera as never, getMap: () => map as never, getViewport: () => viewport, isReady: () => ready });
  return { handle, stops, camera, map };
}

describe('zoom conversion (Google 256px world ↔ MapLibre 512px world)', () => {
  it('MapLibre zoom is Google zoom minus one', () => {
    expect(googleZoomToMapLibre(18)).toBe(17);
    expect(mapLibreZoomToGoogle(17)).toBe(18);
  });

  it('derives the MapLibre zoom that shows the region longitude span across the viewport width', () => {
    // 400dp wide, 0.002° of longitude: Google-equivalent zoom = log2(360*400/(256*0.002)) ≈ 18.1 → MapLibre ≈ 17.1
    expect(regionToMapLibreZoom({ longitudeDelta: 0.002 }, 400)).toBeCloseTo(Math.log2((360 * 400) / (512 * 0.002)), 6);
  });
});

describe('createMapLibreCameraHandle', () => {
  it('animateToRegion eases to the region centre with the requested duration', () => {
    const { handle, stops } = setup();
    handle.animateToRegion({ latitude: 25, longitude: 67, latitudeDelta: 0.002, longitudeDelta: 0.002 }, 260);
    expect(stops[0]).toMatchObject({ center: [67, 25], duration: 260, easing: 'ease', bearing: 0, pitch: 0 });
    expect(stops[0].zoom).toBeCloseTo(regionToMapLibreZoom({ longitudeDelta: 0.002 }, 400), 6);
  });

  it('fitToCoordinates fits [west,south,east,north] with padding and an ease (not the library default fly)', () => {
    const { handle, stops } = setup();
    handle.fitToCoordinates(
      [
        { latitude: 25.0, longitude: 67.0 },
        { latitude: 25.01, longitude: 67.02 },
      ],
      { edgePadding: { top: 90, right: 64, bottom: 140, left: 64 }, animated: true },
    );
    expect(stops[0]).toMatchObject({ bounds: [67.0, 25.0, 67.02, 25.01], padding: { top: 90, right: 64, bottom: 140, left: 64 }, easing: 'ease', bearing: 0, pitch: 0 });
    expect(stops[0].duration).toBeLessThanOrEqual(700);
  });

  it('fitToCoordinates without animation jumps (duration 0)', () => {
    const { handle, stops } = setup();
    handle.fitToCoordinates([{ latitude: 25, longitude: 67 }, { latitude: 25.01, longitude: 67.01 }], { edgePadding: { top: 1, right: 1, bottom: 1, left: 1 }, animated: false });
    expect(stops[0]).toMatchObject({ duration: 0 });
  });

  it('animateCamera maps Google zoom/heading to MapLibre zoom/bearing and only sends provided keys', () => {
    const { handle, stops } = setup();
    handle.animateCamera({ center: { latitude: 25, longitude: 67 }, zoom: 18, heading: 90, pitch: 30 }, { duration: 800 });
    expect(stops[0]).toEqual({ center: [67, 25], zoom: 17, bearing: 90, pitch: 30, duration: 800, easing: 'ease' });
    handle.animateCamera({ heading: 0, pitch: 0 }, { duration: 500 });
    expect(stops[1]).toEqual({ bearing: 0, pitch: 0, duration: 500, easing: 'ease' });
  });

  it('getCamera reports Google-equivalent zoom and heading so nudgeZoom keeps its semantics', async () => {
    const { handle } = setup();
    await expect(handle.getCamera()).resolves.toEqual({ center: { latitude: 25, longitude: 67 }, zoom: 17, heading: 30, pitch: 10 });
  });

  it('pointForCoordinate projects through the map', async () => {
    const { handle, map } = setup();
    await expect(handle.pointForCoordinate({ latitude: 25, longitude: 67 })).resolves.toEqual({ x: 670, y: 250 });
    expect(map.project).toHaveBeenCalledWith([67, 25]);
  });

  it('is a no-op (never throws) before the native refs exist', async () => {
    const handle = createMapLibreCameraHandle({ getCamera: () => null, getMap: () => null, getViewport: () => ({ width: 0, height: 0 }), isReady: () => true });
    expect(() => handle.animateToRegion({ latitude: 1, longitude: 1, latitudeDelta: 1, longitudeDelta: 1 })).not.toThrow();
    await expect(handle.getCamera()).rejects.toThrow(/not ready/i);
  });

  // MLRNMapView.project() dereferences the native MapLibreMap, which only exists once the map has loaded; calling it
  // earlier threw an NPE on the main thread and tore down the whole React host (MapLabelOverlay projects on mount).
  it('never touches the native map before it is ready', async () => {
    const { handle, map, camera } = setup({ width: 400, height: 800 }, false);
    await expect(handle.pointForCoordinate({ latitude: 25, longitude: 67 })).rejects.toThrow(/not ready/i);
    await expect(handle.getCamera()).rejects.toThrow(/not ready/i);
    handle.animateToRegion({ latitude: 25, longitude: 67, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    handle.animateCamera({ heading: 10 });
    handle.fitToCoordinates([{ latitude: 25, longitude: 67 }]);
    expect(map.project).not.toHaveBeenCalled();
    expect(map.getViewState).not.toHaveBeenCalled();
    expect(camera.setStop).not.toHaveBeenCalled();
  });

  // Google's newLatLngBounds/animateToRegion reset tilt and rotation; MapLibre keeps the current ones, so after Exit from
  // the tilted navigation camera every place/route/venue move would stay tilted (touchPitch is off, the user can't undo it).
  it('programmatic fits and region moves reset bearing and pitch to north-up, flat', () => {
    const { handle, stops } = setup();
    handle.animateToRegion({ latitude: 25, longitude: 67, latitudeDelta: 0.002, longitudeDelta: 0.002 });
    handle.fitToCoordinates([{ latitude: 25, longitude: 67 }, { latitude: 25.01, longitude: 67.01 }]);
    expect(stops.map((x) => [x.bearing, x.pitch])).toEqual([[0, 0], [0, 0]]);
  });

  it('a zero-extent fit (single point / identical points) still frames a small area instead of a degenerate bounds', () => {
    const { handle, stops } = setup();
    handle.fitToCoordinates([{ latitude: 25, longitude: 67 }, { latitude: 25, longitude: 67 }]);
    const [west, south, east, north] = stops[0].bounds as number[];
    expect(east - west).toBeGreaterThan(0);
    expect(north - south).toBeGreaterThan(0);
  });

  it('swallows native rejections instead of leaving unhandled promise rejections', async () => {
    const { handle, camera } = setup();
    camera.setStop.mockRejectedValueOnce(new Error('native gone'));
    expect(() => handle.animateCamera({ heading: 5 })).not.toThrow();
    await Promise.resolve();
  });
});
