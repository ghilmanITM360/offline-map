import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const directions = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');

// Phase D (UX simplification): the map-owned search box (and its keyboard-avoidance,
// blur-on-dismiss, and animated overlay) was removed — LocationsDirectoryScreen is the
// one canonical destination discovery/search surface now. Home's hardware-back handling
// (still real, still covers DETAILS/ROUTE_PREVIEW/PLACE_SELECTED) is exercised by
// scripts/test-map-mode.ts and src/__tests__/HomeScreen.test.tsx instead.

assert(directions.includes('KeyboardAvoidingView'), 'Directions must protect FROM/TO layout when keyboard opens');
assert(directions.includes("keyboardShouldPersistTaps=\"handled\""), 'Directions search result taps must work while keyboard is open');
assert(directions.includes("keyboardDismissMode=\"on-drag\""), 'Directions keyboard should dismiss on scroll');
assert(directions.includes('onSubmitEditing={Keyboard.dismiss}'), 'Manual start search must dismiss keyboard on submit');
assert(directions.includes('setIsEditingManualStart(false)') && directions.includes('Keyboard.dismiss()'), 'Manual start result selection must close keyboard/results');
assert(directions.includes('Choose start manually') && directions.includes('StartOption'), 'Directions start selection must use stacked option cards on small screens');

assert(guide.includes('ScrollView'), 'App Guide must scroll on small screens and large font settings');
assert(guide.includes('contentContainerStyle={styles.content}'), 'App Guide must use constrained scroll content');

console.log('Keyboard/layout source checks passed.');
