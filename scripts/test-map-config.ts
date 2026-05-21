import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  getGoogleMapsRuntimeStatusFromInputs,
  GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE,
  GOOGLE_MAPS_LOAD_FAILED_MESSAGE,
} from '../src/services/MapConfigResolver';

const appConfig = readFileSync('app.config.js', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');

const statusWithEnv = getGoogleMapsRuntimeStatusFromInputs({
  platform: 'android',
  expoConfig: null,
  env: {
    EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: 'TEST_ANDROID_1234567890',
  },
});
assert.equal(statusWithEnv.keyPresent, true, 'Map config should report keyPresent=true when EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY is set');
assert.equal(statusWithEnv.source, 'env', 'Map config should report env as source when only env key is provided');

const statusWithoutEnv = getGoogleMapsRuntimeStatusFromInputs({
  platform: 'android',
  expoConfig: null,
  env: {},
});
assert.equal(statusWithoutEnv.keyPresent, false, 'Map config should report keyPresent=false when Android env key is missing');
assert.equal(statusWithoutEnv.source, 'none', 'Map config should report none source when no key is configured');

assert.equal(
  GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE,
  'Google Maps key is not configured. Offline venue data still works.',
  'Missing-key warning message must match product copy',
);
assert.equal(
  GOOGLE_MAPS_LOAD_FAILED_MESSAGE,
  'Map failed to load. Check Google Cloud restrictions and Maps SDK for Android.',
  'Map-failed warning message must match product copy',
);
assert(
  homeScreen.includes('MapConfigService.getMissingGoogleMapsMessage()') &&
    homeScreen.includes('MapConfigService.getMapLoadFailedMessage()') &&
    homeScreen.includes('hasGoogleMapsKey && mapLoadFailed'),
  'Home warning logic should show missing-key text only when key is missing, and map-failed text when key exists but map fails',
);

assert(
  appConfig.includes('process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY'),
  'app.config.js must use process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY',
);
assert(
  appConfig.includes("package: androidPackageName") && appConfig.includes("const androidPackageName = 'com.aicrafted.karachiijtema';"),
  'app.config.js must set Android package com.aicrafted.karachiijtema',
);

assert(
  envExample.includes('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=your_android_maps_key_here') &&
    envExample.includes('EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY=your_ios_maps_key_here'),
  '.env.example must contain placeholder values only',
);
assert(!/AIza[0-9A-Za-z_-]{20,}/.test(envExample), '.env.example must not contain a real Google API key');

assert(gitignore.includes('.env'), '.gitignore must ignore .env');
assert(gitignore.includes('.env.local'), '.gitignore must ignore .env.local');
assert(gitignore.includes('!.env.example'), '.gitignore must keep .env.example committed');

const disallowedKeyPattern = /AIza[0-9A-Za-z_-]{20,}/;
const skipDirs = new Set(['.git', 'node_modules', '.expo', 'dist', 'build', 'coverage', 'assets']);

function scanForRealGoogleApiKey(startDir: string): string[] {
  const matches: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (skipDirs.has(entry)) continue;
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const content = readFileSync(fullPath, 'utf8');
      if (disallowedKeyPattern.test(content)) {
        matches.push(fullPath);
      }
    }
  }

  walk(startDir);
  return matches;
}

const committedKeyMatches = scanForRealGoogleApiKey(process.cwd());
assert.equal(
  committedKeyMatches.length,
  0,
  `Real Google API key pattern found in committed files: ${committedKeyMatches.join(', ')}`,
);

console.log('Map config checks passed.');
