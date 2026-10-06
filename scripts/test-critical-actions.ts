import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { staticColors } from '../src/theme';

const homeVm = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const directionsVm = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const settingsVm = readFileSync('src/viewmodels/SettingsViewModel.ts', 'utf8');
const settingsScreen = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const directionsScreen = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
// Legacy (v1) navigation no longer lives in one standalone NavigationScreen.tsx — it's split
// across a viewmodel, an overlay hook, and map-layers/chrome components, mirroring v2's shape.
const navScreen = [
  readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8'),
  readFileSync('src/viewmodels/useNavigationOverlayV1.ts', 'utf8'),
  readFileSync('src/views/components/navigation/NavigationChromeV1.tsx', 'utf8'),
].join('\n');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const appStore = readFileSync('src/store/useAppStore.ts', 'utf8');
const locationAccess = readFileSync('src/services/LocationAccessService.ts', 'utf8');
const rootNavigator = readFileSync('src/navigation/RootNavigator.tsx', 'utf8');
const customDrawer = readFileSync('src/views/components/CustomDrawer.tsx', 'utf8');

assert(
  homeVm.includes('LocationAccessService.resolveCurrentLocation'),
  'Home current-location action should resolve permission + location through shared service',
);
assert(
  homeVm.includes("setCurrentLocation(resolved.coordinate, resolved.source ?? 'live')"),
  'Home current-location action should fetch latest GPS and persist the location source',
);
assert(
  homeVm.includes('Use earlier location'),
  'Home current-location failure should offer remembered-location fallback',
);
assert(
  homeVm.includes("text: 'Choose where to start'") && homeVm.includes("onPress: () =>"),
  'Home current-location failure action should not include a dead \"Choose where to start\" option',
);
assert(
  homeVm.includes('You are outside Ijtema'),
  'Home current-location action should explain outside-venue fallback',
);
assert(
  homeScreen.includes('recommendPreviewEntryGate(currentLocation, selectedPlace)') && readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8').includes('return RoutingServiceV2.recommendOutsideEntryGate') && homeScreen.includes('Suggested entry') && homeScreen.includes('nearestEntryGate.name.en'),
  'Home outside-area banner should name actual suggested gate, not a generic message',
);

assert(
  directionsVm.includes('async (): Promise<boolean>'),
  'Directions current-location action should be asynchronous and return success/failure',
);
assert(
  directionsVm.includes('LocationAccessService.resolveCurrentLocation'),
  'Directions should resolve location via shared service',
);
assert(
  directionsVm.includes('chooseRememberedLocation'),
  'Directions should expose remembered-location fallback state',
);
assert(
  directionsVm.includes('forceOutside') && directionsVm.includes("We'll guide you to the nearest gate."),
  'Directions should accept outside starts and route through nearest official gate',
);

assert(
  settingsVm.includes('refreshLocationPermissionState'),
  'Settings should expose permission refresh helper',
);
assert(
  settingsVm.includes('Location.requestForegroundPermissionsAsync'),
  'Settings Manage should request permission when askable',
);
assert(
  settingsVm.includes('LocationAccessService.openAppSettings'),
  'Settings Manage should open OS settings when permission is blocked',
);
assert(
  settingsVm.includes('LocationAccessService.openLocationSettings'),
  'Settings Manage should open device location settings when services are off',
);
assert(
  settingsScreen.includes("AppState.addEventListener('change'"),
  'Settings should refresh permission state when app returns to foreground',
);
assert(
  settingsScreen.includes('Tap to turn it on.'),
  'Settings Location Permission should say what tapping does',
);
assert(
  settingsScreen.includes('disabled={!isToggle && !onPress}'),
  'Settings info-only rows should be visually and interactively non-actionable',
);
assert(settingsScreen.includes('Voice Language'), 'Settings should label speech locale as Voice Language');
assert(!settingsScreen.includes('Dark Mode'), 'Dark Mode should be hidden until app-wide support is complete');
assert(settingsScreen.includes('Auto-follow Location'), 'Settings should expose Auto-follow toggle');
assert(settingsScreen.includes('North-up Map'), 'Settings should expose North-up toggle');
assert(settingsScreen.includes('Fix my route automatically'), 'Settings should expose Fix my route automatically toggle');
assert(settingsScreen.includes('Distance Unit'), 'Settings should expose Distance Unit selector');
assert(settingsScreen.includes('Walking Speed'), 'Settings should expose Walking Speed selector');

