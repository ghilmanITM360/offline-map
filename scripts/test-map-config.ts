/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  getGoogleMapsRuntimeStatusFromInputs,
  GOOGLE_MAPS_KEY_NOT_CONFIGURED_MESSAGE,
  GOOGLE_MAPS_LOAD_FAILED_MESSAGE,
} from '../src/services/MapConfigResolver';

const appConfig = readFileSync('app.config.js', 'utf8');
const appJson = JSON.parse(readFileSync('app.json', 'utf8')) as {
  expo?: { android?: { permissions?: string[] } };
};
const gitignore = readFileSync('.gitignore', 'utf8');
const homeScreen = readFileSync('src/views/screens/HomeScreen.tsx', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');
const disallowedKeyPattern = /AIza[0-9A-Za-z_-]{20,}/;

const EXCLUDED_DIR_PREFIXES = ['.git/', 'node_modules/', '.expo/', 'android/build/', 'ios/build/', 'dist/', 'build/'];

type FileReader = (filePath: string) => string;

function normalizeProjectPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isExcludedFromSecretScan(filePath: string): boolean {
  const normalized = normalizeProjectPath(filePath);
  const basename = path.posix.basename(normalized);

  if (basename === '.env' || basename === '.env.local') {
    return true;
  }

  return EXCLUDED_DIR_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

function isLocalEnvVariant(filePath: string): boolean {
  const normalized = normalizeProjectPath(filePath);
  const basename = path.posix.basename(normalized);
  return basename.startsWith('.env.') && basename !== '.env.example';
}

function listTrackedLocalEnvVariants(trackedFiles: string[]): string[] {
  return trackedFiles.filter((filePath) => isLocalEnvVariant(filePath) || filePath === '.env' || filePath === '.env.local');
}

function listTrackedFiles(cwd: string): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
  return output
    .split('\0')
    .filter((entry: string) => entry.length > 0)
    .map((entry: string) => normalizeProjectPath(entry));
}

function findRealGoogleApiKeyMatches(filePaths: string[], readFile: FileReader): string[] {
  const matches: string[] = [];

  for (const filePath of filePaths) {
    if (isExcludedFromSecretScan(filePath)) {
      continue;
    }
    const content = readFile(filePath);
    if (disallowedKeyPattern.test(content)) {
      matches.push(filePath);
    }
  }

  return matches;
}

function readUtf8FileOrEmpty(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function localEnvFileContainsRealKey(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  const content = readUtf8FileOrEmpty(filePath);
  return disallowedKeyPattern.test(content);
}

function isTrackedByGit(filePath: string): boolean {
  try {
    const output = execFileSync('git', ['ls-files', '--error-unmatch', filePath], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function assertMapConfigSecretScanUnitCases(): void {
  const realKey = ['AIza', 'SyA123456789012345678901234567890'].join('');
  const placeholder = 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=your_android_maps_key_here';

  const scan = (files: Record<string, string>, tracked: string[]): string[] =>
    findRealGoogleApiKeyMatches(tracked, (filePath) => files[filePath] ?? '');

  assert.deepEqual(
    scan(
      {
        '.env': `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=${realKey}`,
        '.env.production': `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=${realKey}`,
        '.env.example': placeholder,
      },
      ['.env.example'],
    ),
    [],
    'Real key in untracked local .env files must not fail tracked-file scan',
  );

  assert.deepEqual(
    scan(
      {
        '.env.example': `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=${realKey}`,
      },
      ['.env.example'],
    ),
    ['.env.example'],
    'Real key in .env.example must fail',
  );

  assert.deepEqual(
    scan(
      {
        'app.config.js': `module.exports={android:{config:{googleMaps:{apiKey:"${realKey}"}}}};`,
      },
      ['app.config.js'],
    ),
    ['app.config.js'],
    'Real key in app.config.js must fail',
  );

  assert.deepEqual(
    scan(
      {
        'src/services/MapConfigService.ts': `export const K="${realKey}";`,
      },
      ['src/services/MapConfigService.ts'],
    ),
    ['src/services/MapConfigService.ts'],
    'Real key in src file must fail',
  );

  assert.deepEqual(
    scan(
      {
        '.env.example': placeholder,
      },
      ['.env.example'],
    ),
    [],
    'Placeholder key in .env.example must pass',
  );

  assert.deepEqual(
    scan(
      {
        '.env.production': `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=${realKey}`,
      },
      ['.env.production'],
    ),
    ['.env.production'],
    'Real key in tracked .env.* file must fail',
  );

  assert.equal(isExcludedFromSecretScan('.env'), true, '.env must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('.env.local'), true, '.env.local must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('.env.production'), false, 'Tracked .env.* files must be scanned');
  assert.equal(isExcludedFromSecretScan('.env.example'), false, '.env.example must be included in scan');
  assert.equal(isExcludedFromSecretScan('node_modules/a.js'), true, 'node_modules must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('.expo/state.json'), true, '.expo must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('android/build/out.txt'), true, 'android/build must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('ios/build/out.txt'), true, 'ios/build must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('dist/app.js'), true, 'dist must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('build/app.js'), true, 'build must be excluded from scan');
  assert.equal(isExcludedFromSecretScan('.git/config'), true, '.git must be excluded from scan');
}

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
  Array.isArray(appJson.expo?.android?.permissions) &&
    appJson.expo?.android?.permissions?.includes('INTERNET') &&
    appJson.expo?.android?.permissions?.includes('ACCESS_NETWORK_STATE'),
  'app.json android.permissions must include INTERNET and ACCESS_NETWORK_STATE',
);

assert(
  envExample.includes('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=your_android_maps_key_here') &&
    envExample.includes('EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY=your_ios_maps_key_here'),
  '.env.example must contain placeholder values only',
);
assert(!disallowedKeyPattern.test(envExample), '.env.example must not contain a real Google API key');

assert(gitignore.includes('.env'), '.gitignore must ignore .env');
assert(gitignore.includes('.env.local'), '.gitignore must ignore .env.local');
assert(gitignore.includes('!.env.example'), '.gitignore must keep .env.example committed');

const trackedFiles = listTrackedFiles(process.cwd());
const trackedLocalEnvVariants = listTrackedLocalEnvVariants(trackedFiles);
assert.equal(
  trackedLocalEnvVariants.length,
  0,
  `Tracked local env files are not allowed: ${trackedLocalEnvVariants.join(', ')}`,
);
const committedKeyMatches = findRealGoogleApiKeyMatches(trackedFiles, (filePath) => readUtf8FileOrEmpty(filePath));
assert.equal(
  committedKeyMatches.length,
  0,
  `Real Google API key pattern found in committed files: ${committedKeyMatches.join(', ')}`,
);

const localEnvCandidates = ['.env', '.env.local', ...readdirSync('.').filter((entry) => isLocalEnvVariant(entry))];
const localEnvWithKey = Array.from(new Set(localEnvCandidates)).find((filePath) => localEnvFileContainsRealKey(filePath));
if (localEnvWithKey) {
  console.log('Local .env contains a private key; this is allowed because .env is gitignored. Never commit it.');
}

assert.equal(isTrackedByGit('.env'), false, '.env must not be tracked by git');
assert.equal(isTrackedByGit('.env.local'), false, '.env.local must not be tracked by git');

assertMapConfigSecretScanUnitCases();

console.log('Map config checks passed.');
