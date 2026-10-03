import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const directions = readFileSync('src/views/components/map/LocationSheet.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');

assert(home.includes('KeyboardAvoidingView'), 'Home must protect sheet layout when keyboard opens');
assert(home.includes("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}"), 'Home must define platform keyboard behavior');
assert(home.includes('hardwareBackPress'), 'Home Android back must step back through sheet modes first');
assert(home.includes('contentContainerStyle={styles.chipsContent}'), 'Home chips need content container constraints');

assert(directions.includes('KeyboardAvoidingView'), 'Directions must protect FROM/TO layout when keyboard opens');
assert(directions.includes("keyboardShouldPersistTaps=\"handled\""), 'Directions search result taps must work while keyboard is open');
assert(directions.includes("keyboardDismissMode=\"on-drag\""), 'Directions keyboard should dismiss on scroll');
// #222: place search lives only in the Directory, so the sheet has no text input for the keyboard to cover.
assert(!directions.includes('SearchBarField') && !directions.includes('TextInput'), 'Directions must not host its own place search (the Directory is the one chooser)');
assert(directions.includes("onOpenDirectory?.('start')"), 'Manual start must hand off to the Directory');

assert(guide.includes('ScrollView'), 'App Guide must scroll on small screens and large font settings');
assert(guide.includes('contentContainerStyle={styles.content}'), 'App Guide must use constrained scroll content');

console.log('Keyboard/layout source checks passed.');
