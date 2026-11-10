import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Appearance as RNAppearance, I18nManager, Platform, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { createNavigationController } from '@muslim-ummah/offline-navigation';
import { createMapLibreNavigationMap } from '@muslim-ummah/offline-navigation/maplibre';
import {
  createDefaultNavigationTheme,
  NavigationProvider,
  NavigationScreen,
  Text,
  useNavigationState,
  type NavigationScreenTheme,
} from '@muslim-ummah/offline-navigation/ui';
import { BASEMAP } from './basemap';
import { copyFor, isRTLLanguage, LANGUAGES, type Language } from './copy';
import { appStateLifecycle, createExpoLocationAdapter } from './expoLocation';
import { readIOSPrecision } from '@muslim-ummah/ios-location-precision';
import { DEFAULT_VENUE_ID, type OpenedVenue, type PackRuntime } from './packRuntime';
import { packRootUri, runDeviceSelfTest, runStartupBenchmark, startBundledPacks, type StartupBenchmarkRow } from './packRuntimeExpo';
import type { SelfTestResult } from './packSelfTest';
import { createSimulatedLocation, type SimulatedLocation } from './simulatedLocation';
import { setSystemBackground } from './systemUi';

// Everything the host owns is here: which venue pack is open, place names, the location service, language, theme and safe area and
// system bars. The ready-made screen owns the journey; the SDK's MapLibre adapter owns the map; the SDK's pack manager decides which
// verified pack (and so which graph and basemap) the app may use. The pack is pinned for as long as its venue is open.
//
// Appearance and language are the host's two preferences. They live above the venue, the controller and the journey, so changing either one
// restyles the screen in place: the trip, the step, the map camera and the pack pin are untouched. They are not persisted: a real host stores them.
export type AppearancePreference = 'system' | 'light' | 'dark';
export interface Preferences {
  appearance: AppearancePreference;
  setAppearance: (value: AppearancePreference) => void;
  language: Language;
  setLanguage: (value: Language) => void;
}

function usePreferences(): Preferences {
  const [appearance, setAppearance] = useState<AppearancePreference>('system');
  // The device's own language decides the first layout direction; the picker changes it without a restart.
  const [language, setLanguage] = useState<Language>(I18nManager.isRTL ? 'ur' : 'en');
  // 'system' hands the decision back to the device, so the app follows it when it changes.
  useEffect(() => {
    try { RNAppearance.setColorScheme(appearance === 'system' ? null : appearance); } catch { /* the preference only affects the first paint */ }
  }, [appearance]);
  return { appearance, setAppearance, language, setLanguage };
}

export default function App() {
  const preferences = usePreferences();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const isRTL = isRTLLanguage(preferences.language);
  const theme = useMemo(() => createDefaultNavigationTheme({ isRTL, colorScheme: scheme }), [isRTL, scheme]);
  useEffect(() => { setSystemBackground(theme.colors.screen); }, [theme]);
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* Dark icons on a light screen and the reverse; set explicitly so a forced scheme can never leave invisible system icons. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <PackHost preferences={preferences} theme={theme} scheme={scheme} />
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

interface Look { preferences: Preferences; theme: NavigationScreenTheme; scheme: 'light' | 'dark' }

function PackHost({ preferences, theme, scheme }: Look) {
  const { packs, retry } = usePacks();
  const look = { preferences, theme, scheme };
  if (packs.status === 'loading') return <View style={[styles.loading, { backgroundColor: theme.colors.screen }]}><ActivityIndicator color={theme.colors.brand} accessibilityLabel="Preparing the offline map" /></View>;
  if (packs.status === 'failed') return <Problem message={packs.message} retry={retry} {...look} />;
  return <VenuePicker runtime={packs.runtime} retry={retry} {...look} />;
}

function Problem({ message, retry, theme }: { message: string; retry: () => void } & Look) {
  return (
    <View style={[styles.loading, { backgroundColor: theme.colors.screen }]}>
      <Text accessibilityRole="alert" style={[styles.problem, { color: theme.colors.text }]}>{message}</Text>
      <DemoButton label="Retry offline map" theme={theme} onPress={retry} />
    </View>
  );
}

// Demo chrome only. Its text uses the SDK's Text (so it follows a live Dynamic Type change) and stops growing at 1.3x so the demo controls
// never push the real screen out of view; the SDK screen's own text scales fully.
const DEMO_FONT_CAP = 1.3;
function DemoButton({ label, onPress, theme, selected, accessibilityLabel }: { label: string; onPress: () => void; theme: NavigationScreenTheme; selected?: boolean; accessibilityLabel?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={[styles.demoButton, { borderColor: theme.colors.border, backgroundColor: selected ? theme.colors.brandTint : 'transparent' }]}
    >
      <Text maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.demoButtonText, { color: theme.colors.brand }]}>{label}</Text>
    </Pressable>
  );
}

