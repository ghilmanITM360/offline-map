/**
 * Jest setup for RNTL component tests (src/__tests__/**).
 *
 * jest-expo mocks native bridges (NativeModules for AIRMap*, RNSVG*, RNGestureHandlerModule,
 * ReanimatedModule, etc — see node_modules/jest-expo/src/preset/moduleMocks/thirdPartyModules.js)
 * but does NOT mock the react-native-maps JS component tree. MapView/Marker/etc still try to
 * render native host components via requireNativeComponent, which works but produces deeply
 * nested opaque native views that are painful (and unrealistic) to assert against in tests.
 * We replace them with plain View-based stand-ins that forward props/children so screens using
 * react-native-maps can render and be queried like normal RN views.
 */
jest.mock('react-native-maps', () => {
  const ReactActual = require('react');
  const { View: RNView } = require('react-native');

  const makeMock = (name: string) => {
    const Component = ReactActual.forwardRef((props: any, ref: any) =>
      ReactActual.createElement(RNView, { ...props, ref }, props.children),
    );
    Component.displayName = name;
    return Component;
  };

  // Screens call imperative methods on the MapView ref (animateToRegion, animateCamera,
  // fitToCoordinates, getCamera, ...) outside of any native layout pass. Expose no-op/resolved
  // stand-ins via useImperativeHandle so those calls don't throw under test.
  const MapView = ReactActual.forwardRef((props: any, ref: any) => {
    ReactActual.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn(),
      getCamera: jest.fn(() => Promise.resolve({ zoom: 16, center: { latitude: 0, longitude: 0 }, heading: 0, pitch: 0 })),
      setCamera: jest.fn(),
      getMapBoundaries: jest.fn(() =>
        Promise.resolve({
          northEast: { latitude: 0, longitude: 0 },
          southWest: { latitude: 0, longitude: 0 },
        }),
      ),
      // Deterministic linear stand-in — NOT a real Mercator/bearing projection, only
      // meant to give MapLabelOverlay a stable, distinct {x,y} per input coordinate
      // so tests can assert positioning/off-screen behavior without real native layout.
      pointForCoordinate: jest.fn((coordinate: { latitude: number; longitude: number }) =>
        Promise.resolve({
          x: Math.round((coordinate.longitude + 180) * 2),
          y: Math.round((90 - coordinate.latitude) * 2),
        }),
      ),
    }));
    return ReactActual.createElement(RNView, props, props.children);
  });
  MapView.displayName = 'MapView';

  return {
    __esModule: true,
    default: MapView,
    Marker: makeMock('Marker'),
    Circle: makeMock('Circle'),
    Polygon: makeMock('Polygon'),
    Polyline: makeMock('Polyline'),
    Callout: makeMock('Callout'),
    LocalTile: makeMock('LocalTile'),
    UrlTile: makeMock('UrlTile'),
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: 'default',
  };
});

// MapLibre (#140): the native map cannot run under Jest. Stand in with Views that forward props and
// children so screens render and tests can fire the map's event props (onDidFinishLoadingMap,
// onRegionDidChange, onPress, ...) and inspect the GeoJSON sources/layers that were mounted.
jest.mock('@maplibre/maplibre-react-native', () => {
  const ReactActual = require('react');
  const { View: RNView } = require('react-native');

  const Map = (props: any) => {
    ReactActual.useImperativeHandle(props.ref, () => ({
      // Tests choose what a tap hits via globalThis.__mockMapHits (reset to [] by the helper in tests).
      queryRenderedFeatures: jest.fn(() => Promise.resolve((globalThis as any).__mockMapHits ?? [])),
      getViewState: jest.fn(() =>
        Promise.resolve({ center: [67, 25], zoom: 16, bearing: 0, pitch: 0, bounds: [66.99, 24.99, 67.01, 25.01] }),
      ),
      project: jest.fn((lngLat: [number, number]) => Promise.resolve([Math.round((lngLat[0] + 180) * 2), Math.round((90 - lngLat[1]) * 2)])),
    }));
    return ReactActual.createElement(RNView, props, props.children);
  };
  const Camera = (props: any) => {
    ReactActual.useImperativeHandle(props.ref, () => ({ setStop: jest.fn(() => Promise.resolve()), jumpTo: jest.fn() }));
    // Exposed so tests can assert where the map STARTS (the first painted frame).
    return ReactActual.createElement(RNView, { testID: 'map-camera', initialViewState: props.initialViewState });
  };
  const GeoJSONSource = (props: any) =>
    ReactActual.createElement(RNView, { testID: `source-${props.id}`, data: props.data }, props.children);
  const Layer = (props: any) => ReactActual.createElement(RNView, { testID: `layer-${props.id}`, ...props });

  const Images = () => null;

  return { __esModule: true, Map, Camera, GeoJSONSource, Layer, Images };
});

