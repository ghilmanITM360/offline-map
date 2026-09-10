# CURRENT HANDOFF — KARACHI IJTEMA

Updated: 2026-09-10T15:45:00+05:00

## Repository

Path: `/Users/ghilmanislam360/GhilmanProjects/offline-map-core-fix`
Remote: `https://github.com/ghilmanITM360/offline-map.git` (`ghilmanITM360/offline-map`)
Worktree: `offline-map-core-fix` at the path above.
Branch: `fix/core-functionality-finalization`
Phase 0D-A implementation commit: `e57d0ab18c0734e57602553c2b9ed05f8b9ccbb9` (`fix: gate dimension-dependent camera commands on layout readiness`), pushed to `origin/fix/core-functionality-finalization`. This identifies the commit that landed the changes below — not a claim about current repository HEAD, which will move as this branch continues.
Upstream: `origin/fix/core-functionality-finalization` — up to date, no divergence.
Dirty: no — working tree was clean after the Phase 0D-A push.
PR: [#26](https://github.com/ghilmanITM360/offline-map/pull/26), OPEN/DRAFT, targeting `integration/ux-simplification-final`. Not touched this session.

## Current Objective

Phase 0D-A: Map camera layout-readiness race (`Map size can't be 0`). **CODE-LEVEL AND RUNTIME VERIFIED complete, committed, and pushed** (`e57d0ab18c0734e57602553c2b9ed05f8b9ccbb9`). Phase 0E-B (Case 4/5 cold-offline and mid-navigation network loss) is the next planned task but has not started — pending a fresh task instruction.

## Root Cause (CODE-LEVEL VERIFIED)

`useCameraManager.ts` called `mapRef.current.animateToRegion`/`fitToCoordinates` (via `animateToUser`, `animateToPlace`, `fitVenueBounds`, `fitRoute`) unconditionally — no readiness gate existed anywhere, and `HomeScreen`'s `<MapView>` had no `onLayout` at all, so layout dimensions were never tracked. Confirmed against `node_modules/react-native-maps/android/.../MapView.java`: `animateToRegion`/`fitToCoordinates` call `CameraUpdateFactory.newLatLngBounds(...)` with no `getHeight()<=0||getWidth()<=0` guard, unlike the prop-driven `moveToRegion`/`moveToCamera`/`applyBaseMapPadding` paths in the same file, whose own comments state calling with a 0-size view "would trigger an exception." `animateCamera`-based calls (`enterNavigationCamera`, `resetCompass`, `rotateToHeading`, `nudgeZoom`) don't hit `newLatLngBounds` and were left ungated.

## Fix

Added a readiness gate inside `useCameraManager.ts` (sole camera-policy owner, unchanged): `nativeMapReadyRef`/`layoutSizeRef` (local refs, so remount starts genuinely unready) plus `notifyNativeMapReady()`/`notifyMapLayout(w,h)` setters and a `runWhenReady(intent)` helper. The four dimension-dependent methods (`animateToUser`, `animateToPlace`, `fitVenueBounds`, `fitRoute`) now run their native call + `setCameraMode` through `runWhenReady`: executes immediately if `nativeMapReady && width>0 && height>0`, otherwise stores the closure as the single pending intent (latest wins, superseding any earlier one), flushed exactly once when both signals become true. `HomeScreen.tsx`'s `<MapView>` now has an `onLayout` forwarding to `cameraManager.notifyMapLayout`, and `onMapReady` also calls `cameraManager.notifyNativeMapReady()`.

## Changed Files

- `src/viewmodels/useCameraManager.ts` — readiness gate + `notifyNativeMapReady`/`notifyMapLayout` exports.
- `src/views/screens/HomeScreen.tsx` — wired `onLayout` and `onMapReady` to the two new notify calls.
- `src/__tests__/CameraManager.test.tsx` — added 8 new readiness-gate regression tests (RED-verified before the fix, GREEN after); updated 6 pre-existing dimension-dependent tests to call the new notify functions first (default is now "not ready").
- `src/__tests__/HomeScreenColdLaunchCamera.test.tsx`, `src/__tests__/HomeScreen.test.tsx` — added `notifyNativeMapReady`/`notifyMapLayout` jest.fn() stubs to the mocked `cameraManager` shape (both mock the full `useHomeViewModel`, so no behavior change, just shape parity).

## Tests

TEST VERIFIED at this uncommitted working tree:
- `npx jest src/__tests__/CameraManager.test.tsx` — 15/15 PASS (was 14/15 FAIL pre-fix, confirming RED→GREEN).
- `npx jest` (full suite) — 55/55 suites, 618/618 tests PASS.
- `npx tsc --noEmit` — clean.
- `npx eslint` on all 5 changed files — clean.

Required regression cases covered (all in `CameraManager.test.tsx`, `describe('useCameraManager camera-readiness gate (Phase 0D-A)')`): onMapReady-before-layout, layout-before-onMapReady, zero-size layout doesn't release, zero→positive releases exactly once, latest-pending-intent-wins, already-ready executes immediately, no duplicate execution on repeated notifications, remount doesn't reuse stale readiness.

## Runtime

RUNTIME VERIFIED this session on Android emulator `Pixel_7_Pro_API_36` (API 36, arm64), debug build from this exact working tree (`gradlew :app:assembleDebug` + Metro dev server, fresh JS bundle confirmed loaded via `[Home][Render]` logs showing `mapReady: true`), package `com.aicrafted.karachiijtema`.

Scenarios exercised with full-session `logcat` swept for `FATAL EXCEPTION`/`Map size`/`newLatLngBounds` after each — **zero matches, zero fatal crashes**:
- 4 cold launches (force-stop + relaunch), including one under airplane mode (offline sanity) — all clean, `mapReady: true` logged each time.
- Initial venue framing (`fitVenueBounds`) — camera fit the venue boundary correctly, including while the app was in its pre-existing `GRAPH_ONLY` basemap-unavailable fallback (reported basemap-unavailable issue — out of scope, unrelated, still open per below).
- Locations → Block → Get Directions → Route Preview ("Route Ready", `fitRoute`) → Cancel Route (back) — multiple cycles.
- Place-marker selection (`animateToPlace`) via facility marker tap.
- Recenter, and pan → recenter.
- Preview sheet open → Home (background) → resume — state and map preserved, no crash.
- Brief offline sanity (airplane mode cold launch) — app loaded and rendered normally offline.

Not separately re-verified this session (unaffected by this change, already known-clean from prior evidence): full Case 4/5 release-like cold-offline and mid-navigation-loss journeys (explicitly out of scope, Phase 0E-B).

## Open Defects / Blockers

P1 (this task): **RESOLVED, CODE-LEVEL AND RUNTIME VERIFIED.** No reproduced `Map size can't be 0` in any exercised scenario.
OWNER/EXTERNAL (pre-existing, unrelated, still open): Google Maps basemap intermittently unavailable in this environment ("Base map unavailable. Offline venue map still works." / GRAPH_ONLY fallback). This is a reported basemap-unavailable issue only — a Maps API billing cause has been suggested previously but is NOT verified as root cause (OWNER ACTION REQUIRED to investigate/confirm). Not touched; out of scope for Phase 0D-A.
FIELD-BLOCKED / other PR #26 items: unchanged, not re-checked this session.

## Remaining

1. Phase 0D-A is committed and pushed (`e57d0ab18c0734e57602553c2b9ed05f8b9ccbb9`) — no further action needed.
2. Phase 0E-B (Case 4/5 cold-offline and mid-navigation network loss) is next, pending a fresh task instruction. Not started.

## Phase 0E-B (Case 5 / Case 4 runtime closure) — attempted, BLOCKED

Updated: 2026-09-10T17:50:00+05:00

### Build provenance
Release-like (debug-signed, non-distributable) APK: `cd android && ./gradlew assembleRelease -PallowInsecureReleaseSigning=true --console=plain`, BUILD SUCCESSFUL, from source commit `e35c395a5626a7e190db68c73b849009e41249ee` (current HEAD, unchanged). Installed as `com.aicrafted.karachiijtema` on emulator `Pixel_7_Pro_API_36` (`emulator-5554`). Metro confirmed not running throughout.

### Case 5 — PARTIAL, then BLOCKED (ENVIRONMENT-BLOCKED)
RUNTIME VERIFIED clean through: cold offline launch (airplane-mode-equivalent, no Metro, no crash), permission flow, offline Home map, offline Locations Directory (42 blocks) + search, Block 28 selection, automatic B2-fallback origin resolution, offline Route Preview (correct "15 min | 1.2 km", correct fallback disclosure text).

Blocked at **Start Navigation**: the button (verified via `uiautomator` bounds, confirmed clickable, not disabled, correctly rendered) stopped responding to taps across many repeated attempts, coordinate variations, hold-duration variations, and a full app relaunch — while sibling controls on the same screen (header back button, Cancel-route confirmation dialog) remained tappable. Investigated via code reading (`LocationSheet.tsx`, `HomeScreen.tsx` `activePreviewRoute`/`isV2PreviewRoute` gating, `Button.tsx`) and a disposable isolated script re-verifying `V2DirectionsService.calculatePreview()` for this exact B2→Block28 scenario — the route object and `isV2PreviewRoute` type-guard both check out correct; no app-logic defect found. A full `adb reboot` of the emulator was then attempted to rule out session/environment drift, but **Android's own SystemUI process itself began ANR'ing post-reboot** ("System UI isn't responding"), independent of our app. Host diagnostics at that point: ~65MB free host memory (`vm_stat`), load average ~11 (`uptime`) — severe host resource exhaustion. This is the most likely root cause of the tap/touch anomalies (RNGH/BottomSheetScrollView touch arbitration starved of timely main-thread response), not an application defect. No production code was changed.

An earlier sub-session (same overall task, pre-compaction) had reached Active Navigation successfully with this exact flow and fed real route-derived GPS fixes via `adb emu geo fix`, surfacing a separate, still-open, unexplained anomaly: an apparent premature "Arrive / 0 min / 0 m" state after only ~15-27% route progress. Isolated reproduction of the exact same production functions (`RerouteService.projectProgressMetersOnRoute`, `calculateNavigationProgressV2`, `evaluateArrivalFixV2`) with the same real inputs produced correct non-arrival results in every case — this discrepancy is **not yet root-caused** and was not re-reachable this session due to the environment blocker above.

**Verdict: BLOCKED** (environment-level; not a reproduced app defect). Cannot mark PASS (Arrival/Done/cleanup never reached) or FAIL (no confirmed app-code defect).

### Case 4 — NOT VERIFIED
Not attempted — depends on first re-establishing Active Navigation, which Case 5's blocker prevented.

### Files changed this session
None (production code). Investigation only; all temporary scripts created at the repo root were deleted before completion (`git status --short` clean, verified above).

### Tests / checks run
None beyond the disposable isolated script noted above (not a committed test). No production code changed, so per task instructions the full suite was not rerun.

## Exact Next Action

Retry Phase 0E-B Case 5 (resume at "Start Navigation" on the B2→Block28 Route Preview screen) on a host with adequate free memory/CPU headroom — current host was at ~65MB free / load average ~11, which correlated with Android's own SystemUI ANR'ing independent of this app. If Start Navigation responds normally under healthy host conditions, proceed directly to the single-fix GPS bisection test to root-cause the still-open premature-arrival anomaly described above before declaring a Case 5 verdict. Case 4 remains entirely not started.

## Git / PR

Commit status: committed as `e57d0ab18c0734e57602553c2b9ed05f8b9ccbb9` (`fix: gate dimension-dependent camera commands on layout readiness`).
Push status: pushed to `origin/fix/core-functionality-finalization`; working tree clean after push.
PR status: #26 untouched (OPEN/DRAFT). Not merged, retargeted, closed, or auto-merge-enabled by this task.

## Verdict

Phase 0D-A camera-readiness race: root cause identified from source (react-native-maps Android internals), minimal fix implemented in `useCameraManager.ts` only, RED→GREEN regression suite added, full test suite green, typecheck/lint clean, and RUNTIME VERIFIED clean across all requested scenarios on a real emulator build from this working tree. Committed and pushed as `e57d0ab18c0734e57602553c2b9ed05f8b9ccbb9`. Phase 0E-B has not started; awaiting a fresh task instruction.
