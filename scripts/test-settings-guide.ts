import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const settings = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');

assert(settings.includes('App Guide'), 'Settings must contain App Guide item');
assert(settings.includes("navigation.navigate('AppGuide')"), 'App Guide item must navigate to AppGuide screen');
assert(settings.includes('Voice Language'), 'Settings should use Voice Language label, not generic Language');
assert(!settings.includes('Dark Mode'), 'Dark Mode should be hidden until fully implemented');

const requiredSections = [
  'Welcome',
  'Offline Maps',
  'Search Places',
  'Choose Destination',
  // Renamed from "Choose Start Source" / "Directions Screen" when Phase A/C's canonical
  // origin resolver removed the manual start-source picker this section used to document.
  'Your Start Point',
  'Route Preview',
  'Navigation Screen',
  'Map Controls',
  'Settings Meaning',
  'GPS & Permission Problems',
  'Safety Tips',
  'Troubleshooting',
];

for (const section of requiredSections) {
  assert(guide.includes(section), `Guide section missing: ${section}`);
}

assert(guide.includes('ایپ گائیڈ') || guide.includes('آف لائن نقشہ'), 'Guide should include Urdu text');
assert(guide.includes('Live GPS'), 'Guide should explain live GPS start source');
assert(guide.includes('Last known location'), 'Guide should explain last-known start source');
assert(guide.includes('best eligible official gate'), 'Guide should explain outside-venue gate entry');
assert(guide.includes('Quick Marker Legend'), 'Guide should include marker legend visuals');

console.log('Settings guide checks passed.');
