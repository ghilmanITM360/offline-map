# APK Device-Test Release Checklist

**Build version:** `1.0.0` (package.json), `versionCode 1` / `versionName "1.0.0"` (`android/app/build.gradle`)
**Commit:** `1ecaa53ba6aef9d824974ce1ad55ca7cb4129731` (branch `main`)
**Package:** `com.aicrafted.karachiijtema`
**Date:** 2026-07-20

This checklist covers the Release Candidate Audit performed before building a device-test APK. It documents what was fixed and what was verified live on an Android emulator.

**APK status: built.** `android/app/build/outputs/apk/release/app-release.apk` (~90MB), built after the user confirmed C1 key rotation in chat. Fresh install + launch verified on a Pixel 7 Pro API 36 emulator — see §6.

---

## 1. Known issues / blockers

### ✅ RESOLVED — C1: Google Maps API key rotation

The Android Google Maps API key in local `.env` was previously the same key that had leaked into git history (see `docs/SECURITY_AUDIT.md`, finding C1). **User confirmed in chat that it has been rotated and restricted in Google Cloud Console.** Verified mechanically: the `com.google.android.geo.API_KEY` value resolved into the built release APK's manifest hashes to a different SHA-256 than the known old leaked key — confirming the new key actually made it into this build, not just that `.env` was edited.

If this key ever needs re-verification: restriction should be Android apps → `com.aicrafted.karachiijtema` + the **debug keystore's SHA-1** (not a release SHA-1 — see C3 immediately below, this build is debug-signed), API allowlist limited to Maps SDK for Android.

### 🟡 Accepted for this build — C3: release signing uses the debug keystore fallback

`android/app/build.gradle`'s `release` signing config resolves a real keystore from `android/keystore.properties` or `ANDROID_RELEASE_*` env vars if present, and **falls back to the debug keystore** (with a build-time warning) if not. No production keystore is configured yet. Per your decision, this is acceptable for a device-test build — not a Play Store submission. Set up real release signing before any Play Store submission.

### 🟢 Expected/no action needed — Google Maps key visible inside the built app

The Maps API key is present in the built app in more than one place: the native manifest (via the `${googleMapsApiKey}` Gradle placeholder, now durable — see §2 below) and the JS bundle / `expo-constants` config (`MapConfigResolver`/`MapConfigService` read `process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` for a dev-mode masked preview log and an "is configured" check). **This is expected and not fixable** — Android/iOS Google Maps SDK keys are inherently client-visible; anyone can extract them from any installed app via `aapt`/APK inspection. Security comes entirely from the Google Cloud Console restriction (package name + signing SHA-1), which is exactly what C1's remediation above sets up. This is not a new finding requiring code changes.

### 🟡 Not yet done — `versionCode` still `1`

If a previous build of this app is already installed on a test device, Android will refuse to install an update with the same `versionCode`. Bump `android/app/build.gradle`'s `versionCode` (and `versionName` if desired) before building if any test device already has an earlier build installed. Not required for a fresh install.

---

## 2. Phase 1 fixes verified this pass

### Gate/Block/Rasta/Route label clipping — fixed, verified live on-device

**Root cause** (documented in full in `docs/TARGETED_FIX_SPRINT_REPORT.md`, Phase 5): `react-native-maps`' `Marker`-snapshot rendering pipeline hard-clips dynamically-sized label text under this app's New Architecture (Fabric/Bridgeless) runtime. Six prior style/JS-level fix attempts failed because the bug is architectural, not a CSS sizing issue.

**Fix:** all label text (gate/block/rasta/special-route) now renders in a new `MapLabelOverlay` component — a plain `View`/`Text` overlay positioned via `MapView.pointForCoordinate()` (a different native code path than the broken Marker-snapshot capture), rendered as a sibling of `<MapView>` instead of inside `Marker` children. Layer components (`GateLayer`, `BlockLayer`, `RastaLayer`, `SpecialRouteLayer`) now only render small fixed-size dot `Marker`s for touch targets (no dynamic text, not subject to the clipping bug).

