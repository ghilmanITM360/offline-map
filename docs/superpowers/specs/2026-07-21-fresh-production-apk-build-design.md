# Fresh Production APK Build — Design

**Date:** 2026-07-21
**Status:** Approved

## Goal

Produce a clean, freshly built release APK from the current `main` branch state that contains all latest code (routing changes, outside-street-graph routing, A* routing engine, navigation improvements, UI/UX fixes, map rendering changes, latest tests/config) — with no reuse of any prior build artifact — and document the build with a verification report.

## Context / constraints discovered during investigation

- `main` is at `403ddf0` (PR #10 merged 2026-07-21), no conflict markers anywhere in the tree.
- There are pending, uncommitted working-tree changes to `package.json` and `src/views/screens/HomeScreen.tsx` (leftover fixes from an earlier merge-conflict cleanup in this same session). They are typecheck-clean and conflict-marker-free but not yet part of history.
- `MapFeatureFlagsService` defaults `useIjtemaV2Map`/`Routing`/`Navigation` to `true` when unset, but `useOutsideStreetGraph` defaults to `false` when unset. The repo's `.env` currently sets only the Google Maps Android key — none of the feature flags — so outside-street-graph routing would compile but stay inactive unless `.env` is updated.
- `android/keystore.properties` does not exist (only `.example` does). Per `android/app/build.gradle`, the `release` buildType falls back to the debug keystore when no production signing config is present — this is an intentional, documented fallback (`docs/SECURITY_AUDIT.md` C3), not a bug. The resulting APK will be a `release`-buildType (minified/shrunk per Gradle properties), installable, functional build — but **debug-signed**, not Play-Store-distributable.
- No emulator/device is currently attached to `adb`. Two AVDs exist locally (`Pixel_3a_API_36_extension_level_17_arm64-v8a`, `Pixel_7_Pro_API_36`); the user will boot one manually.
- `.env` is correctly gitignored (`.env`, `.env.local`, `.env.*`, with `!.env.example` tracked) — no change needed there.

## Decisions locked in (from user)

1. Commit the pending `HomeScreen.tsx` / `package.json` fixes as their own commit before building, so the build is reproducible from a clean, traceable history.
2. Add `EXPO_PUBLIC_USE_IJTEMA_OUTSIDE_STREET_GRAPH=true` to local `.env` so outside-street-graph routing is live in this build, not just compiled-but-disabled. `.env` stays untracked/gitignored.
3. Wait for the user to boot an emulator themselves; poll `adb devices` rather than launching one automatically.

## Build flow

1. **Pre-flight** — commit pending fixes. Confirm `main` HEAD, clean tree, no conflict markers (already verified; re-confirm after commit).
2. **Environment check** — record Node/npm versions, `$ANDROID_HOME`, `adb version`, confirm `gradlew` is present/executable. Informational only; already verified compatible.
3. **Clean** — `cd android && ./gradlew clean`; delete any existing files under `android/app/build/outputs/apk/`. Do not run `expo start -c --clear` (that's a Metro dev-server cache flag, irrelevant to a native `gradlew assembleRelease` build); clear Watchman/Metro cache directories directly only if a stale JS bundle cache is suspected during the build.
4. **Production config** — add the outside-street-graph flag to `.env`; verify `app.config.js` picks up the Google Maps key and package name correctly (already confirmed); explicitly note the debug-keystore-signing fallback in the final report so it's never mistaken for a production-signed artifact.
5. **Validation gate** — run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:components` in sequence. Any failure stops the process before any build step runs; failures are reported to the user for a decision rather than silently bypassed or "fixed" unilaterally.
6. **Build** — `npm run android:release:apk` (`cd android && ./gradlew assembleRelease`). Confirm the output APK exists at `android/app/build/outputs/apk/release/app-release.apk` with a timestamp newer than the start of this build.
7. **APK verification + install** — check file size/timestamp/package name/version, `adb install -r <path>`, launch via `adb shell monkey -p com.aicrafted.karachiijtema 1`.
8. **Runtime smoke test** — once the user's emulator appears in `adb devices`: verify app launch, Home screen (map/search/filters), Blocks B1–B42, Gates, Rastas 01–11, Pindal (3 routes), routing (inside + outside-street-graph), navigation (location/route line/instructions/ETA), offline mode. Screenshots saved to `android-runtime-artifacts/latest-apk-test/`.
9. **Report** — write `docs/APK_BUILD_REPORT.md` using the specified template (Build Information / Validation / Runtime results table / Final section with APK location, install command, build commit hash). Every PASS/FAIL in the table reflects an actually-observed result; nothing is marked PASS without emulator verification.

## Error handling

- Any Phase 5 validation failure (typecheck/lint/test) halts before Phase 6 and is reported to the user with the failure detail; the user decides whether to fix-and-retry or proceed with an explicit exception. No build is produced against a failing gate without an explicit user decision.
- If `adb devices` never shows a device/emulator, Phases 7–8 cannot run; the report will state the APK was built and validated but not runtime-verified, rather than claiming PASS.

## Out of scope

- Producing a real production-signed (non-debug-keystore) release build — no `keystore.properties` exists and creating production signing credentials is a separate decision, not part of this build task.
- iOS build.
- Publishing/distributing the APK anywhere.
