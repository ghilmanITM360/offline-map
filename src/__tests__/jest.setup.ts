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
    Polygon: makeMock('Polygon'),
    Polyline: makeMock('Polyline'),
    Callout: makeMock('Callout'),
    LocalTile: makeMock('LocalTile'),
    UrlTile: makeMock('UrlTile'),
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: 'default',
  };
});

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
    return ReactActual.createElement(RNView, { ...props, testID: 'location-sheet-modal' }, props.children);
  });
  BottomSheetModal.displayName = 'BottomSheetModal';

  const BottomSheetModalProvider = (props: any) => props.children;
  BottomSheetModalProvider.displayName = 'BottomSheetModalProvider';

  const BottomSheetScrollView = (props: any) =>
    ReactActual.createElement(RNView, null, props.children);
  BottomSheetScrollView.displayName = 'BottomSheetScrollView';

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
