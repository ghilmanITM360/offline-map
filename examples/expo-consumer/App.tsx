import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Button, I18nManager, Platform, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
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
import { appStateLifecycle, createExpoLocationAdapter } from './expoLocation';
import { readIOSPrecision } from './modules/sdk-location-precision';
import { DEFAULT_VENUE_ID, type OpenedVenue, type PackRuntime } from './packRuntime';
import { packRootUri, runDeviceSelfTest, startBundledPacks } from './packRuntimeExpo';
import type { SelfTestResult } from './packSelfTest';
import { createSimulatedLocation, type SimulatedLocation } from './simulatedLocation';

// Everything the host owns is here: which venue pack is open, place names, the location service, language, theme and safe area and
// system bars. The ready-made screen owns the journey; the SDK's MapLibre adapter owns the map; the SDK's pack manager decides which
// verified pack (and so which graph and basemap) the app may use. The pack is pinned for as long as its venue is open.
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <PackHost />
    </SafeAreaProvider>
  );
}

type Packs = { status: 'loading' } | { status: 'ready'; runtime: PackRuntime } | { status: 'failed'; message: string };

function usePacks() {
  const [packs, setPacks] = useState<Packs>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    startBundledPacks().then(
      (runtime) => current && setPacks({ status: 'ready', runtime }),
      (e) => current && setPacks({ status: 'failed', message: e instanceof Error ? e.message : 'The offline map packs could not be started.' }),
    );
    return () => { current = false; };
  }, [attempt]);
  // A retry re-copies and re-verifies the bundled packs; nothing else is touched.
  const retry = useCallback(() => { setPacks({ status: 'loading' }); setAttempt((n) => n + 1); }, []);
  return { packs, retry };
}

function PackHost() {
  const { packs, retry } = usePacks();
  if (packs.status === 'loading') return <View style={styles.loading}><ActivityIndicator accessibilityLabel="Preparing the offline map" /></View>;
  if (packs.status === 'failed') return <Problem message={packs.message} retry={retry} />;
  return <VenuePicker runtime={packs.runtime} retry={retry} />;
}

function Problem({ message, retry }: { message: string; retry: () => void }) {
  return (
    <View style={styles.loading}>
      <Text accessibilityRole="alert" style={styles.problem}>{message}</Text>
      <Button title="Retry offline map" accessibilityLabel="Retry offline map" onPress={retry} />
    </View>
  );
}

type Venue = { status: 'loading' } | { status: 'ready'; venue: OpenedVenue } | { status: 'failed'; message: string };

function useVenue(runtime: PackRuntime, venueId: string | undefined): Venue {
  const [venue, setVenue] = useState<Venue>({ status: 'loading' });
  useEffect(() => {
    let current = true;
    let opened: OpenedVenue | null = null;
    setVenue({ status: 'loading' });
    if (!venueId) { setVenue({ status: 'failed', message: 'No verified offline map pack is available.' }); return undefined; }
    runtime.open(venueId).then(
      (result) => {
        if (!current) { if (result.ok) result.venue.release(); return; }
        if (result.ok) { opened = result.venue; setVenue({ status: 'ready', venue: result.venue }); } else setVenue({ status: 'failed', message: `This venue's pack cannot be used (${result.error.code}).` });
      },
      () => current && setVenue({ status: 'failed', message: 'This venue could not be opened.' }),
    );
    // Leaving the venue (switching, closing the app screen) drops the pin so the pack can be updated or removed.
    return () => { current = false; opened?.release(); };
  }, [runtime, venueId]);
  return venue;
}

function VenuePicker({ runtime, retry }: { runtime: PackRuntime; retry: () => void }) {
  const ids = runtime.venueIds();
  const [venueId, setVenueId] = useState<string | undefined>(ids.includes(DEFAULT_VENUE_ID) ? DEFAULT_VENUE_ID : ids[0]);
  const venue = useVenue(runtime, venueId);
  const failures = runtime.install.report.filter((r) => r.status === 'failed');
  if (venue.status === 'loading') return <View style={styles.loading}><ActivityIndicator accessibilityLabel="Preparing the offline map" /></View>;
  if (venue.status === 'failed') return <Problem message={failures.length ? `${venue.message} (${failures.length} bundled pack failed verification)` : venue.message} retry={retry} />;
  const next = ids[(ids.indexOf(venueId ?? '') + 1) % ids.length];
  return (
    <VenueScreen
      key={venue.venue.manifest.packId}
      runtime={runtime}
      venue={venue.venue}
      switchVenue={ids.length > 1 ? () => setVenueId(next) : undefined}
    />
  );
}

const KIND_LABEL: Record<string, string> = { gate: 'Gate', block: 'Block', room: 'Room' };

