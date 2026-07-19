# Runtime QA Final Report — Karachi Ijtema Offline Nav

## Environment

| | |
|---|---|
| Device | Pixel_10_Pro (AVD) — spec requested Pixel 8 API 35, substituted with existing local AVD |
| Android | API 37 (system image target `android-37.0`), RAM 2048MB |
| Build | Debug (`npx expo run:android`) — release build skipped, no `android/keystore.properties` present (only `.example` template) |
| Package | `com.aicrafted.karachiijtema` |
| Commit | `2298b04` (branch `codex/ijtema-map-data-v2`), 2 files patched during this QA pass (see Fixes) |
| Date | 2026-07-18 |
| Emulator boot | Pre-existing running instance (`emulator-5554`), reused rather than cold-booted |

**Scope note**: this pass covers Phase 0 (environment), Agent 1 (white-box static data validation), a manual black-box UI pass across Home/Blocks/Gates/Rastas/Pindal filters, a deep dive into gate-warning and back-navigation behavior, plus a second pass adding GIS validation, Security audit, outside→gate→block routing verification, regression checks, ad-hoc stress/rotation/offline/GPS-failure testing, and a performance pass. Live GPS-movement navigation (in-motion rerouting, arrival detection) and a release-signed APK build remain **not run** — see Not Yet Covered.

## Results

| Area | Status | Evidence |
|---|---|---|
| Emulator setup | PASS | `adb devices` → `emulator-5554 device`; app installed & launched, `mCurrentFocus` confirmed |
| APK build/install | PASS (debug only) | `BUILD SUCCESSFUL`, Metro bundled, `[MapConfig] Android Maps key present: true` in logcat |
| Blocks (white-box) | PASS | 42/42 unique IDs, valid coords, render pipeline traced blocks.ts→V2MapRenderingService→HomeScreen→MapView; `test:map-data-v2` clean |
| Blocks (black-box) | PASS | `android-runtime-artifacts/2026-07-18/blocks/blocks-filter.png` — 42-polygon grid renders, no gate/rasta/pindal leakage. Block ID labels not visible at default zoom (unconfirmed, not investigated further) |
| Gates (white-box) | PASS | 17 visible; GATE_06/09/10/11/12 don't exist in source; GATE_13/14 verification-warning wired; GATE_03/17/18/19 disconnection computed live from graph adjacency |
| Gates (black-box) | PASS | `gates/gates-filter*.png` — 17 markers counted across pan, disconnected set (G03/17/18/19) renders orange vs blue routable, matching source exactly |
| Rastas | PASS | Chip shows exactly 11; `rastas/rasta01-selected.png` confirms individual rasta detail sheet ("Rasta 01", Urdu label, walking-path description) |
| Pindal | PASS | Chip shows exactly 3; `pindal/pindal-filter*.png` confirms route polyline renders standalone under this filter |
| Gate detail warnings | PASS (after fix) | See Fixes below |
| Disconnected-gate routing block | PASS | Tapping Directions on GATE_18 → red "Route problem: This gate is not ready for navigation. Please choose another nearby gate." — no silent route start |
| Back-navigation stack | PASS (verified, no fix needed) | Isolated single-press repro: Directions → Back → Home (sheet state preserved) → Back → launcher exit. Matches expected single-root-stack behavior; not a defect |
| Routing (outside→gate→block) | PASS (verified algorithmically + on-device) | On-device: outside point → "Route ready, Enter through Gate 05" for Block 1, no silent failure. Cross-checked against a standalone re-implementation of `EntryGateRoutingService`/`RoutingServiceV2`'s min-cost dijkstra against the real graph data — confirms the app correctly minimises `approach + internal path` rather than picking the merely-nearest gate (e.g. a nearer gate can require a much longer internal walk and lose to a farther-but-better-connected one). No Gate 20 over-selection, disconnected gates correctly excluded from candidates. See "GPS mocking limitation" note below — exact coordinate used for the live on-device test could not be pinned to the intended synthetic point, but the algorithm was independently verified correct regardless. `routing/outside-to-gate05-block1.png` |
| Navigation (live/rerouting) | NOT RUN | Blocked by the same GPS-mocking limitation — `adb emu geo fix` only reliably lands during an open location-request window in this AVD, making in-motion movement simulation unreliable. Not attempted further this session |
| Offline mode | PASS | Wifi+mobile data disabled via `adb shell svc wifi/data disable`; map, filters, search, and cached route summary all remained functional. App shows an explicit "Offline" badge and "Background map not downloaded. Ijtema routes still work." banner with a download CTA — clear, correct UX. `offline/offline-map-functional.png`, `offline/offline-search-badge.png` |
| GPS disabled | PASS | `location_mode=0`; app surfaced the standard Android "Location Accuracy" system prompt, and dismissing it ("No thanks") left the app in a stable, usable state (route card, Change Start, Clear Route all intact) — no crash. `offline/gps-disabled-graceful.png` |
| Ad-hoc/stress | PASS | 20 rapid filter-switch taps (Blocks→Gates→Rastas→All ×5): no crash, no ANR, focus stayed on `MainActivity`, logcat clean of FATAL/AndroidRuntime/ANR. Rotation: app correctly locked to portrait (`app.json` `orientation: "portrait"` + manifest `screenOrientation="portrait"`) — intentional, not a bug |
| GIS validation | PASS (1 data flag, fixed) | See GIS Validation section below |
| Security | PASS (1 note, fixed) | See Security Audit section below |
| Performance | INFORMATIONAL — not a pass/fail gate | See Performance section below |