// One labelled choice of several (appearance, language). The chosen one is exposed as selected.
function Choice<T extends string>({ name, options, value, onChange, theme }: { name: string; options: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void; theme: NavigationScreenTheme }) {
  return (
    <View style={styles.choice} accessibilityRole="radiogroup" accessibilityLabel={name}>
      <Text maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.textSecondary }]}>{name}</Text>
      <View style={styles.choiceRow}>
        {options.map((o) => (
          <DemoButton key={o.id} label={o.label} accessibilityLabel={`${name}: ${o.label}`} selected={o.id === value} theme={theme} onPress={() => onChange(o.id)} />
        ))}
      </View>
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

function VenuePicker({ runtime, retry, ...look }: { runtime: PackRuntime; retry: () => void } & Look) {
  const ids = runtime.venueIds();
  const [venueId, setVenueId] = useState<string | undefined>(ids.includes(DEFAULT_VENUE_ID) ? DEFAULT_VENUE_ID : ids[0]);
  const venue = useVenue(runtime, venueId);
  const failures = runtime.install.report.filter((r) => r.status === 'failed');
  if (venue.status === 'loading') return <View style={[styles.loading, { backgroundColor: look.theme.colors.screen }]}><ActivityIndicator color={look.theme.colors.brand} accessibilityLabel="Preparing the offline map" /></View>;
  if (venue.status === 'failed') {
    // Say which pack failed and why, so a support report says more than "it did not work".
    const why = failures.map((f) => `${f.id}: ${f.status === 'failed' ? `${f.error.code} ${f.error.message}` : ''}`).join('; ');
    return <Problem message={failures.length ? `${venue.message} (${why})` : venue.message} retry={retry} {...look} />;
  }
  const next = ids[(ids.indexOf(venueId ?? '') + 1) % ids.length];
  return (
    <VenueScreen
      key={venue.venue.manifest.packId}
      runtime={runtime}
      venue={venue.venue}
      switchVenue={ids.length > 1 ? () => setVenueId(next) : undefined}
      {...look}
    />
  );
}

const KIND_LABEL: Record<string, string> = { gate: 'Gate', block: 'Block', room: 'Room' };