function VenueScreen({ runtime, venue, switchVenue }: { runtime: PackRuntime; venue: OpenedVenue; switchVenue?: () => void }) {
  const insets = useSafeAreaInsets();
  const isRTL = I18nManager.isRTL;
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const source = venue.source;
  const start = useMemo(() => {
    const first = source.getPlace(source.placeIds()[0])!;
    return source.graph.getNode(first.nodeIds[0])!.coordinate;
  }, [source]);
  const center = useMemo(() => {
    const { west, east, south, north } = venue.manifest.bounds;
    return { lat: (south + north) / 2, lng: (west + east) / 2 };
  }, [venue]);
  // Two clearly separate location sources. Switching starts a fresh controller (the previous one is disposed), so a
  // simulated fix can never be read as device evidence or the other way round.
  const [locationSource, setLocationSource] = useState<'simulated' | 'device'>('simulated');
  const simulated = useMemo(() => createSimulatedLocation(start), [start]);
  const device = useMemo(() => createExpoLocationAdapter({ platform: Platform.OS === 'ios' ? 'ios' : 'android', readIOSPrecision }), []);
  const controller = useMemo(
    () => createNavigationController({ venue: source, location: locationSource === 'device' ? device : simulated, now: Date.now }),
    [source, locationSource, device, simulated],
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const theme = useMemo(() => createDefaultNavigationTheme({ isRTL, colorScheme }), [isRTL, colorScheme]);
  // The archive is the verified one inside the open pack. Created once per pack so the map component keeps a stable identity.
  const archiveUri = `${packRootUri()}/${venue.archivePath}`;
  const MapComponent = useMemo(() => createMapLibreNavigationMap({
    venue: source, archiveUri, archiveZoom: BASEMAP.zoom, initialCenter: center, initialZoom: 17,
    attributionBottomInset: insets.bottom + 8,
  }), [source, archiveUri, center, insets.bottom]);
  const describePlace = useCallback((place: { id: string }) => ({
    title: venue.names.get(place.id) ?? place.id,
    subtitle: KIND_LABEL[source.getPlace(place.id)?.kind ?? ''] ?? source.getPlace(place.id)?.kind ?? '',
  }), [venue, source]);

  return (
    <NavigationProvider controller={controller} lifecycle={appStateLifecycle}>
      <View style={styles.root}>
        <NavigationScreen
          style={[styles.screen, { paddingTop: insets.top }]}
          copy={ENGLISH_NAVIGATION_SCREEN_COPY}
          theme={theme}
          isRTL={isRTL}
          describePlace={describePlace}
          MapComponent={MapComponent}
          bottomInset={insets.bottom}
        />
        <View style={{ paddingBottom: insets.bottom }}>
          <PackStatus venue={venue} runtime={runtime} />
          {locationSource === 'simulated' ? <DemoGps location={simulated} /> : null}
          <Button
            title={`Location: ${locationSource === 'simulated' ? 'simulated' : 'device'} (switch)`}
            accessibilityLabel={`Location source: ${locationSource === 'simulated' ? 'simulated' : 'device'}. Switch.`}
            onPress={() => setLocationSource((s) => (s === 'simulated' ? 'device' : 'simulated'))}
          />
          {switchVenue ? <Button title={`Venue: ${venue.manifest.venueId} (switch)`} accessibilityLabel={`Venue: ${venue.manifest.venueId}. Switch.`} onPress={switchVenue} /> : null}
        </View>
      </View>
    </NavigationProvider>
  );
}

// Demo only: shows which verified pack is serving and runs the lifecycle checks on this device's real filesystem.
function PackStatus({ venue, runtime }: { venue: OpenedVenue; runtime: PackRuntime }) {
  const [results, setResults] = useState<SelfTestResult[] | 'running' | null>(null);
  const run = useCallback(() => {
    setResults('running');
    runDeviceSelfTest().then(setResults, (e) => setResults([{ name: 'self-test', ok: false, detail: e instanceof Error ? e.message : String(e) }]));
  }, []);
  const label = `Pack ${venue.manifest.packId}, ${venue.origin}, digest pinned, ${venue.manifest.totalBytes} bytes`;
  const repaired = runtime.install.report.filter((r) => r.status === 'installed' && r.repaired).length;
  return (
    <View>
      <Text accessibilityLabel={label} style={styles.status}>{label}{repaired ? `, ${repaired} repaired at start` : ''}</Text>
      <Button title="Run pack self-test" accessibilityLabel="Run pack self-test" onPress={run} />
      {results === 'running' ? <Text style={styles.status}>Self-test running</Text> : null}
      {Array.isArray(results) ? (
        <ScrollView style={styles.results} accessibilityLabel="Pack self-test results">
          <Text style={styles.status}>{`Self-test: ${results.filter((r) => r.ok).length} of ${results.length} passed`}</Text>
          {results.map((r) => <Text key={r.name} style={styles.status}>{`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`}</Text>)}
        </ScrollView>
      ) : null}
    </View>
  );
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  problem: { textAlign: 'center', marginBottom: 12 },
  screen: { flex: 1 },
  status: { fontSize: 11, paddingHorizontal: 8 },
  results: { maxHeight: 120 },
});
