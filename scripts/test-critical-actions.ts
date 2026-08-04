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
  readFileSync('src/views/components/navigation/NavigationMapLayersV1.tsx', 'utf8'),
  readFileSync('src/views/components/navigation/NavigationChromeV1.tsx', 'utf8'),
].join('\n');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const offlineMapService = readFileSync('src/services/OfflineMapService.ts', 'utf8');
const offlineDataService = readFileSync('src/services/OfflineDataService.ts', 'utf8');
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
  homeVm.includes('Use remembered location'),
  'Home current-location failure should offer remembered-location fallback',
);
assert(
  homeVm.includes("text: 'Choose start manually'") && homeVm.includes("onPress: () =>"),
  'Home current-location failure action should not include a dead \"Choose start manually\" option',
);
assert(
  homeVm.includes('Outside Ijtema area'),
  'Home current-location action should explain outside-venue fallback',
);
assert(
  homeScreen.includes('RoutingServiceV2.recommendOutsideEntryGate') && homeScreen.includes('Enter through ${nearestEntryGate.name.en}'),
  'Home outside-area banner should name the actual nearest routable gate, not a generic message',
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
  directionsVm.includes('forceOutside') && directionsVm.includes("We'll enter through nearest official gate."),
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
  settingsScreen.includes('Tap Manage'),
  'Settings Location Permission should explain Manage behavior',
);
assert(
  settingsScreen.includes("disabled={type !== 'toggle' && !onPress}"),
  'Settings info-only rows should be visually and interactively non-actionable',
);
assert(settingsScreen.includes('Voice Language'), 'Settings should label speech locale as Voice Language');
assert(!settingsScreen.includes('Dark Mode'), 'Dark Mode should be hidden until app-wide support is complete');
assert(settingsScreen.includes('Auto-follow Location'), 'Settings should expose Auto-follow toggle');
assert(settingsScreen.includes('North-up Map'), 'Settings should expose North-up toggle');
assert(settingsScreen.includes('Auto-reroute'), 'Settings should expose Auto-reroute toggle');
assert(settingsScreen.includes('Distance Unit'), 'Settings should expose Distance Unit selector');
assert(settingsScreen.includes('Walking Speed'), 'Settings should expose Walking Speed selector');

assert(
  offlineDataService.includes('deleteAllMapData'),
  'Offline data deletion should be centralized in OfflineDataService.deleteAllMapData',
);
assert(
  offlineMapService.includes('runExclusive') || offlineMapService.includes('operationQueue'),
  'Offline map DB operations should be serialized to avoid close/query races',
);
assert(
  offlineMapService.includes('if (this.db)') && offlineMapService.includes('closeDatabase'),
  'Delete Map Data should guard null/closed SQLite handles and close safely',
);
assert(
  offlineDataService.includes("setOfflineMapStatus('not_downloaded'"),
  'Delete Map Data should reset offline map status to not_downloaded',
);
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
    directionsScreen.includes('Find best eligible official gate automatically'),
  'Directions should use layman-friendly start-selection flow',
);

assert(
  navScreen.includes('staticColors.gateAccent') && staticColors.gateAccent === '#EA4335',
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
  navScreen.includes('title="Start"'),
  'Navigation should render a start marker when route exists',
);
assert(
  navScreen.includes('LocateFixed'),
  'Navigation should expose recenter control',
);
assert(
  navScreen.includes('settings.autoFollowLocation'),
  'Navigation auto-follow behavior should honor Settings auto-follow toggle',
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
const userLocationMarkerSrc = readFileSync('src/views/components/map/UserLocationMarker.tsx', 'utf8');
assert(
  navScreen.includes('userMarkerPulse') && homeScreen.includes('<UserLocationMarker') && userLocationMarkerSrc.includes('pulse'),
  'Current user marker should have lightweight pulse styling',
);
assert(
  homeScreen.includes('searchFocusAnim') && homeScreen.includes('warningAnim'),
  'Home should include search focus and warning banner animations',
);
assert(homeScreen.includes("rotateEnabled={!layersSheetVisible && !settings.keepNorthFixed}"), 'Home map should honor North-up behavior');
assert(
  navScreen.includes('setIsMuted(!isMuted)'),
  'Navigation mute button must toggle mute state',
);
assert(
  navScreen.includes('handleExit()'),
  'Navigation exit action must be wired',
);
assert(
  readFileSync('src/viewmodels/DownloadMapViewModel.ts', 'utf8').includes('downloadInProgressRef'),
  'Download flow should guard against re-entrant resume/retry worker starts',
);

assert(rootNavigator.includes("name=\"AppGuide\""), 'App Guide route should be registered');
assert(customDrawer.includes("label: 'Home'"), 'Drawer should include Home');
assert(customDrawer.includes("label: 'Offline Maps'"), 'Drawer should include Offline Maps');
assert(customDrawer.includes("label: 'Settings'"), 'Drawer should include Settings');
assert(customDrawer.includes("label: 'Help & Feedback'"), 'Drawer should include Help & Feedback');
assert(customDrawer.includes("label: 'About Ijtema Map'"), 'Drawer should include About Ijtema Map');
assert(!customDrawer.includes("label: 'Saved Blocks'"), 'Drawer should hide Saved Blocks until implemented');
assert(!customDrawer.includes("label: 'Recent Searches'"), 'Drawer should hide Recent Searches until implemented');

console.log('Critical action handler checks passed.');
