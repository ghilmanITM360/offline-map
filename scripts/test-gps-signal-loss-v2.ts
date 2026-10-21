import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import {
  deriveGpsSignalStateV2,
  GPS_LOST_TIMEOUT_MS,
} from '../src/services/V2NavigationRuntimeService';
import { NAVIGATION_WATCH_TIME_INTERVAL_MS } from '../src/constants/navigation';

// --- Pure state-derivation checks -------------------------------------------------------
// GPS_LOST is a plain timeout on top of the existing fix-handling: no fresh fix for
// GPS_LOST_TIMEOUT_MS -> GPS_LOST, regardless of what the earlier accuracy verdict was.

assert.equal(
  GPS_LOST_TIMEOUT_MS,
  NAVIGATION_WATCH_TIME_INTERVAL_MS * 8,
  'GPS_LOST timeout must be a clear, explicit multiple of the navigation-mode GPS watch interval, not an arbitrary guess',
);

const t0 = 1_000_000; // arbitrary fixed wall-clock reference so the test is deterministic

// A fix has never arrived this session -> lost immediately (this is correct: if navigation
// starts and no GPS fix ever comes in, "searching for signal" is the right thing to show).
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs: null, nowMs: t0 }),
  'GPS_LOST',
  'No fix ever received must resolve to GPS_LOST',
);

// A fix just arrived (elapsed 0ms) -> resolves purely on accuracy.
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs: t0, nowMs: t0 }),
  'GPS_GOOD',
  'A fresh, accurate fix must resolve to GPS_GOOD',
);
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: true, lastFixAtMs: t0, nowMs: t0 }),
  'GPS_WEAK',
  'A fresh, poor-accuracy fix must resolve to GPS_WEAK',
);

// Just under the timeout -> still not lost, whatever the accuracy verdict was.
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs: t0, nowMs: t0 + GPS_LOST_TIMEOUT_MS - 1 }),
  'GPS_GOOD',
  'A fix just under the loss timeout must not be treated as lost',
);
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: true, lastFixAtMs: t0, nowMs: t0 + GPS_LOST_TIMEOUT_MS - 1 }),
  'GPS_WEAK',
  'A weak fix just under the loss timeout must stay GPS_WEAK, not jump to GPS_LOST',
);

// At/over the timeout -> lost, regardless of the stale accuracy verdict.
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs: t0, nowMs: t0 + GPS_LOST_TIMEOUT_MS }),
  'GPS_LOST',
  'Reaching the loss timeout with no new fix must resolve to GPS_LOST',
);
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs: t0, nowMs: t0 + GPS_LOST_TIMEOUT_MS * 5 }),
  'GPS_LOST',
  'Staying silent well past the loss timeout must remain GPS_LOST',
);

// A custom timeout override is honored (used for deterministic testing elsewhere / tuning).
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs: t0, nowMs: t0 + 500, timeoutMs: 400 }),
  'GPS_LOST',
  'A custom timeoutMs override must be respected',
);

// --- Recovery timeline, driven end-to-end through the pure function --------------------
// Mirrors the real sequence: fixes stop arriving -> GPS_LOST after the timeout -> a fresh
// fix arrives -> immediate recovery to GPS_GOOD/GPS_WEAK (this is exactly what
// NavigationViewModelV2's location effect does: it recomputes gpsSignalState synchronously
// from the pure function the instant a new fix lands, using that fix's own timestamp as both
// lastFixAtMs and nowMs, so elapsed is always 0 and it can never itself resolve to GPS_LOST).
let lastFixAtMs: number | null = t0;
let now = t0;
assert.equal(deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs, nowMs: now }), 'GPS_GOOD');

now += GPS_LOST_TIMEOUT_MS; // fixes silently stop arriving for the full timeout
assert.equal(deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs, nowMs: now }), 'GPS_LOST');

// A fresh fix lands — recompute exactly as the view model does (lastFixAtMs = nowMs = the new
// fix's own timestamp).
now += 3000;
lastFixAtMs = now;
assert.equal(
  deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs, nowMs: now }),
  'GPS_GOOD',
  'A fresh fix after GPS_LOST must recover to GPS_GOOD immediately',
);

console.log('GPS signal-loss pure-derivation checks passed.');

// --- Wiring checks -----------------------------------------------------------------------
// The pure function above only proves the timeout math; these confirm it's actually wired
// into NavigationViewModelV2/NavigationChromeV2 the way CLAUDE.md's v2-navigation
// architecture expects (banner mechanism reused, no new UI surface, no reroute/arrival
// coupling), following the same source-string-assertion convention as
// scripts/test-navigation-buttons-v2.ts and scripts/test-navigation-ui.ts.

const navigationViewModelSource = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const navigationChromeSource = readFileSync('src/views/components/navigation/NavigationChromeV2.tsx', 'utf8');
const runtimeServiceSource = readFileSync('src/services/V2NavigationRuntimeService.ts', 'utf8');
const gpsManagerSource = readFileSync('src/services/GPSManagerService.ts', 'utf8');
const constantsSource = readFileSync('src/constants/navigation.ts', 'utf8');

