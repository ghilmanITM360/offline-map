/**
 * Jest setup for RNTL component tests (src/__tests__/**).
 *
 * jest-expo mocks native bridges (NativeModules for RNSVG*, RNGestureHandlerModule, ReanimatedModule, etc — see
 * node_modules/jest-expo/src/preset/moduleMocks/thirdPartyModules.js). The map is MapLibre, stood in for below.
 */

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