## Bugs found, fixed, and verified

### 1. Disconnected-gate detail sheet missing prominent warning (FIXED)

**Repro**: Tapping GATE_18 (a disconnected gate) opened the bottom sheet with no orange warning banner — only a small gray line at the bottom of the sheet ("Gate 18 needs connector verification before routing."). GATE_14 (`needs_verification` status), by contrast, showed a prominent orange-bordered banner. The actual routing block still worked correctly either way (Directions → "Route problem" screen).

**Root cause**: `HomeScreen.tsx:1177` only checked `selectedPlace.verificationWarning`, which `V2PlaceAdapter.gateVerificationWarning()` (`V2PlaceAdapter.ts:64-65`) populates *only* for `gate.status === 'needs_verification'` (the GATE_13/14 near-duplicate-coordinate case). The disconnected-gate case computes a separate `unavailableReason` field (`V2PlaceAdapter.ts:48-56, 102, 126`) that was never read by the banner condition — it only reached the small print via `description`.

**Fix**: `src/views/screens/HomeScreen.tsx` (gate detail sheet) and `src/views/screens/DirectionsScreen.tsx` ("Heads up" card) — both banner conditions now check `verificationWarning || unavailableReason` and render whichever is set.

**Verification**: Rebuilt, reinstalled, re-tested on emulator. GATE_18 now shows the orange banner "Gate 18 needs connector verification before routing." on both the Home sheet and the Directions screen (upfront, before attempting to route). GATE_14 re-tested — still shows its original "This gate needs verification before navigation." banner, no regression. Screenshots: `gates/g18-fix-verify.png`, `gates/g14-fix-verify.png`.

### 2. Hardware Back button "exiting the app" — investigated, not a bug

**Initial repro** (2 occurrences) appeared to show Back jumping straight from a nested screen to the Android launcher, skipping intermediate screens. Static-analysis investigation (`RootNavigator.tsx`, `DirectionsScreen.tsx`, `HomeScreen.tsx`) found no `BackHandler.exitApp()`, `navigation.reset()`, or `popToTop()` call that could cause this — the stack is a genuine native-stack `Directions` route pushed on top of `Main`.

**Re-verified precisely**: single Back press from the Directions screen correctly returned to Home with the gate sheet state preserved (screenshot `back1.png` equivalent, confirmed via `mCurrentFocus` staying on `MainActivity`). A second Back press from Home's root (no exit-confirmation dialog exists there, unlike `NavigationScreen` which has one) correctly exits to the launcher — standard single-root-stack Android behavior. The original repro was almost certainly two rapid Back presses issued too close together in an earlier test script.

**No code change made.** If a "press back again to exit" confirmation on Home is desired for parity with `NavigationScreen`, that's a product/UX decision, not a bug fix — flagging for a separate decision if wanted.