// The bundled basemap installer touches the APK asset + app storage; tests get an instantly "installed" archive.
jest.mock('../services/BundledBasemap', () => ({
  getBundledBasemap: jest.fn(() => Promise.resolve({ uri: 'file:///mock/map/ijtema-basemap.pmtiles', reused: true })),
}));

// @gorhom/bottom-sheet pulls in reanimated worklets + gesture-handler pan responders that
// don't do anything useful under a Jest/jsdom-less test renderer. Stand in with plain Views so
// screens that render a BottomSheet can still be queried/interacted with for their content.
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = require('react');
  const { View: RNView } = require('react-native');
  let lastBottomSheetModalProps: any = null;

  const BottomSheet = ReactActual.forwardRef((props: any, ref: any) => {
    ReactActual.useImperativeHandle(ref, () => ({
      snapToIndex: jest.fn(),
      close: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
    }));
    return ReactActual.createElement(RNView, null, props.children);
  });
  BottomSheet.displayName = 'BottomSheet';

  const BottomSheetModal = ReactActual.forwardRef((props: any, ref: any) => {
    lastBottomSheetModalProps = props;
    ReactActual.useImperativeHandle(ref, () => ({
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      close: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
      present: jest.fn(),
      dismiss: jest.fn(),
      forceClose: jest.fn(),
    }));
    // Mirrors the real modal: the footer slot renders beside the content (Start Navigation lives there).
    const FooterComponent = props.footerComponent;
    return ReactActual.createElement(
      RNView,
      { ...props, testID: 'location-sheet-modal' },
      props.children,
      FooterComponent
        ? ReactActual.createElement(FooterComponent, { animatedFooterPosition: { value: 0, get: () => 0 } })
        : null,
    );
  });
  BottomSheetModal.displayName = 'BottomSheetModal';

  const BottomSheetModalProvider = (props: any) => props.children;
  BottomSheetModalProvider.displayName = 'BottomSheetModalProvider';

  const BottomSheetScrollView = (props: any) =>
    ReactActual.createElement(RNView, null, props.children);
  BottomSheetScrollView.displayName = 'BottomSheetScrollView';

  const BottomSheetFooter = (props: any) =>
    ReactActual.createElement(RNView, null, props.children);
  BottomSheetFooter.displayName = 'BottomSheetFooter';

  const BottomSheetView = (props: any) =>
    ReactActual.createElement(RNView, null, props.children);
  BottomSheetView.displayName = 'BottomSheetView';

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetModal,
    BottomSheetModalProvider,
    BottomSheetScrollView,
    BottomSheetView,
    BottomSheetFooter,
    __getLastBottomSheetModalProps: () => lastBottomSheetModalProps,
  };
});

// expo-file-system's jest-expo default auto-mock (node_modules/jest-expo/src/preset/setup.js)
// only stubs the legacy FileSystem.* function API — it does not include the `Paths` export that
// HomeScreen/NavigationScreen use for offline tile paths. Extend it here.
jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  downloadAsync: jest.fn(() => Promise.resolve({ md5: 'md5', uri: 'uri' })),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, md5: 'md5', uri: 'uri' })),
  readAsStringAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  moveAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(() => Promise.resolve()),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  readDirectoryAsync: jest.fn(() => Promise.resolve()),
  createDownloadResumable: jest.fn(() => Promise.resolve()),
  Paths: {
    document: { uri: 'file:///mock-document/' },
    cache: { uri: 'file:///mock-cache/' },
  },
}));

export {};
