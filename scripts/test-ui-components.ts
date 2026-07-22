import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const directions = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const navigation = readFileSync('src/views/screens/NavigationScreen.tsx', 'utf8');
const settings = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');
const drawer = readFileSync('src/views/components/CustomDrawer.tsx', 'utf8');
const permission = readFileSync('src/views/screens/PermissionScreen.tsx', 'utf8');
// v2 live navigation chrome now renders in-place on Home (see docs/MAP_EXPERIENCE_AUDIT.md) —
// include it so the raw-ID leak check below still covers it.
const navigationChromeV2 = readFileSync('src/views/components/navigation/NavigationChromeV2.tsx', 'utf8');

const rawIdPattern = /\b(?:R\d+-\d+|SPNP-\d+|SPSP-\d+|SPWP-\d+|B\d+_C\d+|P\d+)\b/;

const visibleUserText = [
  home.replace(/__DEV__ && developerModeEnabled[\s\S]*?<\/React.Fragment>/g, ''),
  directions,
  navigation.replace(/developerMode[\s\S]*?graphOnlyFallback/g, 'graphOnlyFallback'),
  navigationChromeV2,
  settings.replace(/__DEV__[\s\S]*?Developer Mode[\s\S]*?\)/g, ''),
  guide,
  drawer,
].join('\n');

assert(!rawIdPattern.test(visibleUserText), 'Normal user-facing screen text should not expose raw v2 graph IDs');

assert(permission.includes('ScrollView'), 'Permission screen must scroll on short screens and large font settings');
assert(permission.includes('contentContainerStyle={styles.contentContainer}'), 'Permission screen must use scroll content constraints');

assert(home.includes('handleZoomIn') && home.includes('handleZoomOut'), 'Home zoom controls must be wired to handlers');
assert(home.includes('handleRecenter'), 'Home current-location/recenter control must be wired');
assert(home.includes('handleCompassReset'), 'Home compass control must be wired');
assert(home.includes('openLayerOptions'), 'Home layer control must open the layer chooser');
assert(home.includes('handleOpenDirections'), 'Home selected-place CTA must open Directions');
assert(home.includes('horizontal') && home.includes('categoryChips.map'), 'Home category chips must be horizontally scrollable');
assert(home.includes('paddingRight: 88'), 'Home category chips must reserve trailing space near floating controls');
assert(home.includes('numberOfLines={1}') && home.includes('ellipsizeMode="tail"'), 'Home long search/chip labels must be constrained');
assert(!home.includes('Entry {ep.nodeId}'), 'Home normal entrance chips must not expose raw node IDs');
assert(home.includes('KeyboardAvoidingView'), 'Home must use keyboard-aware layout for search');
assert(home.includes("keyboardShouldPersistTaps='handled'") || home.includes('keyboardShouldPersistTaps="handled"'), 'Home scrollable touch areas must keep taps working around keyboard');

assert(directions.includes('KeyboardAvoidingView'), 'Directions must use keyboard-aware layout');
assert(directions.includes('keyboardDismissMode="on-drag"'), 'Directions must dismiss keyboard on scroll');
assert(directions.includes('Use my current location'), 'Directions must expose current-location start action');
assert(directions.includes('Use last known location'), 'Directions must expose last-known start action when available');
assert(directions.includes('Choose start manually'), 'Directions must expose manual start action');
assert(directions.includes('Show route on map'), 'Directions must hand route preview back to Home map');
assert(directions.includes('Route ready'), 'Directions must show route-ready state');
assert(directions.includes('Find nearest official gate automatically'), 'Directions must explain current-location routing behavior');
assert(directions.includes('Change destination'), 'Directions must keep destination-change action');

// v2 live navigation now runs in-place on HomeScreen's persistent MapView (useNavigationOverlayV2) —
// NavigationScreen itself only renders the legacy v1 path, plus a defensive disabled-v2 fallback.
assert(navigation.includes('<NavigationScreenV1 />') && navigation.includes('<NavigationScreenV2Disabled />'), 'Navigation screen must isolate the v1 render path from the disabled-v2 fallback');
assert(navigation.includes('NavigationScreenV2Disabled'), 'Navigation must block v2 routes when v2 navigation flag is off');
assert(navigation.includes('mapType={hasGoogleMapsKey && hasInternet ?') && navigation.includes(": 'none'"), 'Navigation must render graph-only map when base map is unavailable or internet is offline');
assert(navigation.includes('route.coordinates'), 'Navigation must render route polyline from active route coordinates');
assert(navigation.includes('title={route.origin.label}') || navigation.includes('title="Start"'), 'Navigation must render a start marker');
assert(navigation.includes('destinationMarker'), 'Navigation must render a destination marker');
assert(navigation.includes('userMarker'), 'Navigation must render current/user marker');
assert(navigation.includes('handleExit(nav)'), 'Navigation exit button must be wired');
assert(navigation.includes('styles.tripTextWrap'), 'Navigation bottom trip text must be constrained separately from Exit button');
assert(navigation.includes('animateCamera') && navigation.includes('LocateFixed'), 'Navigation recenter button must animate camera');

assert(settings.includes("disabled={type !== 'toggle' && !onPress}"), 'Settings info-only rows must be disabled');
assert(settings.includes('numberOfLines={1}') && settings.includes('ellipsizeMode="tail"'), 'Settings labels/values must constrain long text');
assert(settings.includes('Alert.alert') && settings.includes('Delete offline map data?'), 'Settings delete-map action must require confirmation');
assert(settings.includes('App Guide') && settings.includes("navigation.navigate('AppGuide')"), 'Settings App Guide row must navigate');

assert(guide.includes('ScrollView'), 'App Guide must be scrollable');
assert(guide.includes('Offline Maps') && guide.includes('GPS & Permission Problems'), 'App Guide must cover offline and GPS fallback topics');
assert(guide.includes('official gate') && guide.includes('connector verification'), 'App Guide must explain official gate and connector verification behavior');

assert(drawer.includes('accessibilityRole="button"'), 'Drawer items must expose button role');
assert(drawer.includes("label: 'Home'") && drawer.includes("label: 'Settings'"), 'Drawer must expose core app navigation items');

console.log('UI component source checks passed.');
