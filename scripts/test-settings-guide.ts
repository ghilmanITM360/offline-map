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
  'Search Places',
  'Choose Destination',
  'Choose Where You Start',
  'Directions Screen',
  'While You Walk',
  'Map Controls',
  'Settings Meaning',
  'Location Problems',
  'Safety Tips',
  'Troubleshooting',
];

for (const section of requiredSections) {
  assert(guide.includes(section), `Guide section missing: ${section}`);
}

assert(guide.includes('ایپ گائیڈ'), 'Guide should include Urdu text');
assert(guide.includes('Use my location'), 'Guide should explain the use-my-location start');
assert(guide.includes('Use earlier location'), 'Guide should explain the earlier-location start source');
assert(guide.includes('From row'), 'Guide should explain how to pick a start place');
assert(guide.includes('Quick Marker Legend'), 'Guide should include marker legend visuals');

console.log('Settings guide checks passed.');
