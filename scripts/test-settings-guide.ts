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
  'Choose Start Source',
  'Directions Screen',
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
assert(guide.includes('Use My Current Location'), 'Guide should explain live GPS start source');
assert(guide.includes('Use Last Known Location'), 'Guide should explain last-known start source');
assert(guide.includes('FROM row'), 'Guide should explain how to pick a start place');
assert(guide.includes('Quick Marker Legend'), 'Guide should include marker legend visuals');

console.log('Settings guide checks passed.');
