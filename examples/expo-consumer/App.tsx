import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Button, I18nManager, Platform, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { createNavigationController } from '@muslim-ummah/offline-navigation';
import { createMapLibreNavigationMap } from '@muslim-ummah/offline-navigation/maplibre';
import {
  createDefaultNavigationTheme,
  ENGLISH_NAVIGATION_SCREEN_COPY,
  NavigationProvider,
  NavigationScreen,
  useNavigationState,
} from '@muslim-ummah/offline-navigation/ui';
import { BASEMAP } from './basemap';
import { installKarachiBasemap } from './basemapExpo';
import { DEMO_CENTER, demoVenue, describeDemoPlace } from './demoVenue';
import { appStateLifecycle, createExpoLocationAdapter } from './expoLocation';
import { createSimulatedLocation, type SimulatedLocation } from './simulatedLocation';

// Everything the host owns is here: the venue, place names, the basemap file, the location service, language, theme and
// safe area and system bars. The ready-made screen owns the journey; the SDK's MapLibre adapter owns the map.
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <Consumer />
    </SafeAreaProvider>
  );
}

function Consumer() {
  const insets = useSafeAreaInsets();
  const isRTL = I18nManager.isRTL;
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  // Two clearly separate location sources. Switching starts a fresh controller (the previous one is disposed), so a
  // simulated fix can never be read as device evidence or the other way round.
  const [source, setSource] = useState<'simulated' | 'device'>('simulated');
  const simulated = useMemo(() => createSimulatedLocation(demoVenue.graph.getNode('a')!.coordinate), []);
  const device = useMemo(() => createExpoLocationAdapter({ platform: Platform.OS === 'ios' ? 'ios' : 'android' }), []);
  const controller = useMemo(
    () => createNavigationController({ venue: demoVenue, location: source === 'device' ? device : simulated, now: Date.now }),
    [source, device, simulated],
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const theme = useMemo(() => createDefaultNavigationTheme({ isRTL, colorScheme }), [isRTL, colorScheme]);
  const { basemap, retry } = useBasemap();
  // Created once per archive so the map component keeps a stable identity; a missing archive draws a plain canvas and the
  // screen tells the user that directions still work.
  const archiveUri = basemap.status === 'ready' ? basemap.uri : null;
  const MapComponent = useMemo(() => createMapLibreNavigationMap({
    venue: demoVenue, archiveUri, archiveZoom: BASEMAP.zoom, initialCenter: DEMO_CENTER, initialZoom: 17,
    attributionBottomInset: insets.bottom + 8,
  }), [archiveUri, insets.bottom]);

  if (basemap.status === 'loading') return <View style={styles.loading}><ActivityIndicator accessibilityLabel="Preparing the offline map" /></View>;
  return (
    <NavigationProvider controller={controller} lifecycle={appStateLifecycle}>
      <View style={styles.root}>
        <NavigationScreen
          style={[styles.screen, { paddingTop: insets.top }]}
          copy={ENGLISH_NAVIGATION_SCREEN_COPY}
          theme={theme}
          isRTL={isRTL}
          describePlace={describeDemoPlace}
          MapComponent={MapComponent}
          bottomInset={insets.bottom}
        />
        {basemap.status === 'failed' ? <Button title="Retry offline map" accessibilityLabel="Retry offline map" onPress={retry} /> : null}
        <View style={{ paddingBottom: insets.bottom }}>
          {source === 'simulated' ? <DemoGps location={simulated} /> : null}
          <Button
            title={`Location: ${source === 'simulated' ? 'simulated' : 'device'} (switch)`}
            accessibilityLabel={`Location source: ${source === 'simulated' ? 'simulated' : 'device'}. Switch.`}
            onPress={() => setSource((s) => (s === 'simulated' ? 'device' : 'simulated'))}
          />
        </View>
      </View>
    </NavigationProvider>
  );
}

type Basemap = { status: 'loading' } | { status: 'ready'; uri: string } | { status: 'failed' };

function useBasemap() {
  const [basemap, setBasemap] = useState<Basemap>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    installKarachiBasemap().then(
      (uri) => current && setBasemap({ status: 'ready', uri }),
      () => current && setBasemap({ status: 'failed' }),
    );
    return () => { current = false; };
  }, [attempt]);
  // A retry keeps the screen (and the user's trip) up; only the map component is replaced once the archive is ready.
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { basemap, retry };
}

// Demo only: lets a simulator user walk the simulated GPS along the live route.
function DemoGps({ location }: { location: SimulatedLocation }) {
  const state = useNavigationState();
  const next = useRef(1);
  useEffect(() => { if (state.phase !== 'live') next.current = 1; }, [state.phase]);
  const points = state.route?.line?.points;
  if (state.phase !== 'live' || !points) return null;
  // RN's Button upper-cases its title on Android, so the accessible name is set explicitly.
  return <Button title="Demo GPS: walk to the next point" accessibilityLabel="Demo GPS: walk to the next point" onPress={() => location.moveTo(points[Math.min(next.current++, points.length - 1)])} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1 },
});
