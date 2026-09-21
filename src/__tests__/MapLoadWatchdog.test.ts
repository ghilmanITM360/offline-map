/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Issue #28: the old watchdog was a single one-way boolean latch (mapLoadFailed) set by a
// bare 7s setTimeout — once latched, a Google map that loaded successfully at 8s or 12s
// (common on slow/software-rendered devices) had no way back to GOOGLE_BASEMAP while the
// device stayed online. This is the pure state machine that replaces the latch: it tracks
// which load attempt ("generation") is current so a late success can recover, while a truly
// stale event (from an attempt that's no longer current) is ignored instead of resurrecting
// old state.
import {
  applyMapLoaded,
  applyWatchdogTimeout,
  beginMapLoadAttempt,
  createInactiveWatchdogState,
} from '../services/MapLoadWatchdog';

describe('MapLoadWatchdog', () => {
  // MAPLOAD-01: fast successful load
  test('onMapLoaded before timeout moves GOOGLE_STARTING to GOOGLE_READY', () => {
    const starting = beginMapLoadAttempt(1);
    const next = applyMapLoaded(starting, 1);
    expect(next.state).toBe('GOOGLE_READY');
  });

  // MAPLOAD-02: slow load but before timeout — success wins, and a defensive late timeout
  // for the same generation (e.g. clearTimeout racing the event loop) must not undo it.
  test('a timeout for the same generation after success is a no-op', () => {
    const ready = applyMapLoaded(beginMapLoadAttempt(1), 1);
    const next = applyWatchdogTimeout(ready, 1);
    expect(next.state).toBe('GOOGLE_READY');
  });

  // MAPLOAD-03: no load before timeout
  test('timeout before any load moves GOOGLE_STARTING to OFFLINE_FALLBACK', () => {
    const starting = beginMapLoadAttempt(1);
    const next = applyWatchdogTimeout(starting, 1);
    expect(next.state).toBe('OFFLINE_FALLBACK');
  });

  // MAPLOAD-04: late success after fallback — this is the actual #28 fix. Same generation,
  // so the late success is trusted and recovers the basemap instead of being discarded.
  test('a same-generation late success after fallback recovers to GOOGLE_RECOVERED', () => {
    const fallenBack = applyWatchdogTimeout(beginMapLoadAttempt(1), 1);
    const next = applyMapLoaded(fallenBack, 1);
    expect(next.state).toBe('GOOGLE_RECOVERED');
  });

  // MAPLOAD-05: stale late callback — generation 1 times out, generation 2 starts, then
  // generation 1's onMapLoaded finally arrives. It must not touch generation 2's state.
  test('a stale-generation success is ignored', () => {
    const gen1FallenBack = applyWatchdogTimeout(beginMapLoadAttempt(1), 1);
    expect(gen1FallenBack.state).toBe('OFFLINE_FALLBACK');
    const gen2Starting = beginMapLoadAttempt(2);
    const next = applyMapLoaded(gen2Starting, 1);
    expect(next).toEqual(gen2Starting);
  });

  // MAPLOAD-06: stale timeout — generation 1's timer fires after generation 2 is active.
  test('a stale-generation timeout is ignored', () => {
    const gen2Starting = beginMapLoadAttempt(2);
    const next = applyWatchdogTimeout(gen2Starting, 1);
    expect(next).toEqual(gen2Starting);
  });

  // MAPLOAD-07: provider switch — once the watchdog is inactive (offline / no key, the
  // real "not using Google" state), a late Google callback must not pull it back in.
  test('onMapLoaded while INACTIVE is ignored', () => {
    const inactive = createInactiveWatchdogState(3);
    const next = applyMapLoaded(inactive, 3);
    expect(next).toEqual(inactive);
  });

  test('createInactiveWatchdogState and beginMapLoadAttempt carry the given generation', () => {
    expect(createInactiveWatchdogState(5)).toEqual({ state: 'INACTIVE', generation: 5 });
    expect(beginMapLoadAttempt(5)).toEqual({ state: 'GOOGLE_STARTING', generation: 5 });
  });

  test('applyMapLoaded on an already-resolved generation is a no-op', () => {
    const recovered = applyMapLoaded(applyWatchdogTimeout(beginMapLoadAttempt(1), 1), 1);
    expect(recovered.state).toBe('GOOGLE_RECOVERED');
    const next = applyMapLoaded(recovered, 1);
    expect(next).toEqual(recovered);
  });
});
