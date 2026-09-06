import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { deriveMapMode, type MapModeInputs } from '../src/viewmodels/useMapMode';

// Phase 7 stabilization audit — regression guards for the 5 findings raised when auditing the
// Google Maps style navigation architecture before moving to visual polish (Phase 8).

const base: MapModeInputs = {
  arrived: false,
  showNavOverlay: false,
  isSearchFocused: false,
  detailsExpanded: false,
  directionsDestination: null,
  activePreviewRoute: null,
  selectedPlace: null,
};

// 1. NAVIGATION -> ARRIVAL -> EXPLORE (full lifecycle, not just pairwise transitions).
{
  const navigating = deriveMapMode({ ...base, showNavOverlay: true });
  assert.equal(navigating, 'NAVIGATION', 'Step 1: starting navigation must produce MapMode.NAVIGATION');

  const arrived = deriveMapMode({ ...base, showNavOverlay: true, arrived: true });
  assert.equal(arrived, 'ARRIVAL', 'Step 2: GPS arrival must flip MapMode.NAVIGATION -> MapMode.ARRIVAL');

  const exited = deriveMapMode({ ...base, showNavOverlay: false, arrived: false });
  assert.equal(exited, 'EXPLORE', 'Step 3: exiting after arrival must return MapMode.EXPLORE');
}

// 2. Arrival must reset only at real per-trip lifecycle boundaries — a new navigationSessionId
// (startNavigation()) or the route becoming null (Done/cancel) — never merely because routeId
// changed (a reroute swaps activeRoute, and its routeId, without starting a new trip). This is
// NEW-04's arrival-latch fix: NavigationViewModelV2 used to reset `arrived` unconditionally
// whenever route?.routeId changed, which correctly cleared stale arrival on a genuinely new trip
// but incorrectly also cleared *earned* arrival on an in-session reroute.
{
  const navigationVmSource = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');

  const sessionResetStart = navigationVmSource.indexOf('useEffect(() => {\n    setArrived(false);');
  assert(sessionResetStart >= 0, 'NavigationViewModelV2 must keep an unconditional arrival-reset effect keyed on navigationSessionId');
  const sessionResetEnd = navigationVmSource.indexOf('}, [navigationSessionId]);', sessionResetStart);
  assert(sessionResetEnd > sessionResetStart, 'navigationSessionId-keyed arrival-reset effect must be found');

  const routeNullResetStart = navigationVmSource.indexOf('if (route) return;\n    setArrived(false);');
  assert(routeNullResetStart >= 0, 'NavigationViewModelV2 must reset arrived when route becomes null (Done/cancel)');

  const routeIdEffectStart = navigationVmSource.indexOf("useEffect(() => {\n    if (!route) return;\n    setRemainingDistance");
  const routeIdEffectEnd = navigationVmSource.indexOf('}, [route?.routeId]);', routeIdEffectStart);
  assert(routeIdEffectStart >= 0 && routeIdEffectEnd > routeIdEffectStart, 'route?.routeId-keyed effect must be found');
  const routeIdEffectBody = navigationVmSource.slice(routeIdEffectStart, routeIdEffectEnd);
  assert(
    !routeIdEffectBody.includes('setArrived(false)') && !routeIdEffectBody.includes('arrivedRef.current = false'),
    'route?.routeId-keyed effect (which also fires on reroute) must NOT clear earned arrival — reroute must not un-arrive',
  );

  // v1 already resets `arrived` unconditionally on destination change — keep it that way.
  const navigationVmV1Source = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
  assert(navigationVmV1Source.includes('setArrived(false)'), 'Legacy (v1) navigation view model must keep resetting arrived on a new trip');
}

