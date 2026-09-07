import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const directions = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');

// Phase D (UX simplification): the map-owned search box (and its keyboard-avoidance,
// blur-on-dismiss, and animated overlay) was removed — LocationsDirectoryScreen is the
// one canonical destination discovery/search surface now. Home's hardware-back handling
// (still real, still covers DETAILS/ROUTE_PREVIEW/PLACE_SELECTED) is exercised by
// scripts/test-map-mode.ts and src/__tests__/HomeScreen.test.tsx instead.

// Phase A/C's canonical origin resolver later removed the in-sheet manual-start search
// entirely (no keyboard/results state left to manage here — start is auto-resolved, shown
// as a plain summary card) — see LocationSheet.test.tsx.
assert(directions.includes('KeyboardAvoidingView'), 'Directions must protect FROM/TO layout when keyboard opens');
assert(directions.includes("keyboardShouldPersistTaps=\"handled\""), 'Directions search result taps must work while keyboard is open');
assert(directions.includes("keyboardDismissMode=\"on-drag\""), 'Directions keyboard should dismiss on scroll');
assert(
  !directions.includes('setIsEditingManualStart') && !directions.includes('StartOption'),
  'Directions must not reintroduce the removed manual-start search UI',
);

assert(guide.includes('ScrollView'), 'App Guide must scroll on small screens and large font settings');
assert(guide.includes('contentContainerStyle={styles.content}'), 'App Guide must use constrained scroll content');

console.log('Keyboard/layout source checks passed.');
