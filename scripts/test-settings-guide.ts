import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { messages } from '../src/i18n/messages';

const settings = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const guide = readFileSync('src/views/screens/AppGuideScreen.tsx', 'utf8');

assert(settings.includes("t('settings.appGuide')"), 'Settings must contain App Guide item');
assert(settings.includes("navigation.navigate('AppGuide')"), 'App Guide item must navigate to AppGuide screen');
assert(!settings.includes('Voice Language'), 'Voice Language is gone: the spoken text is English only');
assert(!settings.includes('Dark Mode'), 'Dark Mode should be hidden until fully implemented');

const requiredSections = ['help.guideWelcomeTitle', 'help.guideSearchTitle', 'help.guideDestinationTitle', 'help.guideStartSectionTitle', 'help.guideDirectionsTitle', 'help.guideWalkTitle', 'help.guideControlsTitle', 'help.guideSettingsTitle', 'help.guideLocationTitle', 'help.guideSafetyTitle', 'help.guideTroubleTitle'] as const;
for (const key of requiredSections) {
  assert(guide.includes(key), `Guide section missing: ${key}`);
  for (const locale of ['en', 'ur-Latn', 'ur'] as const) assert(messages[locale][key].trim(), `Empty ${locale} section ${key}`);
}
assert(guide.includes("t('help.guideTitle')"), 'Guide title must use the translation catalog');
assert(guide.includes('help.guideStartMyLocation'), 'Guide must explain use-my-location');
assert(guide.includes('help.guideStartEarlier'), 'Guide must explain earlier-location provenance');
assert(guide.includes('help.guideStartSectionBody'), 'Guide must explain choosing an origin');
assert(guide.includes("t('help.guideLegendTitle')"), 'Guide must show marker legend');

console.log('Settings guide checks passed.');