**Verified live** on a Pixel 7 Pro API 36 emulator: selected "Gate 05" renders its full label — `"Gate 05"` in white bold text on a dark blue rounded-rect background, plus the Urdu secondary line (`05 گیٹ`) beneath it — completely unclipped, clean padding on all sides. Confirmed via screenshot.

**Automated coverage:** `src/__tests__/MapLabelOverlay.test.tsx` (4 tests: untruncated text render, z-order stacking, off-screen filtering, projection-call throttling), `scripts/test-map-label-overlay-v2.ts` (no layer file renders `Text` inside a `Marker`; `MapLabelOverlay` never imports `Marker`; `HomeScreen` renders exactly one `<MapLabelOverlay>`), `scripts/test-marker-performance-v2.ts` (updated for the new dot-marker-only shape).

### Map controls layout — fixed, verified live on-device

**Root cause:** the Layers/Compass/Zoom/Recenter cluster was two independently-positioned pieces (a top-anchored compass/zoom group, a separately bottom-anchored recenter button) with independent offset math — exactly what let a route-preview card push the recenter button into the zoom controls.

**Fix:** `MapControls.tsx` now renders the entire Google-Maps-style cluster (Layers → Compass → Zoom+ → Zoom− → Current location) as one component, positioned by a single `controlStackBottom` value (`HomeScreen.tsx`) that accounts for the route-preview card's measured height. One bottom offset for the whole stack means it can't collide with itself.

**Verified live:** control stack renders as a single non-overlapping bottom-right column in the "outside venue" banner state (banner shown, controls unaffected) and in the default browse state. Confirmed via screenshot.

