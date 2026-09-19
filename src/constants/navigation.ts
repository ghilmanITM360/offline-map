/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Shared between v1 (NavigationViewModel) and v2 (NavigationViewModelV2) — a plain
// numeric constant, not a v1/v2 data or routing module, so it doesn't violate the
// v1/v2 isolation boundary enforced by test:v1-v2-isolation.
export const ARRIVAL_THRESHOLD_METERS = 20;

// Minimum ms between fixes requested from watchPositionAsync while GPSManagerService is in
// 'navigation' mode (a listener is registered with this mode for the whole time
// NavigationViewModelV2 is driving live navigation — see its
// GPSManagerService.addListener(handleLiveLocation, 'navigation') effect). Lives in this
// plain-constants file (not GPSManagerService.ts, which imports react-native) so it can be
// imported by GPS-loss-detection logic in V2NavigationRuntimeService.ts — and by the
// standalone scripts/test-*.ts suite, which runs under plain node/tsx and cannot import
// react-native — without pulling in native modules. GPS_LOST_TIMEOUT_MS (see
// V2NavigationRuntimeService.ts) is defined as an explicit multiple of this rather than an
// unrelated magic number.
export const NAVIGATION_WATCH_TIME_INTERVAL_MS = 1000;

// v1-only. Matches the v1 `IJTEMA_DATA` node-ID scheme (T*/S*/P*/C*) used by RoutingService
// and SnapToRoadService to restrict an outside-venue coordinate to boundary/terminal nodes —
// v2 has no equivalent node-ID scheme, so this constant has no v2 counterpart and must not be
// imported from any v2-only module (would fail test:v1-v2-isolation).
export const OUTSIDE_VENUE_BOUNDARY_NODE_IDS_V1 = /^(T1|T2|S6|S12|S13|S14|S15|S16|S17)$/;

// NAV-P0-001: how far a fix's OWN observation timestamp (Coordinate.observedAtMs, set by
// GPSManagerService from Expo's LocationObject.timestamp) may sit before a navigation
// "watcher generation" boundary (trip start, or a foreground resume) and still count as
// belonging to that generation. Android/Play Services commonly delivers a cached "last known
// location" as the very first update after (re)subscribing to location updates — that fix's
// timestamp predates the boundary by seconds to minutes and must be rejected for navigation
// progress. 2s is generous enough to absorb ordinary provider/processing relay lag right at
// the boundary instant (not an arbitrary large grace window that would let real stale fixes
// back in).
export const STALE_FIX_CLOCK_TOLERANCE_MS = 2000;