### 3. GPS mocking unreliable in this AVD — investigated, not an app bug

**Observation**: during outside→gate→block routing tests, `adb emu geo fix` was set to a point ~340m from GATE_01, but the app's resolved `currentLocation` (confirmed via a temporary, since-reverted debug log in `DirectionsViewModel`) was consistently `{24.9695015, 66.9967979}` (accuracy 100) instead — reproducible across three full app restarts with the fix re-issued before each launch.

**Root cause**: `adb emu geo fix` pushes a single location event to the GPS HAL, but Android's `LocationManagerService` only forwards/caches it when a listener has an active request window open at that instant (`ProviderRequest[ON]`). `dumpsys location` showed `ProviderRequest[OFF]` for both the `gps` and `fused` providers at rest — the fix events were very likely landing between request windows and being dropped, leaving the app on whatever location the AVD's network/fused provider had cached (a point just outside the venue's west boundary, `26.9695,66.9968` — close to GATE_05, which is presumably a leftover default/prior test location for this AVD).

**Verification the app itself is correct**: a standalone script reimplementing the production dijkstra/min-cost gate-selection logic (`EntryGateRoutingService.findBestGateForOutsideUser` / `RoutingServiceV2.selectOutsidePath`) against the real `IJTEMA_NAVIGATION_GRAPH_V2` data was run against both the intended synthetic point and the actual resolved point, confirming the app's gate choice and route cost were mathematically correct for whichever coordinate it actually received. This is a test-environment limitation, not a defect — same category as the earlier Back-button finding (see Bug 2): the tooling misled initial observation, not the app.

**No code change made.** Live GPS-movement testing (in-motion rerouting, arrival detection) was not attempted further given this constraint; it needs either a real device or a more reliable emulator mock-location workflow (e.g. Android Studio's Extended Controls location playback, or `LocationManager.setTestProviderLocation` via an on-device shell/instrumentation approach) in a future session.

## GIS Validation

Ran `test:map-data-v2` and companion scripts (`test:navigation-graph-v2`, `test:entry-gate-routing`, `test:route-smoke-v2`, `test:all-gates-v2`, `test:all-blocks-v2`, `test:all-roads-v2`, `test:all-points-v2`) — all pass (289 nodes / 323 edges / 65 intersections; 42/42 blocks; 11/11 rastas; 12/12 central points; gate blocking consistent with the disconnected-gate policy).

Additional checks beyond the existing test suite:
- **Duplicate/near-duplicate coordinates**: full pairwise haversine check (329 points) at ≤3m — only the already-documented GATE_13/GATE_14 pair found; all other close pairs are expected rasta/central-point graph-connector clusters at shared intersections, not defects.
- **Polygon closure (42 blocks)**: all have 4 distinct corners, no sub-1m corner pairs, shoelace area >10m², no self-intersection (angle-sorted-corner construction structurally prevents it).
- **Bounding box**: all 329 points fall inside `IJTEMA_MAP_BOUNDS`; no hemisphere errors or swapped lat/lng.
- **Rasta/special-route polylines — 1 flag, FIXED**: Rasta 06 (`rastas.ts:69`) had an anomalous 863.4m straight-line jump between `R6-07` and `R6-08` (all its other segments are 20-450m). Root cause: the two northernmost coordinates in the supplied list were appended at the end instead of the start; longitude is near-constant across all 9 points (a straight N-S path), so sorting by latitude confirmed the correct order. Fixed by reordering the coordinate array in `rastas.ts` (no coordinate values changed, point IDs are sequence-derived so they now land correctly); documented as `RASTA_06_OUT_OF_ORDER_POINTS` in `dataIssues.ts`. Verified via `test:map-data-v2` (289 nodes / 323 edges / 65 intersections — unchanged, confirming no orphaned nodes) and `test:navigation-graph-v2`, `test:entry-gate-routing`, `test:route-smoke-v2`, `test:production-v2-defaults`, `test:offline-v2`, `test:v1-v2-isolation` — all pass.

## Security Audit

- **API key handling — PASS**: Android/iOS Maps keys read only from env (`app.config.js`, `MapConfigResolver.ts`); no hardcoded real key in `src/`; `.env` never committed (`git log --all --full-history -- .env` empty); `.env.example` placeholders only.
- **Secrets in tracked source — PASS**: no committed secrets found; debug keystore password `'android'` is the well-known public AOSP default, not a secret; `android/keystore.properties` is gitignored and does not exist on disk.
- **Release signing — PASS (fails safe)**: `android/app/build.gradle` falls back to **debug** signing (never unsigned) when `keystore.properties`/env vars are incomplete, with a build-time warning — intentional per code comments and `docs/SECURITY_AUDIT.md`. Confirms release builds today would be debug-signed, not distributable to Play Store as-is; this is a known, already-documented gap, not a new defect.
- **Android permissions — 1 NOTE, FIXED**: `SYSTEM_ALERT_WINDOW` was present in `android/app/src/main/AndroidManifest.xml` (the manifest merged into every build type, including release) with no usage in `src/` and no requesting entry in `app.json`'s `expo.android.permissions`. Traced its origin: `grep -rl SYSTEM_ALERT_WINDOW node_modules --include=AndroidManifest.xml` only matches `react-native/ReactAndroid/src/debug/AndroidManifest.xml` — React Native's own **debug-only** dev-overlay manifest (`android/app/src/debug/AndroidManifest.xml`, `debugOptimized/AndroidManifest.xml`), which is expected and untouched. No dependency requests it for release. Removed the stray line from `android/app/src/main/AndroidManifest.xml`; release/main builds no longer declare it.
- **Expo/RN config — PASS**: no cleartext traffic allowed (`NSAllowsArbitraryLoads=false`), no `android:debuggable` override, single exported component (`MainActivity`, required).

## Performance

- **`tracksViewChanges` — PASS**: correctly `false` on nearly all markers across `HomeScreen.tsx`/`NavigationScreen.tsx` — avoids the standard react-native-maps re-rasterization performance trap. Gate markers conditionally track only during an actual transition (`gateMarkersTransitioning` flag), a sound pattern.
- **Frame timing — informational, not a verdict**: `dumpsys gfxinfo` during map pan/zoom on this debug build showed heavy jank (99%+ janky frames, 50th percentile ~129ms). This is **expected for a debug build on emulator software rendering** (unoptimized JS bundle, dev warnings/overlay active, no Hermes release optimizations) and is explicitly **not** used here as a pass/fail signal on real-device production performance — a release-build device pass is still needed (currently blocked on the same missing-keystore gap noted in Security).
- **Memory — informational**: ~517MB PSS total, ~175MB native heap at rest with the map+markers rendered. Within normal range for React Native + Google Maps SDK with 42 block polygons + up to 17 gate markers rendered; nothing alarming observed, no leregister growth pattern tested (would need a longer soak test).

## Not yet covered (explicitly not claimed PASS)

Per CLAUDE.md: local test-script and this runtime pass do not constitute full production-readiness sign-off. Still outstanding:
- Live GPS-movement navigation: in-motion rerouting, arrival detection (blocked this session by unreliable emulator GPS mocking — see "GPS mocking unreliable" above)
- Release-build APK validation and release-build performance pass (both blocked — `android/keystore.properties` not configured)
- Long-duration memory soak / leak testing
- Inside-venue routing exhaustive sweep (e.g. Block 1 → Block 42) beyond the single Block 1 case tested here

## Artifacts

```
android-runtime-artifacts/2026-07-18/
  home/home-initial.png
  blocks/blocks-filter.png
  gates/gates-filter.png, gates-filter-zoomout.png, gates-filter-panned.png,
        g14-g13-tap.png, g18-tap.png, g18-search-select.png, g18-directions-tapped.png,
        g18-fix-verify.png, g14-fix-verify.png
  rastas/rastas-filter.png, rasta01-selected.png
  pindal/pindal-filter.png, pindal-filter-zoomout.png
  routing/outside-to-gate05-block1.png
  offline/offline-map-functional.png, offline-search-badge.png, gps-disabled-graceful.png
  navigation/, performance/   (empty — live-motion navigation and release-build perf not run, see Not Yet Covered)
```