assert(
  appStore.includes('lastKnownLocationUpdatedAt') && appStore.includes('currentLocationSource'),
  'Remembered location fallback should persist timestamp and source metadata',
);
assert(
  locationAccess.includes("source: 'live'") && locationAccess.includes("source: 'device_last_known'"),
  'Location access should distinguish live GPS from device last-known fallback',
);

assert(
  directionsScreen.includes('keyboardDismissMode="on-drag"'),
  'Directions should support keyboard-safe scrolling',
);
assert(
  directionsScreen.includes('Get Directions') &&
    directionsScreen.includes('Start Navigation') &&
    directionsScreen.includes("onOpenDirectory?.('start')"),
  'Directions should use layman-friendly start-selection flow',
);

// The destination pin is a generated image whose colour comes from the marker tokens; it must stay the gate-accent red.
assert(
  staticColors.gateAccent === '#EA4335' && JSON.parse(readFileSync('src/theme/mapMarkerTokens.json', 'utf8')).destination === staticColors.gateAccent,
  'Navigation destination marker should be red',
);
assert(
  navScreen.includes('Venue boundary') || navScreen.includes('venueBoundary'),
  'Navigation should always render venue boundary context',
);
assert(
  navScreen.includes('graphOnlyFallbackUsed'),
  'Navigation should include graph-only fallback diagnostics',
);
assert(
  // fitToCoordinates itself now lives only in CameraManager (src/viewmodels/useCameraManager.ts)
  // — the nav overlay calls cameraManager.fitRoute()/fitVenueBounds() instead of the MapView ref directly.
  navScreen.includes('cameraManager.fitRoute(') && navScreen.includes('cameraManager.fitVenueBounds('),
  'Navigation should fit route/venue bounds',
);
assert(
  readFileSync('src/views/components/mapgl/navigationScene.ts', 'utf8').includes('start: ownership.showNavigationStart ? route.origin.coordinate : null'),
  'Navigation should render a start marker when route exists',
);
assert(
  navScreen.includes('LocateFixed'),
  'Navigation should expose recenter control',
);
assert(
  navScreen.includes('navigationSessionId') &&
    navScreen.includes('useState(true)') &&
    navScreen.includes('setIsAutoFollowing(true)'),
  'Navigation should establish fresh auto-follow ownership for each navigation session',
);
assert(
  navScreen.includes('settings.keepNorthFixed'),
  'Navigation heading behavior should honor North-up setting',
);
assert(
  // Route-preview distance text lives in LocationSheet's routePreview mode (directionsScreen),
  // not HomeScreen directly, since P0-2 consolidated it into a single sheet-based surface.
  navScreen.includes('InstructionService.formatDistance') && directionsScreen.includes('InstructionService.formatDistance'),
  'Distance unit setting should affect both navigation and route preview distance text',
);
// The current-location dot is a MapLibre circle layer fed by buildMarkerOverlay (the animated pulse returns with the
// Ijtema visual system, which will carry its own test).
assert(
  homeScreen.includes('buildMarkerOverlay(') && homeScreen.includes('markerOwnership.showBrowseUser'),
  'Current user marker must render as the shared user dot',
);
assert(
  homeScreen.includes('warningAnim'),
  'Home should include the outside-area warning banner animation',
);
assert(homeScreen.includes("rotateEnabled={!settings.keepNorthFixed}") && homeScreen.includes('gesturesEnabled={!layersSheetVisible}'), 'Home map should honor North-up behavior (rotation off) and lock all gestures while the layers sheet is open');
assert(
  navScreen.includes('setIsMuted(!isMuted)'),
  'Navigation mute button must toggle mute state',
);
assert(
  navScreen.includes('onPress={requestNavigationExit}') && navScreen.includes('onPress={completeArrivalNavigation}'),
  'Navigation active Exit and arrival Done actions must use their canonical paths',
);
assert(rootNavigator.includes("name=\"AppGuide\""), 'App Guide route should be registered');
assert(customDrawer.includes("label: 'Home'"), 'Drawer should include Home');
assert(!customDrawer.includes("label: 'Offline Maps'"), 'Drawer must not offer Offline Maps: the map ships with the app (#140)');
assert(customDrawer.includes("label: 'Settings'"), 'Drawer should include Settings');
assert(customDrawer.includes("label: 'Help & Feedback'"), 'Drawer should include Help & Feedback');
assert(customDrawer.includes("label: 'About Ijtema Map'"), 'Drawer should include About Ijtema Map');
assert(!customDrawer.includes("label: 'Saved Blocks'"), 'Drawer should hide Saved Blocks until implemented');
assert(!customDrawer.includes("label: 'Recent Searches'"), 'Drawer should hide Recent Searches until implemented');

console.log('Critical action handler checks passed.');
