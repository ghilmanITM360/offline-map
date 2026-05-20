import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const homeVm = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const directionsVm = readFileSync('src/viewmodels/DirectionsViewModel.ts', 'utf8');
const settingsVm = readFileSync('src/viewmodels/SettingsViewModel.ts', 'utf8');
const settingsScreen = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const directionsScreen = readFileSync('src/views/screens/DirectionsScreen.tsx', 'utf8');
const navScreen = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const offlineMapService = readFileSync('src/services/OfflineMapService.ts', 'utf8');
const offlineDataService = readFileSync('src/services/OfflineDataService.ts', 'utf8');
const appStore = readFileSync('src/store/useAppStore.ts', 'utf8');
const locationAccess = readFileSync('src/services/LocationAccessService.ts', 'utf8');
const rootNavigator = readFileSync('src/navigation/RootNavigator.tsx', 'utf8');

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
  homeVm.includes('Outside Ijtema area'),
  'Home current-location action should explain outside-venue fallback',
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
  directionsVm.includes('outside the Ijtema area'),
  'Directions should reject outside-venue current-location start',
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
  offlineDataService.includes('deleteAllMapData'),
  'Offline data deletion should be centralized in OfflineDataService.deleteAllMapData',
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
  directionsScreen.includes('pinColor="#EA4335"'),
  'Directions destination marker should be red',
);

assert(
  navScreen.includes('#EA4335'),
  'Navigation destination marker should be red',
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
  navScreen.includes('userMarkerPulse') && homeScreen.includes('userMarkerPulse'),
  'Current user marker should have lightweight pulse styling',
);
assert(
  homeScreen.includes('searchFocusAnim') && homeScreen.includes('warningAnim'),
  'Home should include search focus and warning banner animations',
);
assert(
  navScreen.includes('setIsMuted(!isMuted)'),
  'Navigation mute button must toggle mute state',
);
assert(
  navScreen.includes('handleExit(nav)'),
  'Navigation exit action must be wired',
);

assert(rootNavigator.includes("name=\"AppGuide\""), 'App Guide route should be registered');

console.log('Critical action handler checks passed.');