function VenueScreen({ runtime, venue, switchVenue, preferences, theme }: { runtime: PackRuntime; venue: OpenedVenue; switchVenue?: () => void } & Look) {
  const insets = useSafeAreaInsets();
  const { language } = preferences;
  const isRTL = isRTLLanguage(language);
  const copy = useMemo(() => copyFor(language), [language]);
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
  // Demo tools stay folded so the journey panel keeps the screen; the Demo GPS button is outside them because a Live walk needs it.
  const [tools, setTools] = useState(false);
  const simulated = useMemo(() => createSimulatedLocation(start), [start]);
  const device = useMemo(() => createExpoLocationAdapter({ platform: Platform.OS === 'ios' ? 'ios' : 'android', readIOSPrecision }), []);
  const controller = useMemo(
    // A pack with a place catalog says which places can be routed to; one without it behaves exactly as before.
    () => createNavigationController({ venue: source, location: locationSource === 'device' ? device : simulated, now: Date.now, availability: venue.catalog?.availability }),
    [source, venue.catalog, locationSource, device, simulated],
  );
  // The map is created once per pack, so a tap on a block or gate reaches whichever controller is current through a ref.
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  useEffect(() => () => controller.dispose(), [controller]);
  // The archive is the verified one inside the open pack. Created once per pack so the map component keeps a stable identity.
  const archiveUri = `${packRootUri()}/${venue.archivePath}`;
  const MapComponent = useMemo(() => createMapLibreNavigationMap({
    venue: source, archiveUri, archiveZoom: BASEMAP.zoom, initialCenter: center, initialZoom: 17,
    attributionBottomInset: insets.bottom + 8,
    geometry: venue.geometry ?? null, catalog: venue.catalog ?? null,
    onSelectPlace: (placeId) => controllerRef.current.selectDestination(placeId),
  }), [source, archiveUri, center, insets.bottom, venue.geometry, venue.catalog]);
  // The pack's own names in the chosen language; a place with no name in it falls back to English, never to a guess.
  const describePlace = useCallback((place: { id: string }) => ({
    title: venue.localizedNames?.get(place.id)?.[language] ?? venue.names.get(place.id) ?? place.id,
    subtitle: KIND_LABEL[source.getPlace(place.id)?.kind ?? ''] ?? source.getPlace(place.id)?.kind ?? '',
  }), [venue, source, language]);

  return (
    <NavigationProvider controller={controller} lifecycle={appStateLifecycle}>
      <View style={[styles.root, { backgroundColor: theme.colors.screen }]}>
        <NavigationScreen
          style={[styles.screen, { paddingTop: insets.top }]}
          copy={copy}
          theme={theme}
          isRTL={isRTL}
          describePlace={describePlace}
          catalog={venue.catalog}
          language={language}
          MapComponent={MapComponent}
          // The demo bar below the screen clears the system bar itself, so the panel needs none; the arrival sheet is a Modal that draws under it.
          bottomInset={0}
          arrivalBottomInset={insets.bottom}
        />
        <View style={[styles.demoBar, { paddingBottom: insets.bottom, backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
          {locationSource === 'simulated' ? <DemoGps location={simulated} theme={theme} /> : null}
          <DemoButton label={tools ? 'Hide demo tools' : 'Show demo tools'} theme={theme} onPress={() => setTools((t) => !t)} />
          {tools ? (
            <ScrollView style={styles.tools} accessibilityLabel="Demo tools">
              <Choice
                name="Appearance"
                theme={theme}
                value={preferences.appearance}
                onChange={preferences.setAppearance}
                options={[{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
              />
              <Choice
                name="Language"
                theme={theme}
                value={language}
                onChange={preferences.setLanguage}
                options={LANGUAGES.map((l) => ({ id: l.id, label: l.autonym }))}
              />
              <PackStatus venue={venue} runtime={runtime} theme={theme} />
              <DemoButton
                label={`Location: ${locationSource === 'simulated' ? 'simulated' : 'device'} (switch)`}
                accessibilityLabel={`Location source: ${locationSource === 'simulated' ? 'simulated' : 'device'}. Switch.`}
                theme={theme}
                onPress={() => setLocationSource((s) => (s === 'simulated' ? 'device' : 'simulated'))}
              />
              {switchVenue ? <DemoButton label={`Venue: ${venue.manifest.venueId} (switch)`} accessibilityLabel={`Venue: ${venue.manifest.venueId}. Switch.`} theme={theme} onPress={switchVenue} /> : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </NavigationProvider>
  );
}

// Demo only: shows which verified pack is serving and runs the lifecycle checks on this device's real filesystem.
function PackStatus({ venue, runtime, theme }: { venue: OpenedVenue; runtime: PackRuntime; theme: NavigationScreenTheme }) {
  const [results, setResults] = useState<SelfTestResult[] | 'running' | null>(null);
  const run = useCallback(() => {
    setResults('running');
    runDeviceSelfTest().then(setResults, (e) => setResults([{ name: 'self-test', ok: false, detail: e instanceof Error ? e.message : String(e) }]));
  }, []);
  const [bench, setBench] = useState<StartupBenchmarkRow[] | 'running' | null>(null);
  const measure = useCallback(() => {
    setBench('running');
    runStartupBenchmark().then(setBench, () => setBench(null));
  }, []);
  const label = `Pack ${venue.manifest.packId}, ${venue.origin}, digest pinned, ${venue.manifest.totalBytes} bytes`;
  const repaired = runtime.install.report.filter((r) => r.status === 'installed' && r.repaired).length;
  return (
    <View>
      <Text accessibilityLabel={label} maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.textSecondary }]}>{label}{repaired ? `, ${repaired} repaired at start` : ''}</Text>
      {runtime.timings ? (
        <Text maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.textSecondary }]}>
          {`Start: install ${Math.round(runtime.timings.installMs)} ms (copy ${Math.round(runtime.timings.copyMs)}, read ${Math.round(runtime.timings.readMs)}), recover ${Math.round(runtime.timings.recoverMs)} ms, open ${Math.round(runtime.timings.openMs)} ms; ${runtime.timings.bytesRead} bytes in ${runtime.timings.filesRead} reads`}
        </Text>
      ) : null}
      <DemoButton label="Measure startup (JS vs platform hashing)" theme={theme} onPress={measure} />
      {bench === 'running' ? <Text maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.textSecondary }]}>Measuring startup</Text> : null}
      {Array.isArray(bench) ? (
        <View accessibilityLabel="Startup measurements">
          {bench.map((r) => (
            <Text key={`${r.hashing}-${r.start}`} maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.text }]}>
              {`${r.hashing === 'js' ? 'JS hash' : 'Platform hash'}, ${r.start}: ${r.totalMs} ms (install ${r.installMs}, recover ${r.recoverMs}, read ${r.readMs}; ${r.bytesRead} bytes read)`}
            </Text>
          ))}
        </View>
      ) : null}
      <DemoButton label="Run pack self-test" theme={theme} onPress={run} />
      {results === 'running' ? <Text maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.textSecondary }]}>Self-test running</Text> : null}
      {Array.isArray(results) ? (
        <View accessibilityLabel="Pack self-test results">
          <Text maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.text }]}>{`Self-test: ${results.filter((r) => r.ok).length} of ${results.length} passed`}</Text>
          {results.map((r) => <Text key={r.name} maxFontSizeMultiplier={DEMO_FONT_CAP} style={[styles.status, { color: theme.colors.text }]}>{`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

// Demo only: lets a simulator user walk the simulated GPS along the live route.
function DemoGps({ location, theme }: { location: SimulatedLocation; theme: NavigationScreenTheme }) {
  const state = useNavigationState();
  const next = useRef(1);
  useEffect(() => { if (state.phase !== 'live') next.current = 1; }, [state.phase]);
  const points = state.route?.line?.points;
  if (state.phase !== 'live' || !points) return null;
  return <DemoButton label="Demo GPS: walk to the next point" theme={theme} onPress={() => location.moveTo(points[Math.min(next.current++, points.length - 1)])} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  problem: { textAlign: 'center', marginBottom: 12 },
  screen: { flex: 1 },
  status: { fontSize: 12, paddingHorizontal: 8 },
  demoBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingTop: 4, gap: 4 },
  tools: { maxHeight: 220 },
  demoButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  demoButtonText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  choice: { gap: 4, paddingBottom: 6 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
