import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const settings = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');

assert(settings.includes('App Guide'), 'Settings must contain App Guide item');
assert(settings.includes("navigation.navigate('AppGuide')"), 'App Guide item must navigate to AppGuide screen');

const requiredSections = [
  'Download Offline Map',
  'Find a Block or Rasta',
  'Get Directions',
  'If GPS Does Not Work',
  'Start Navigation',
  'Offline Use',
  'Safety',
];

for (const section of requiredSections) {
  assert(guide.includes(section), `Guide section missing: ${section}`);
}

assert(guide.includes('ایپ گائیڈ') || guide.includes('آف لائن نقشہ'), 'Guide should include Urdu text');

console.log('Settings guide checks passed.');
