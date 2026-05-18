import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const statusService = readFileSync('src/services/OfflineMapStatusService.ts', 'utf8');
const vm = readFileSync('src/viewmodels/DownloadMapViewModel.ts', 'utf8');
const screen = readFileSync('src/views/screens/DownloadMapScreen.tsx', 'utf8');
const splash = readFileSync('src/views/screens/SplashScreen.tsx', 'utf8');

const statuses = ['not_downloaded', 'downloading', 'downloaded', 'corrupt', 'needs_update'];
for (const status of statuses) {
  assert(statusService.includes(`'${status}'`) || vm.includes(`'${status}'`) || splash.includes(`'${status}'`), `Missing map status: ${status}`);
}

assert(statusService.includes('tileCountExpected'), 'Manifest must include tileCountExpected');
assert(statusService.includes('tileCountSaved'), 'Manifest must include tileCountSaved');
assert(statusService.includes('completedAt'), 'Manifest must include completedAt');
assert(statusService.includes('zoomLevels'), 'Manifest must include zoomLevels');
assert(statusService.includes('bounds'), 'Manifest must include bounds');
assert(statusService.includes('markDownloaded'), 'Status service must support downloaded manifest writes');

assert(vm.includes('await OfflineMapStatusService.markDownloaded'), 'Download completion must await manifest save');
assert(vm.includes('await OfflineMapStatusService.setDownloadedFlag(true)'), 'Download completion must await downloaded flag save');
assert(vm.includes('await OfflineMapStatusService.validateAtStartup()'), 'Download completion must verify manifest before navigation');
assert(vm.includes('completion already processed - idempotent skip'), 'Completion flow should be idempotent');

assert(screen.includes('Continue to Map'), 'Fallback continue button must be present');
assert(screen.includes('Repair Download'), 'Corrupt manifest repair UI must be present');

assert(splash.includes("setDownloadState({ phase: 'idle' })"), 'Splash should clear stale in-memory downloading state');
assert(statusService.includes('Stale downloading state cleared'), 'Startup validation must clear stale downloading manifest state');

console.log('Offline download completion checks passed.');
