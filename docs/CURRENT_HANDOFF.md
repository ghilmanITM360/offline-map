# CURRENT HANDOFF — KARACHI IJTEMA

Updated: 2026-09-10T15:45:00+05:00

## Repository

Path: `/Users/ghilmanislam360/GhilmanProjects/offline-map-core-fix`
Remote: `https://github.com/ghilmanITM360/offline-map.git` (`ghilmanITM360/offline-map`)
Worktree: `offline-map-core-fix` at the path above.
Branch: `fix/core-functionality-finalization`
HEAD: `974d2070738f79a41794a42929f710289f7e122e` at session start; Phase 0D-A changes below are UNCOMMITTED working-tree edits on top of it (no commit made — CLAUDE.md commit policy requires explicit request).
Upstream: `origin/fix/core-functionality-finalization` (working tree is ahead of upstream by these uncommitted edits only).
Dirty: yes — 5 files modified, see Changed Files below. `git status --short --branch` confirms.
PR: [#26](https://github.com/ghilmanITM360/offline-map/pull/26), OPEN/DRAFT, targeting `integration/ux-simplification-final`. Not touched this session.

## Current Objective

Phase 0D-A: Map camera layout-readiness race (`Map size can't be 0`). **CODE-LEVEL AND RUNTIME VERIFIED complete** this session. Phase 0E-B (Case 4/5 cold-offline and mid-navigation network loss) is next but explicitly out of scope for this task — do not start it without a fresh instruction.

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
OWNER/EXTERNAL (pre-existing, unrelated, still open): Google Maps basemap intermittently unavailable in this environment ("Base map unavailable. Offline venue map still works." / GRAPH_ONLY fallback) — consistent with the previously-documented Maps API billing issue (ROTATION UNKNOWN — OWNER ACTION REQUIRED). Not touched; out of scope for Phase 0D-A.
FIELD-BLOCKED / other PR #26 items: unchanged, not re-checked this session.

## Remaining

1. Commit/push this Phase 0D-A fix once the owner reviews and explicitly authorizes (not done automatically per `CLAUDE.md` commit policy).
2. Phase 0E-B (Case 4/5 cold-offline and mid-navigation network loss) is next, on request only.

## Exact Next Action

Owner reviews the uncommitted Phase 0D-A diff (`git diff` on the 5 files above) and either authorizes a commit/push, or requests changes.

## Git / PR

Commit status: NOT committed — working tree only, 5 files modified, nothing staged.
Push status: not pushed; upstream unchanged.
PR status: #26 untouched (OPEN/DRAFT). Not merged, retargeted, closed, or auto-merge-enabled.

## Verdict

Phase 0D-A camera-readiness race: root cause identified from source (react-native-maps Android internals), minimal fix implemented in `useCameraManager.ts` only, RED→GREEN regression suite added, full test suite green, typecheck/lint clean, and RUNTIME VERIFIED clean across all requested scenarios on a real emulator build from this working tree. Awaiting owner review before commit/push.
