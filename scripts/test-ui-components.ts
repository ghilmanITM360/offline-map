import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { messages } from '../src/i18n/messages';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const directions = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
// Legacy (v1) navigation no longer lives in one standalone NavigationScreen.tsx — it's split
// across a viewmodel, an overlay hook, and map-layers/chrome components, mirroring v2's shape.
const navigationVm = readFileSync('src/viewmodels/NavigationViewModel.ts', 'utf8');
const navigationOverlayV1 = readFileSync('src/viewmodels/useNavigationOverlayV1.ts', 'utf8');
const navigationMapLayersV1 = readFileSync('src/views/components/mapgl/navigationScene.ts', 'utf8');
const navigationChromeV1 = readFileSync('src/views/components/navigation/NavigationChromeV1.tsx', 'utf8');
const navigation = [navigationVm, navigationOverlayV1, navigationMapLayersV1, navigationChromeV1].join('\n');
const settings = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');
const drawer = readFileSync('src/views/components/CustomDrawer.tsx', 'utf8');
const welcome = readFileSync('src/views/screens/WelcomeScreen.tsx', 'utf8');
// v2 live navigation chrome now renders in-place on Home (see docs/ARCHITECTURE.md) —
// include it so the raw-ID leak check below still covers it.
const navigationChromeV2 = readFileSync('src/views/components/navigation/NavigationChromeV2.tsx', 'utf8');

const rawIdPattern = /\b(?:R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|B\d+_C\d+|P\d+)\b/;

const visibleUserText = [
  home.replace(/__DEV__ && developerModeEnabled[\s\S]*?<\/React.Fragment>/g, ''),
  directions,
  navigationMapLayersV1,
  navigationChromeV1,
  navigationChromeV2,
  settings.replace(/__DEV__[\s\S]*?Developer Mode[\s\S]*?\)/g, ''),
  guide,
  drawer,
].join('\n');

assert(!rawIdPattern.test(visibleUserText), 'Normal user-facing screen text should not expose raw v2 graph IDs');

assert(welcome.includes('ScrollView'), 'Welcome screen must scroll on short screens and large font settings');
assert(welcome.includes('contentContainerStyle={styles.contentContainer}'), 'Welcome screen must use scroll content constraints');

assert(home.includes('handleZoomIn') && home.includes('handleZoomOut'), 'Home zoom controls must be wired to handlers');
assert(home.includes('handleRecenter'), 'Home current-location/recenter control must be wired');
assert(home.includes('handleCompassToggle'), 'Home compass control must be wired');
assert(home.includes('openLayerOptions'), 'Home layer control must open the layer chooser');
assert(home.includes('handleOpenDirections'), 'Home selected-place CTA must open Directions');
assert(!home.includes('allLocationsChip') && !home.includes('chipsContainer'), 'Home must no longer carry a chip row (the Directory is the one place chooser)');
assert(!home.includes('Entry {ep.nodeId}'), 'Home normal entrance chips must not expose raw node IDs');
assert(home.includes('KeyboardAvoidingView'), 'Home must use keyboard-aware layout (LocationSheet keyboard interactions)');

assert(directions.includes('KeyboardAvoidingView'), 'Directions must use keyboard-aware layout');
assert(directions.includes('keyboardDismissMode="on-drag"'), 'Directions must dismiss keyboard on scroll');
assert(directions.includes("onOpenDirectory?.('start')"), 'Directions must hand every start change to the Directory (#222)');
assert(directions.includes('Start Navigation'), 'Directions must expose a Start Navigation CTA once the route is ready');
assert(directions.includes('Route ready'), 'Directions must show route-ready state');
assert(directions.includes('Change destination'), 'Directions must keep destination-change action');

// Both v1 and v2 live navigation now run in-place on HomeScreen's persistent MapView — v1's
// runtime (NavigationViewModel) itself rejects a v2-shaped activeRoute rather than relying on
// an outer screen-level disabled-v2 fallback (there's no separate screen left to gate on).
assert(
  navigationVm.includes("(activeRoute as { sourceVersion?: string }).sourceVersion === 'v2'"),
  'Legacy (v1) navigation runtime must detect and reject v2-shaped active routes',
);
assert(home.includes('<OfflineMapCanvas') && home.includes('archiveUri={basemapRejected ? null : basemap.uri}') && !home.includes('PROVIDER_GOOGLE'), 'Home map must render only the bundled offline basemap, never Google tiles');
assert(navigation.includes('route.coordinates'), 'Navigation must render route polyline from active route coordinates');
assert(navigation.includes('showNavigationStart'), 'Navigation must render a start marker');
assert(navigation.includes('showNavigationDestination'), 'Navigation must render a destination marker');
assert(navigation.includes('showNavigationUser'), 'Navigation must render current/user marker');
assert(navigation.includes('onPress={requestNavigationExit}'), 'Navigation active Exit must use confirmation owner');
assert(navigation.includes('onPress={completeArrivalNavigation}'), 'Navigation arrival Done must exit immediately');
assert(navigation.includes('styles.tripTextWrap'), 'Navigation bottom trip text must be constrained separately from Exit button');
assert(navigation.includes('cameraManager.enterNavigationCamera(') && navigation.includes('LocateFixed'), 'Navigation recenter button must animate camera');
assert(
  navigation.includes('testID="nav-arrived-recenter-button"') && navigation.includes('testID="nav-arrived-done-button"'),
  'Navigation arrival sheet must offer both Recenter map and Done actions',
);

assert(settings.includes('disabled={!isToggle && !onPress}'), 'Settings info-only rows must be disabled');
assert(settings.includes('numberOfLines={1}') && settings.includes('ellipsizeMode="tail"'), 'Settings labels/values must constrain long text');
assert(!settings.includes('Delete Map Data') && !settings.includes('Update Map'), 'Settings must not offer map download/delete: the map ships with the app (#140)');
assert(settings.includes("t('settings.appGuide')") && settings.includes("navigation.navigate('AppGuide')"), 'Settings App Guide row must navigate');

assert(guide.includes('ScrollView'), 'App Guide must be scrollable');
assert(guide.includes('help.guideLocationTitle') && !guide.includes('Offline Maps'), 'App Guide must cover location problems and carry no offline section');
assert(guide.includes('help.guideStartSectionBody') && messages.en['help.guideStartSectionBody'].includes('complete walking journey') && messages.en['help.guideTroubleBody'].includes("If a gate isn't ready"), 'App Guide must explain complete-journey gate entry and what to do when a gate is not ready');

assert(drawer.includes('accessibilityRole="button"'), 'Drawer items must expose button role');
assert(drawer.includes("labelKey: 'drawer.findPlace'") && drawer.includes("labelKey: 'drawer.settings'") && drawer.includes("labelKey: 'drawer.help'"), 'Drawer must expose core app navigation items');

console.log('UI component source checks passed.');