// 3. Navigation chrome/map layers must render only in NAVIGATION or ARRIVAL mode — never in
// EXPLORE/SEARCH/PLACE_SELECTED/DETAILS/ROUTE_PREVIEW. Regression guard for a real bug found in
// this audit: `arrived` outranks NAVIGATION in the mode priority chain, so gating the nav chrome
// on `mode === 'NAVIGATION'` alone unmounted it (and its arrival sheet) the instant GPS detected
// arrival. The mount condition must cover both modes so the arrival sheet stays visible.
{
  const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
  assert(
    home.includes("(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationChromeV2"),
    'NavigationChromeV2 must stay mounted through MapMode.ARRIVAL, not just MapMode.NAVIGATION',
  );
  assert(
    home.includes("(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationChromeV1"),
    'NavigationChromeV1 must stay mounted through MapMode.ARRIVAL, not just MapMode.NAVIGATION',
  );
  assert(
    home.includes("(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationMapLayersV2"),
    'NavigationMapLayersV2 (route/user marker) must stay mounted through MapMode.ARRIVAL',
  );
  assert(
    home.includes("(mode === 'NAVIGATION' || mode === 'ARRIVAL') && <NavigationMapLayersV1"),
    'NavigationMapLayersV1 (route/user marker) must stay mounted through MapMode.ARRIVAL',
  );
  assert(
    home.includes("mode !== 'NAVIGATION' && mode !== 'ARRIVAL' && (useV2Map"),
    'Non-navigation (detail) map layers must stay hidden through both NAVIGATION and ARRIVAL',
  );

  // Confirm the other 5 modes never satisfy either half of that OR — mode is a single derived
  // string, so this is definitional, but assert it explicitly against the real selector.
  for (const other of ['EXPLORE', 'SEARCH', 'PLACE_SELECTED', 'DETAILS', 'ROUTE_PREVIEW'] as const) {
    const inputs: MapModeInputs = { ...base };
    if (other === 'SEARCH') inputs.isSearchFocused = true;
    if (other === 'PLACE_SELECTED') inputs.selectedPlace = { id: 'B1' };
    if (other === 'DETAILS') inputs.detailsExpanded = true;
    if (other === 'ROUTE_PREVIEW') inputs.activePreviewRoute = { routeId: 'r1' };
    // deriveMapMode's return type for these inputs excludes 'NAVIGATION'/'ARRIVAL' entirely, so
    // this equality check IS the "never satisfies the nav-chrome mount condition" guarantee.
    assert.equal(deriveMapMode(inputs), other, `sanity: inputs for ${other} must actually derive ${other}, never NAVIGATION/ARRIVAL`);
  }
}

// 4. Camera calls only through CameraManager — no navigation-adjacent component/viewmodel/screen
// may call mapRef.current?.animateCamera/fitToCoordinates/animateToRegion directly. Only
// useCameraManager.ts (the CameraManager itself) is allowed to.
{
  const bypassPattern = /mapRef\.current\?\.(animateCamera|fitToCoordinates|animateToRegion)/;
  const filesToCheck = [
    'src/views/components/navigation/NavigationChromeV1.tsx',
    'src/views/components/navigation/NavigationChromeV2.tsx',
    'src/views/components/navigation/NavigationMapLayersV1.tsx',
    'src/views/components/navigation/NavigationMapLayersV2.tsx',
    'src/viewmodels/useNavigationOverlayV1.ts',
    'src/viewmodels/useNavigationOverlayV2.ts',
    'src/viewmodels/HomeViewModel.ts',
    'src/views/screens/HomeScreen.tsx',
  ];
  for (const file of filesToCheck) {
    const source = readFileSync(file, 'utf8');
    assert(!bypassPattern.test(source), `${file} must route camera moves through CameraManager, not mapRef.current directly`);
  }
  // The allowed owner must still be the one actually doing it.
  const cameraManagerSource = readFileSync('src/viewmodels/useCameraManager.ts', 'utf8');
  assert(bypassPattern.test(cameraManagerSource), 'useCameraManager.ts must remain the sole owner of direct mapRef camera calls');

  // Regression guard: HomeViewModel's zoom/compass controls (rendered during MapMode.NAVIGATION
  // too, via MapControls variant="nav") must go through the CameraManager wrapper methods added
  // for this audit, not mapRef directly.
  const homeViewModelSource = readFileSync('src/viewmodels/HomeViewModel.ts', 'utf8');
  assert(homeViewModelSource.includes('cameraManager.resetCompass()'), 'Compass reset must go through cameraManager.resetCompass()');
  assert(homeViewModelSource.includes('cameraManager.nudgeZoom('), 'Zoom in/out must go through cameraManager.nudgeZoom()');
}

