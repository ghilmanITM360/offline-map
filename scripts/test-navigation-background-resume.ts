import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

import { deriveGpsSignalStateV2, GPS_LOST_TIMEOUT_MS } from '../src/services/V2NavigationRuntimeService';

// Production stabilization pass — P1 fix. Scenario: user starts navigation, locks the
// phone, walks for several minutes, unlocks. GPSManagerService already tears down and
// restarts its watchPositionAsync subscription on its own AppState listener (verified by
// test-battery-v2.ts / test-stability-v2.ts), so the subscription itself isn't the gap.
// The gap was: on resume, the UI kept showing route progress/ETA computed from the
// pre-lock position until watchPositionAsync's next natural callback arrived — which can
// take a while after a cold GPS reacquire. The fix forces an immediate fresh fix
// (GPSManagerService.forceFix) and marks GPS_LOST immediately (skipping the 8s poll wait)
// when the last fix is already known-stale, instead of waiting on either.

// --- Behavioral: simulate the exact "locked for several minutes, then resumed" timeline ---
{
  const lastFixBeforeLockMs = 5_000; // last real fix arrived 5s into the walk
  const lockDurationMs = 6 * 60_000; // phone locked for 6 minutes
  const resumeMs = lastFixBeforeLockMs + lockDurationMs;

  // While locked, nothing updates lastFixAtMs — by the time the user unlocks, the gap
  // since the last fix vastly exceeds the normal in-foreground GPS_LOST timeout.
  const stateOnResumeBeforeFix = deriveGpsSignalStateV2({
    isWeakGps: false,
    lastFixAtMs: lastFixBeforeLockMs,
    nowMs: resumeMs,
  });
  assert.equal(
    stateOnResumeBeforeFix,
    'GPS_LOST',
    'A multi-minute background gap must be detected as GPS_LOST on resume — this is exactly the case the resume handler must react to immediately rather than waiting out the normal 8s poll.',
  );

  // After the resume handler's forced fix lands, state must immediately reflect the fresh fix.
  const freshFixMs = resumeMs + 300; // a forced getCurrentPositionAsync() resolving shortly after resume
  const stateAfterForcedFix = deriveGpsSignalStateV2({
    isWeakGps: false,
    lastFixAtMs: freshFixMs,
    nowMs: freshFixMs,
  });
  assert.equal(stateAfterForcedFix, 'GPS_GOOD', 'Once the forced post-resume fix lands, GPS state must recover to GOOD immediately, not sit on GPS_LOST until the next ambient watch callback.');
}

// --- Behavioral: a brief background blip (e.g. a quick notification-shade pull) must NOT
// spuriously flip to GPS_LOST — only genuinely stale gaps should ------------------------
{
  const lastFixMs = 10_000;
  const briefBlipResumeMs = lastFixMs + 1_500; // well under GPS_LOST_TIMEOUT_MS
  const state = deriveGpsSignalStateV2({ isWeakGps: false, lastFixAtMs: lastFixMs, nowMs: briefBlipResumeMs });
  assert.equal(state, 'GPS_GOOD', 'A brief foreground/background blip under the GPS_LOST timeout must not be treated as a stale resume.');
}

assert(GPS_LOST_TIMEOUT_MS > 0, 'GPS_LOST_TIMEOUT_MS must be a positive, well-defined threshold shared by both the ambient poll and the resume check.');

// --- Wiring: the resume handler actually exists and uses the right primitives ---
const navigationViewModelV2 = readFileSync('src/viewmodels/NavigationViewModelV2.ts', 'utf8');
const gpsManagerService = readFileSync('src/services/GPSManagerService.ts', 'utf8');

assert(
  gpsManagerService.includes('async forceFix(): Promise<Coordinate | null>'),
  'GPSManagerService must expose a forceFix() method for an immediate one-shot fix, bypassing watchPositionAsync\'s natural cadence.',
);
assert(
  gpsManagerService.includes('Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })'),
  'forceFix must request a fresh, high-accuracy fix rather than reusing a cached/last-known one.',
);
assert(
  gpsManagerService.includes('private publishFix('),
  'GPSManagerService must publish forceFix() results through the same store-updater/listener path as the ambient watch subscription, not duplicate that logic.',
);

assert(
  navigationViewModelV2.includes("AppState.addEventListener('change'"),
  'NavigationViewModelV2 must listen for app foreground/background transitions during active navigation.',
);
assert(
  /if \(!route\) return;\s*\n\s*const subscription = AppState\.addEventListener\('change', \(nextState: AppStateStatus\) => \{\s*\n\s*if \(nextState !== 'active'\) return;/.test(navigationViewModelV2),
  'The resume listener must be scoped to active navigation only (gated on `route`) and react specifically to the transition into \'active\'.',
);
assert(
  navigationViewModelV2.includes('lastFixAtRef.current == null || Date.now() - lastFixAtRef.current >= GPS_LOST_TIMEOUT_MS'),
  'On resume, staleness must be checked against the same GPS_LOST_TIMEOUT_MS threshold the ambient poll uses — no separate, undocumented threshold.',
);
assert(
  navigationViewModelV2.includes('void GPSManagerService.forceFix();'),
  'On resume, NavigationViewModelV2 must trigger an immediate fresh fix rather than waiting for the ambient watch subscription\'s next callback.',
);

console.log('Navigation background-resume checks passed.');