**Known residual gap (not fixed this pass):** the live-navigation-mode control stack (`HomeScreen.tsx`'s `styles.navControls`, used only while `showNavOverlay` is true) still positions itself via a hardcoded offset (`Math.max(insets.bottom, 12) + 12 + 140 + 56 + 16`) rather than the same measured-height pattern used everywhere else. It does not overlap anything in current testing (its separate recenter button lives in `NavigationChromeV2`, at a fixed, independently-verified offset), but it was not converted to the fully durable measured pattern. Low risk, flagged for a follow-up pass.

### Map cold-start loading state — fixed

A "Loading map…" overlay now shows from `!mapReady` until the map view reports ready, replacing the prior blank-screen gap. Falls back to the existing 7-second-timeout failure banner unchanged.

### Dev-mode "Open debugger to view warnings" footer — investigated, root cause identified, confirmed absent from release builds

This is **not** caused by a custom native module or by the `BridgelessReactContext` log line (see below) — it's React Native's own **LogBox**, which renders this footer whenever any `console.warn`/`console.error` fires in JS during a dev session.

**What actually triggered it in this test session**, confirmed via `adb logcat`:
```
W/ReactNativeJS: '[GPSManager] reconcile failed:', { [Error: Location request failed due to unsatisfied device settings] code: 'ERR_LOCATION_SETTINGS_UNSATISFIED' }
```
This is `console.warn('[GPSManager] reconcile failed:', err)` at `src/services/GPSManagerService.ts:77`, firing because the test emulator's Android location-accuracy setting wasn't enabled yet. This is legitimate, working defensive error handling (a GPS subscription failing to establish is caught and logged, not left to crash), not a bug — on a real device with location services already enabled it won't fire in normal use, and even if a location error does occur in the field, the correct behavior is exactly this: log it in dev, degrade gracefully in the UI.

**Separately observed** (native `Log.w`, not JS, not connected to the LogBox footer above):
```
W/BridgelessReactContext: [WARNING] Bridgeless doesn't support CatalystInstance. Accessing an API that's not part of the new architecture is not encouraged usage.
```
Confirmed via `adb logcat` that this line **never appears under the `ReactNativeJS` tag** and no corresponding LogBox/JS console output exists for it — it's React Native core's own New-Architecture compatibility shim, logged natively (Android `Log.w`) whenever any module in the dependency tree (RN core or a third-party library) touches a legacy bridge API under Bridgeless. It is not visible in the app's UI at all (only in `adb logcat`), and is unrelated to the visible dev-warning footer the original bug report described.

**Confirmed release-mode absence:** read directly from `node_modules/react-native/Libraries/Core/ExceptionsManager.js` — `LogBox` is only `require()`'d and invoked inside `if (__DEV__) { ... }` blocks. In a release build, `__DEV__` is inlined to `false` and this code is dead-code-eliminated entirely; LogBox does not exist in the release JS bundle. No code change was needed or made; this is standard, already-correct React Native behavior.

---

## 3. Android manifest / build validation

Validated against the **actual built `app-release.apk`** (`aapt dump badging` + the Gradle manifest-merger report), not just the hand-authored source manifest — the merged manifest includes permissions injected by transitive AndroidX/library dependencies that don't appear in `android/app/src/main/AndroidManifest.xml` directly.

- **Permissions (12 total in the final APK):**
  - From this app's own source manifest (7): `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_NETWORK_STATE`, `INTERNET`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `VIBRATE`.
  - From `expo-network` (1): `ACCESS_WIFI_STATE` — normal-protection-level, no runtime prompt, used for network-state/offline detection.
  - From `androidx.work:work-runtime:2.7.1` (3, auto-injected, traced via the manifest-merger report): `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE` — all normal-protection-level (auto-granted at install, never shown to the user as a runtime prompt), standard boilerplate for any Expo app that pulls in WorkManager transitively; not requested or used directly by this app's own code.
  - From `androidx.core:core:1.16.0` (1): a self-scoped signature permission `com.aicrafted.karachiijtema.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — AndroidX's own Android-13+ broadcast-receiver security hardening, not a real user-facing permission (doesn't appear in any Play Store permission listing).
  - `SYSTEM_ALERT_WINDOW` is present only in the `debug`/`debugOptimized` manifest overlays, **not** `src/main` — confirmed absent from the release variant.
  - None of the library-injected permissions are "dangerous" protection level; the only runtime-prompted permissions remain the two location permissions, as expected.
- **Exported components:** exactly one — `.MainActivity` (the launcher activity, expected), confirmed via `aapt dump badging`'s single `launchable-activity` entry. No other exported activities, services, receivers, or providers beyond what Expo's own auto-generated providers require.
- **`android:debuggable`:** not forced anywhere in `buildTypes.release` — uses the Android Gradle Plugin's default (`false` for release). Confirmed empirically too: launching the installed release APK showed no LogBox/dev-menu UI at all (§6).
- **Signing:** verified via `apksigner verify --print-certs` — signed with the debug keystore (`CN=Android Debug`), matching the accepted C3 fallback (no `android/keystore.properties` present).
- **Manifest placeholder durability (C2 — fixed this pass):** added `plugins/withAndroidManifestGradlePlaceholder.js`, registered in `app.json`'s `plugins` array. It runs after Expo's built-in Google Maps config plugin and rewrites the `com.google.android.geo.API_KEY` meta-data back to the literal string `${googleMapsApiKey}` regardless of what real key `app.config.js` fed in — so the safe, Gradle-placeholder-resolved manifest now survives `expo prebuild --clean` instead of depending on a hand-edit that gets silently clobbered. Verified via a unit test (`scripts/test-android-manifest-placeholder-v2.ts`) that exercises the plugin's manifest-mutation logic directly against a fake manifest (including idempotency and a real-vs-placeholder-key scenario), plus confirms the committed manifest and `app.json` registration are both in place.

## 4. Static checks

- `npm run typecheck` (app + scripts) — clean.
- `npm run lint` — clean.
- `npm test` (full script chain, ~80 scripts) — all passing.
- `npx jest --config jest.config.js` — 5 suites / 34 tests passing, including the new `MapLabelOverlay.test.tsx`.

## 5. Live device/emulator pass (Pixel 7 Pro API 36 emulator, debug build)

Performed via `npx expo run:android` + `adb`/screenshots, not just static analysis:

- ✅ Cold start → location-permission screen → offline-maps prompt → main map screen, all render correctly.
- ✅ Location permission grant flow (native Android dialog) works; GPS resolves (tested via emulator mock location fix) and the "Outside Ijtema · Enter through Gate 20" banner renders correctly for an outside-venue location.
- ✅ Category filter chips (`Gates (17)`, etc.) work and visibly update the map.
- ✅ Gate marker tap → selection → full "Gate 05" label with Urdu secondary line renders completely unclipped (the core Phase 1 fix).
- ✅ Selecting a gate opens the bottom sheet (Directions / Save / Share / Detail) correctly.
- ✅ Map control stack (Layers/Compass/Free-rotate/Zoom+/Zoom−/Recenter) renders as one non-overlapping bottom-right column, including while the outside-venue banner is showing.
- ✅ No crash, no ANR, process remained healthy throughout (`adb logcat` checked for `FATAL`/`ANR` — none found).
- ⏸️ **Not exercised on-device this pass** (deprioritized after the label-clipping and control-layout fixes were confirmed, given time spent working around emulator touch-targeting quirks): full turn-by-turn navigation flow, offline-downloaded-tiles mode. These should be exercised on a real device — see §6.

## 6. Release build validation (actual `app-release.apk`)

Performed after the user confirmed C1 key rotation in chat:

- ✅ `npm run android:release:apk` → **BUILD SUCCESSFUL** in 7m 15s. Output: `android/app/build/outputs/apk/release/app-release.apk` (~90MB).
- ✅ Manifest/permissions/signing/exported-component validation in §3, all against this actual APK via `aapt`/`apksigner`.
- ✅ Resolved Maps API key in the built manifest hashes differently (SHA-256) than the known old leaked key — confirms the rotated key, not just an edited `.env`, made it into this build.
- ✅ Fresh install on a clean emulator (`adb uninstall` then `adb install app-release.apk`) — succeeded.
- ✅ Launched the installed release build (`adb shell monkey`) — reached the same Location Access screen as the debug build cleanly, **no LogBox/dev-menu UI**, no crash, no ANR (`adb logcat` checked immediately after launch).
- ⏸️ Not exercised for this specific release APK: full navigation flow, offline-tile mode, multi-state control-stack overlap check (all already spot-checked on the debug build in §5, which shares the same JS/UI code — only signing/minification differ in release). Recommend the real-device pass below still covers these for full confidence.

## 7. Steps to test on a real device

1. Transfer `android/app/build/outputs/apk/release/app-release.apk` to a real Android device and install fresh (uninstall any prior version first if `versionCode` wasn't bumped — see §1).
2. Launch — confirm no crash, no LogBox/dev-menu UI (already confirmed absent on emulator; real-device confirmation still recommended).
3. Grant location permission when prompted; confirm the app resolves your real location (real devices typically don't hit the "Location Accuracy" system-dialog friction seen on this emulator).
4. Zoom into the map; confirm gate, block, rasta, and Shahr-e-Pindal route labels all render fully readable at every zoom tier, with no clipping (spot-checked on emulator for a selected gate — confirm across more items and zoom tiers on-device).
5. Confirm the control stack (Layers/Compass/Zoom/Recenter) never overlaps in all four states: normal map, search open, route preview open, navigation active.
6. Pick a destination, start turn-by-turn navigation, confirm instructions/progress/reroute banners work and the map doesn't freeze.
7. Turn on airplane mode (or use a location outside network coverage) and confirm offline venue data / previously-downloaded map tiles still work.
8. Confirm the app requests only the permissions listed in §3, and that no permission prompt appears unexpectedly.
