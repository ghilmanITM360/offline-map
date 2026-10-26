# SDK continuation handoff (written 2026-10-26, #392)

Branch `feat/muslim-ummah-offline-navigation-sdk` on the Home Mac (`Ghilmans-Laptop.local`), checkout `/Users/ghilmankhan/workprojects/offline-map`.
Sole writer: the Claude implementation session. Codex is reserved for later independent QA. No other worktree is used; the Codex
worktree and both original stashes are untouched. `integration/ijtema-clean-baseline` was never touched.

## State at hand-off

- Local == origin at the commit named in the last ledger entry; working tree clean. Last SDK tarball SHA-256
  `dc00250f6cb19a7d8807f155d5d4e2515bca0c27db1291ebdae6dc7000d14a0f` (byte-reproducible).
- Full Jest 207 suites / 2,096 tests; tsc, eslint, `test:sdk-exports`, `test:sdk-package`, `test:sdk-consumer` (22 consumer tests, Android +
  iOS production bundles) pass. The full `npm test` routing chain was last run at C1d-2; routing sources are untouched since.
- Evidence (outside the repo): `~/Documents/offline-map-audits/offline-sdk-b7-b10-master-continuation-2026-10-24/`
  (`c2b-consumer`, `c2c-ios`, `c2c-android`, `c3-location`, `c6-rtl`, `c7-bundle`, `tools/atap.py`).
- Done and pushed: C2b, C2c (iOS simulator + Android emulator), C3 (reference expo-location adapter + iOS precision module),
  C6 part 1 (RTL fixes), C7 part 1 (client docs + bundle builder). See `IMPLEMENTATION_ROADMAP.md` for each entry's evidence and gaps.

## Remaining work, in dependency order

1. **C4 host delegation** (largest, riskiest): the Ijtema host still owns navigation in `src/viewmodels/NavigationViewModelV2.ts` (722 lines),
   `src/services/RerouteService.ts` (204), `V2NavigationRuntimeService`, `useManualLiveUpgrade`, `DirectionsViewModel`, HomeScreen and
   `useAppStore`. Step 1 is characterization only: a parity matrix of host transitions vs `NavigationController` (Manual-to-Live candidate
   confirmation, stale-fix guards, reroute cancellation, arrival latch, outside-venue routing, gate selection). Safety net: the existing
   `NavigationViewModelV2*`, `RerouteSnapContinuity`, `test:reroute-v2`, `test:navigation-progress-v2`, `test:gps-signal-loss-v2` suites.
   Migrate one bounded flow at a time; delete old logic only after parity is demonstrated. Never edit the senior-testing baseline.
2. **C5 platform adapters**: pure-JS SHA-256 (promote `examples/expo-consumer/sha256.ts`), a filesystem `PackStore` over expo-file-system, a pack
   compiler script (directory → manifest with per-file SHA-256), the versioned Karachi manifest, bundled-fallback wiring, interruption tests.
   No signing keys exist: do not fabricate any; imported/remote packs stay refused.
3. **C6 rest**: reviewed Urdu/Roman Urdu copy (needs the owner), iOS AX5 panel height, dark basemap, `expo-system-ui` for Android dark,
   VoiceOver/TalkBack, small-screen Android.
4. **iOS continuous location**: `watchPositionAsync` gave one callback on the simulator and none after `simctl location set/start/run`.
   Decide between simulator limitation and an adapter/Expo problem: a physical device is the clean answer; otherwise try another
   injection route (Simulator.app Features > Location) or a native `CLLocationManager` watch in the example module.
5. **C7 rest**: regenerate the bundle at the final commit (`npm run sdk:bundle -- <fresh dir>`), copy it to `c7-bundle/`, re-verify `shasum -c`.
6. **Owner-gated**: physical devices and field walking, airplane-mode cold start, external security review, signing/publishing, Gate 18/19 survey.

## Operating notes and traps

- Resource order each session: five-hour usage, weekly usage, context, then disk. Disk was 8.2 GiB free at 98% once; macOS reclaimed to ~20 GiB
  during builds. Scratch consumers (`<scratchpad>/c*-run*/`, 1.5 GB each with node_modules + DerivedData) are disposable; delete old ones.
- Native builds run from a fresh consumer made by `npm run test:sdk-consumer -- <dir>`, then `expo prebuild`, `pod install`, `xcodebuild` / `./gradlew assembleRelease
  -PreactNativeArchitectures=arm64-v8a`. Under `/tmp` export real `PROJECT_ROOT`/`ENTRY_FILE` (`/private/tmp/...`) or the Metro phase fails. `-resultBundlePath`
  must not already exist.
- Android emulator `Ijtema_API_36_Play` must start with `-gpu host` (default SwiftShader blanks the window when the map mounts). Do not touch `Codex_API36_131`.
  Use `tools/atap.py "<content-desc or text>"` to tap by accessibility name (uiautomator), `adb emu geo fix <lng> <lat>` for location, `cmd locale set-app-locales`
  for RTL, `settings put system font_scale 2.0` for scale. The release APK is not debuggable (no `run-as`).
- iOS simulator `iPhone 17 Pro` (7A124E27-1A57-4346-B164-72710BADD963): panel taps use points (402x874); layout shifts between taps, so screenshot before tapping.
- Gradle's JS bundle task does not notice edits inside `node_modules`; use `:app:createBundleReleaseJsAndAssets --rerun-tasks` when instrumenting installed SDK files.
- Do not run `expo prebuild --clean`; the generated `ios/` and `android/` live only in scratch consumers, never in the repo.
- Never relabel simulator/emulator evidence as device evidence; Gates 18/19 stay field-blocked.