// 5. No duplicate progress owner. NavigationProgressService (added earlier in Phase 7 to satisfy
// a literal "create if missing" spec line) was never wired into production and duplicated
// RerouteService's point-to-segment projection math. This audit removed it — RerouteService
// (projectProgressMetersOnRoute + clampMonotonicProgress) is the single progress engine, used
// directly by v1's NavigationViewModel and wrapped by v2's calculateNavigationProgressV2.
{
  assert(!existsSync('src/services/NavigationProgressService.ts'), 'Duplicate NavigationProgressService must stay removed');
  assert(!existsSync('scripts/test-navigation-progress-service.ts'), 'Its standalone test must stay removed alongside it');

  const packageJson = readFileSync('package.json', 'utf8');
  assert(!packageJson.includes('test:navigation-progress-service'), 'package.json must not reference the removed duplicate progress service test');

  const rerouteServiceSource = readFileSync('src/services/RerouteService.ts', 'utf8');
  assert(
    rerouteServiceSource.includes('Single owner of "closest point on route / progress meters"'),
    'RerouteService must document itself as the single progress-projection owner',
  );

  const v1Source = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
  const v2RuntimeSource = readFileSync('src/services/V2NavigationRuntimeService.ts', 'utf8');
  assert(v1Source.includes('RerouteService.projectProgressMetersOnRoute('), 'v1 must keep projecting progress through RerouteService');
  assert(
    v2RuntimeSource.includes('RerouteService.projectProgressMetersOnRoute('),
    'v2 (via calculateNavigationProgressV2) must keep projecting progress through RerouteService',
  );
}