assert(
  constantsSource.includes('export const NAVIGATION_WATCH_TIME_INTERVAL_MS'),
  'constants/navigation.ts must export the navigation-mode watch interval so GPS_LOST_TIMEOUT_MS can be defined as an explicit multiple of it',
);
assert(
  gpsManagerSource.includes('NAVIGATION_WATCH_TIME_INTERVAL_MS') && gpsManagerSource.includes('timeInterval: NAVIGATION_WATCH_TIME_INTERVAL_MS'),
  'GPSManagerService must actually configure its navigation-mode watch using the shared constant (not a second, drifting magic number)',
);
assert(
  runtimeServiceSource.includes("export type GpsSignalStateV2 = 'GPS_GOOD' | 'GPS_WEAK' | 'GPS_LOST'"),
  'V2NavigationRuntimeService must expose the three-state GPS signal model',
);
assert(
  runtimeServiceSource.includes('export function deriveGpsSignalStateV2('),
  'V2NavigationRuntimeService must expose a pure GPS-signal-state derivation function',
);

assert(
  navigationViewModelSource.includes("useState<GpsSignalStateV2>('GPS_GOOD')"),
  'Navigation v2 view model must own gpsSignalState, defaulting to GPS_GOOD',
);
assert(
  navigationViewModelSource.includes('lastFixAtRef.current = fixAtMs;'),
  'Navigation v2 view model must record the wall-clock time of each accepted fix',
);
assert(
  navigationViewModelSource.includes('setInterval(') && navigationViewModelSource.includes('deriveGpsSignalStateV2({'),
  'Navigation v2 view model must poll for GPS loss independently of incoming fixes',
);
assert(
  navigationViewModelSource.includes('gpsSignalState,'),
  'Navigation v2 view model must return gpsSignalState to its consumers',
);

// Critical constraint: GPS_LOST must be purely a display-state concern. attemptReroute and
// isArrived must stay completely unaware of it.
const attemptRerouteStart = navigationViewModelSource.indexOf('const attemptReroute = useCallback');
const attemptRerouteEnd = navigationViewModelSource.indexOf('\n\n', attemptRerouteStart);
assert(attemptRerouteStart >= 0 && attemptRerouteEnd > attemptRerouteStart, 'attemptReroute definition must be found');
const attemptRerouteBody = navigationViewModelSource.slice(attemptRerouteStart, attemptRerouteEnd);
assert(
  !attemptRerouteBody.includes('gpsSignalState') && !attemptRerouteBody.includes('GPS_LOST'),
  'attemptReroute must stay completely unaware of GPS_LOST — GPS loss must never itself trigger a reroute',
);

const isArrivedStart = navigationViewModelSource.indexOf('function isArrived(');
const isArrivedEnd = navigationViewModelSource.indexOf('\n}', isArrivedStart);
assert(isArrivedStart >= 0 && isArrivedEnd > isArrivedStart, 'isArrived definition must be found');
const isArrivedBody = navigationViewModelSource.slice(isArrivedStart, isArrivedEnd);
assert(
  !isArrivedBody.includes('gpsSignalState') && !isArrivedBody.includes('GPS_LOST'),
  'isArrived must stay completely unaware of GPS_LOST — arrival detection must be unaffected by signal-loss display state',
);

// The GPS_LOST banner reuses the weak-GPS GpsSignalBanner component (B4c-5) rather than
// building a new UI surface, and the pre-existing weak-GPS branch is left in place.
assert(
  navigationChromeSource.includes("gpsSignalState === 'GPS_LOST'") &&
    navigationChromeSource.includes("t('navigation.lost')"),
  'NavigationChromeV2 must show a plain "can\'t find you" message when gpsSignalState is GPS_LOST',
);
const gpsLostBannerStart = navigationChromeSource.indexOf("gpsSignalState === 'GPS_LOST'");
const gpsLostBannerSnippet = navigationChromeSource.slice(gpsLostBannerStart, gpsLostBannerStart + 350);
assert(
  gpsLostBannerSnippet.includes('<GpsSignalBanner status="lost"') && gpsLostBannerSnippet.includes('<GpsSignalBanner status="weak"'),
  'The GPS_LOST banner must reuse the weak-GPS GpsSignalBanner component rather than introducing a new UI surface',
);
// #66: GPS_LOST and weak-GPS must never stack as two banners — they share one priority
// slot (GPS_LOST first), so the weak-GPS branch is now part of that ternary, not an
// independent `&&` block. Its text/styles are otherwise unchanged (asserted above).
assert(
  navigationChromeSource.includes(') : isWeakGps ? (') &&
    navigationChromeSource.includes("t('navigation.weak')"),
  'The pre-existing weak-GPS banner content must remain, as the next branch of the GPS_LOST priority ternary',
);

console.log('GPS signal-loss wiring checks passed.');
