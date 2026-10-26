import { AppState } from 'react-native';
import * as ExpoLocation from 'expo-location';
import type { LiveFixCoordinate, LocationPermissionInput, NavigationLocationAdapter } from '@muslim-ummah/offline-navigation';
import type { NavigationLifecycleAdapter } from '@muslim-ummah/offline-navigation/ui';

// The reference device-location adapter: foreground only (no background permission is requested), never a remembered
// position, never a prompt except from requestPermission(), and every watcher released exactly once.

export interface ExpoLocationAdapterOptions {
  /** Defaults to the installed `expo-location`; injectable so the mapping can be tested without a device. */
  location?: typeof ExpoLocation;
  platform: 'ios' | 'android';
  /**
   * iOS only. expo-location cannot tell full from reduced accuracy, so without this the adapter reports precision 'none'
   * and the SDK refuses Live as `precision_unknown`. A host that has a native check (CLLocationManager.accuracyAuthorization)
   * supplies it here; the adapter never infers precision from a fix's accuracy.
   */
  readIOSPrecision?: () => Promise<'full' | 'reduced' | 'none'>;
  /** How long one fresh-fix attempt may take. Default 15 s. */
  freshFixTimeoutMs?: number;
}

export function createExpoLocationAdapter({ location = ExpoLocation, platform, readIOSPrecision, freshFixTimeoutMs = 15_000 }: ExpoLocationAdapterOptions): NavigationLocationAdapter {
  const precisionOf = async (permission: ExpoLocation.LocationPermissionResponse): Promise<'fine' | 'coarse' | 'none'> => {
    if (permission.status !== 'granted') return 'none';
    if (platform === 'android') {
      const accuracy = (permission as { android?: { accuracy?: string } }).android?.accuracy;
      return accuracy === 'fine' || accuracy === 'coarse' ? accuracy : 'none';
    }
    const ios = await readIOSPrecision?.().catch(() => 'none' as const);
    return ios === 'full' ? 'fine' : ios === 'reduced' ? 'coarse' : 'none';
  };
  // 'unknown' when the platform query itself fails: never collapsed into 'enabled'.
  const servicesState = async (): Promise<LocationPermissionInput['servicesState']> =>
    location.hasServicesEnabledAsync().then((on) => (on ? 'enabled' : 'disabled'), () => 'unknown');
  const describe = async (permission: ExpoLocation.LocationPermissionResponse): Promise<LocationPermissionInput> => ({
    granted: permission.status === 'granted',
    canAskAgain: permission.canAskAgain,
    precision: await precisionOf(permission),
    servicesState: await servicesState(),
  });
  const toFix = (p: ExpoLocation.LocationObject): LiveFixCoordinate => ({
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    ...(p.coords.accuracy == null ? {} : { accuracy: p.coords.accuracy }),
    observedAtMs: p.timestamp,
  });

  return {
    getPermission: async () => describe(await location.getForegroundPermissionsAsync()),
    requestPermission: async () => describe(await location.requestForegroundPermissionsAsync()),
    getCurrentFix: (signal) => new Promise<LiveFixCoordinate | null>((resolve) => {
      let settled = false;
      const done = (fix: LiveFixCoordinate | null) => { if (!settled) { settled = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve(fix); } };
      const onAbort = () => done(null);
      const timer = setTimeout(() => done(null), freshFixTimeoutMs);
      if (signal.aborted) return done(null);
      signal.addEventListener('abort', onAbort);
      // Accuracy.High, not a cached read: the SDK also rejects a fix whose own timestamp is old.
      location.getCurrentPositionAsync({ accuracy: location.Accuracy.High }).then((p) => done(signal.aborted ? null : toFix(p)), () => done(null));
    }),
    watch: (onFix) => {
      let stopped = false;
      let subscription: ExpoLocation.LocationSubscription | null = null;
      location.watchPositionAsync(
        { accuracy: location.Accuracy.High, timeInterval: 1_000, distanceInterval: 1 },
        (p) => { if (!stopped) onFix(toFix(p)); },
      ).then((s) => { if (stopped) s.remove(); else subscription = s; }, () => undefined);
      return () => {
        if (stopped) return;
        stopped = true;
        subscription?.remove();
        subscription = null;
      };
    },
  };
}

/** Foreground recovery for `NavigationProvider`: fires each time the app becomes active again. */
export const appStateLifecycle: NavigationLifecycleAdapter = {
  onForeground: (listener) => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') listener(); });
    return () => subscription.remove();
  },
};