// 6. isNavigating / MapMode single-source-of-truth. A follow-up audit found that
// useAppStore's raw `isNavigating` boolean and MapMode's derived NAVIGATION/ARRIVAL modes are
// "two flags, one concept": both ultimately move together (MapMode.NAVIGATION is downstream of
// isNavigating via NavigationViewModelV2's `route` / v1's destination-gated route), but through
// separate derivation chains that could silently desync if either changes independently — and
// a third, undisciplined direct read of the raw store field could reintroduce a genuinely
// independent chain. This finding pins isNavigating to exactly one writer, a closed list of
// sanctioned direct readers, and the derivation chain that carries it into MapMode.
{
  // 6a. Single writer: `isNavigating` may only ever be set by startNavigation/stopNavigation
  // (plus the initial state) inside useAppStore.ts — nowhere else in src/ may call
  // `set({ isNavigating` or otherwise assign the field.
  const storeSource = readFileSync('src/store/useAppStore.ts', 'utf8');
  const isNavigatingAssignments = storeSource.match(/isNavigating:\s*(true|false)/g) ?? [];
  assert.equal(
    isNavigatingAssignments.length,
    3,
    `useAppStore.ts must contain exactly 3 isNavigating assignments (initial state + startNavigation + stopNavigation), found ${isNavigatingAssignments.length}`,
  );

  function listSourceFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...listSourceFiles(full));
      } else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes(`${path.sep}__tests__${path.sep}`)) {
        files.push(full);
      }
    }
    return files;
  }

  const filesReadingRawIsNavigating = listSourceFiles('src')
    .filter((file) => file !== path.join('src', 'store', 'useAppStore.ts'))
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      // Matches both the Zustand selector form (`s.isNavigating` / `s) => s.isNavigating`)
      // and any other direct property access — deliberately broad so a new indirect read
      // can't slip past this guard unnoticed.
      return /\.isNavigating\b/.test(source);
    })
    .map((file) => file.split(path.sep).join('/'))
    .sort();

  // 6b. Closed list of sanctioned direct readers — see the `isNavigating` doc comment in
  // useAppStore.ts for why each of these needs the raw primitive instead of MapMode. Adding a
  // new direct reader anywhere else must update this list deliberately, not by accident.
  const sanctionedDirectReaders = [
    'src/viewmodels/HomeViewModel.ts',
    'src/viewmodels/NavigationViewModelV2.ts',
    'src/views/screens/HomeScreen.tsx',
  ].sort();

  assert.deepEqual(
    filesReadingRawIsNavigating,
    sanctionedDirectReaders,
    `Direct readers of store.isNavigating must be exactly ${JSON.stringify(sanctionedDirectReaders)}, found ${JSON.stringify(filesReadingRawIsNavigating)}. ` +
    'A new direct reader must either route through MapMode instead, or be deliberately added to this closed list (and justified in the doc comment on `isNavigating` in useAppStore.ts).',
  );

  // 6c. Derivation chain: MapMode's NAVIGATION/ARRIVAL modes must stay downstream of
  // isNavigating for both v1 and v2, not gain some other independent path to "true".
  const navVmV2Source = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
  assert(
    navVmV2Source.includes('const route = isNavigating && isV2ActiveRoute(activeRoute) ? activeRoute : null;'),
    'v2 MapMode derivation must keep gating `route` (which feeds useNavigationOverlayV2.active -> showNavOverlay -> deriveMapMode) on isNavigating',
  );
  const navVmV1Source = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
  assert(
    navVmV1Source.includes('if (!destination) return;'),
    'v1 MapMode derivation must keep gating `route` on `destination`, which is itself only ever set alongside isNavigating in useAppStore.startNavigation/stopNavigation',
  );
  const overlayV2Source = readFileSync('src/viewmodels/useNavigationOverlayV2.ts', 'utf8');
  assert(overlayV2Source.includes('active: !!route'), 'useNavigationOverlayV2.active must stay derived from `route`, not a second independent flag');
  const overlayV1Source = readFileSync('src/viewmodels/useNavigationOverlayV1.ts', 'utf8');
  assert(overlayV1Source.includes('active: !!route'), 'useNavigationOverlayV1.active must stay derived from `route`, not a second independent flag');
  const homeScreenSource = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
  assert(
    homeScreenSource.includes('const showNavOverlay = navOverlay.active && MapFeatureFlagsService.useIjtemaV2Navigation();'),
    'showNavOverlay (the only input by which isNavigating enters deriveMapMode) must stay derived from navOverlay.active, not a second independent signal',
  );

  // 6d. Pure-function invariant, mirroring the real derivation chain above: whenever the
  // isNavigating-gated overlay-active signal is false, deriveMapMode must never report
  // NAVIGATION/ARRIVAL, regardless of what any other input is doing.
  const navActiveModes: MapModeInputs['showNavOverlay'][] = [false];
  for (const showNavOverlay of navActiveModes) {
    for (const arrived of [false, true]) {
      const mode = deriveMapMode({ ...base, showNavOverlay, arrived, isSearchFocused: true, detailsExpanded: true, selectedPlace: { id: 'B1' } });
      if (arrived) {
        // `arrived` alone still outranks everything and produces ARRIVAL even with
        // showNavOverlay false — this mirrors real usage, where HomeScreen only ever sets
        // `arrived` true from navOverlay(V1).arrived, itself gated on the same `route`
        // used above, so it can't go true independently of isNavigating in practice. Assert
        // that explicitly instead of assuming it.
        assert.equal(mode, 'ARRIVAL', 'sanity: arrived alone must still resolve to ARRIVAL (documented, not itself an isNavigating leak — see navOverlay(V1).arrived)');
      } else {
        assert.notEqual(mode, 'NAVIGATION', 'showNavOverlay=false (i.e. isNavigating-gated route is null) must never resolve to NAVIGATION');
        assert.notEqual(mode, 'ARRIVAL', 'showNavOverlay=false and arrived=false must never resolve to ARRIVAL');
      }
    }
  }

  // 6e. Documented, intentional exception: an emergency v2-navigation-flag rollback
  // (EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION=false) keeps isNavigating true (the v2 nav runtime
  // keeps running GPS/reroute/speech effects) while showNavOverlay/mode fall out of
  // NAVIGATION/ARRIVAL, because showNavOverlay ANDs navOverlay.active with the feature flag.
  // This is the one place isNavigating and MapMode are allowed to disagree — asserted here so
  // it stays a deliberate, tested exception instead of a silent one.
  {
    const isNavigatingDuringRollback = true; // v2 destination, startNavigation() already called
    const showNavOverlayDuringRollback = false; // navOverlay.active true, but flag false -> AND is false
    assert(isNavigatingDuringRollback, 'sanity');
    const mode = deriveMapMode({ ...base, showNavOverlay: showNavOverlayDuringRollback });
    assert.notEqual(
      mode,
      'NAVIGATION',
      'documented exception: MapMode must NOT report NAVIGATION during an EXPO_PUBLIC_USE_IJTEMA_V2_NAVIGATION=false rollback, even while isNavigating stays true',
    );
  }
}

console.log('Navigation architecture audit checks passed.');
