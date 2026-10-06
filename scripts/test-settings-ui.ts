import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const settings = readFileSync('src/views/screens/SettingsScreen.tsx', 'utf8');
const settingsVm = readFileSync('src/viewmodels/SettingsViewModel.ts', 'utf8');
const appStore = readFileSync('src/store/useAppStore.ts', 'utf8');

const requiredFunctionalRows = [
  'Voice Language',
  'Auto-follow Location',
  'North-up Map',
  'Voice Instructions',
  'Fix my route automatically',
  'Distance Unit',
  'Walking Speed',
  'Location Permission',
  'App Guide',
];

for (const label of requiredFunctionalRows) {
  assert(settings.includes(label), `Settings row missing: ${label}`);
}

assert(settings.includes('updateSettingValue'), 'Text selector rows must persist setting changes');
assert(settings.includes("handleToggle('autoFollowLocation')"), 'Auto-follow row must be functional');
assert(settings.includes("handleToggle('keepNorthFixed')"), 'North-up row must be functional');
assert(settings.includes("handleToggle('voiceInstructions')"), 'Voice instructions row must be functional');
assert(settings.includes("handleToggle('autoReroute')"), 'Fix my route automatically row must be functional');
assert(settings.includes('handleReRequestPermission'), 'Location Permission row must be functional');
assert(settings.includes("navigation.navigate('AppGuide')"), 'App Guide row must be functional');

assert(settings.includes('disabled={!isToggle && !onPress}'), 'Info-only rows must not look or behave like active buttons');
assert(!settings.includes('Update Map') && !settings.includes('Delete Map Data') && !settings.includes('Map Style'), 'Settings must not offer map download/delete or a map style: the offline map ships with the app (#140)');
assert(settings.includes('Developer Mode') && settings.includes('__DEV__'), 'Developer Mode must be hidden outside development builds');
assert(appStore.includes('persist') && appStore.includes('settings'), 'Settings must persist through app restarts');
assert(settingsVm.includes('LocationAccessService.openAppSettings'), 'Permission management must open OS app settings when needed');
assert(settingsVm.includes('LocationAccessService.openLocationSettings'), 'Permission management must open device location settings when needed');

console.log('Settings UI checks passed.');
