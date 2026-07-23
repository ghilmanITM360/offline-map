import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const gpsManager = readFileSync('src/services/GPSManagerService.ts', 'utf8');
const homeViewModel = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
const navigationV2 = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const store = readFileSync('src/store/useAppStore.ts', 'utf8');

assert(
  gpsManager.includes("type LocationTrackingMode = 'follow' | 'navigation'"),
  'GPS manager must distinguish low-duty Home follow tracking from active navigation tracking',
);
assert(
  gpsManager.includes("AppState.addEventListener('change'"),
  'GPS manager must stop or pause live GPS when the app backgrounds',
);
assert(
  gpsManager.includes('reconcileInFlight') && gpsManager.includes('reconcileAgain'),
  'GPS manager must serialize subscription reconciliation to avoid duplicate native watchers during rapid add/remove',
);
assert(
  gpsManager.includes('private requestReconcile()') && !gpsManager.includes('void this.reconcileSubscription()'),
  'GPS manager add/remove/background transitions must use a guarded reconcile path instead of firing overlapping watch starts',
);
assert(
  gpsManager.includes('timeInterval: 5000') && gpsManager.includes('distanceInterval: 10'),
  'Home follow mode must use a lower-duty GPS interval than active navigation',
);
assert(
  // The 1000ms literal moved to a named, shared constant (NAVIGATION_WATCH_TIME_INTERVAL_MS
  // in src/constants/navigation.ts) so GPS-loss-detection can define its timeout as an
  // explicit multiple of it — see scripts/test-gps-signal-loss-v2.ts, which asserts the
  // constant's actual value (1000) and that GPSManagerService is wired to use it.
  gpsManager.includes('timeInterval: NAVIGATION_WATCH_TIME_INTERVAL_MS') && gpsManager.includes('distanceInterval: 2'),
  'Active navigation must keep high-resolution GPS updates',
);

assert(
  homeViewModel.includes('shouldTrackLiveLocation'),
  'Home must gate live GPS tracking behind an explicit follow-mode predicate',
);
assert(
  !homeViewModel.includes('if (!hasLocationPermission) return;\n    GPSManagerService.addListener(handleGPS);'),
  'Home must not start GPS solely because location permission exists',
);
assert(
  homeViewModel.includes("GPSManagerService.addListener(handleGPS, 'follow')"),
  'Home live tracking, when explicitly enabled, must register as follow mode',
);
assert(
  !homeViewModel.includes('updateSettings({ autoFollowLocation: true })'),
  'Current location recenter must remain one-shot and must not enable permanent tracking',
);
assert(
  store.includes('autoFollowLocation: false'),
  'Production defaults must not enable permanent Home GPS tracking',
);

assert(
  navigationV2.includes("GPSManagerService.addListener(handleLiveLocation, 'navigation')"),
  'V2 active navigation must own a navigation-mode GPS listener',
);
assert(
  navigationV2.includes('GPSManagerService.removeListener(handleLiveLocation)'),
  'V2 active navigation must remove its GPS listener on exit/unmount',
);
assert(
  navigationV2.includes('REROUTE_COOLDOWN_MS = 25_000'),
  'V2 reroute checks must keep a cooldown',
);
assert(
  navigationV2.includes('if (!candidate)') && navigationV2.includes('lastRerouteAtRef.current = Date.now();'),
  'Failed V2 reroute attempts must stamp cooldown/backoff before returning',
);
assert(
  navigationV2.includes('lastSpokenInstructionIdRef'),
  'V2 voice instructions must be de-duplicated by instruction id',
);

console.log('Battery/GPS v2 checks passed.');
