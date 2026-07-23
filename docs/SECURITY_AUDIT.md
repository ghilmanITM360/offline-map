# Security Audit — Mobile App Secrets & Permissions

**Date:** 2026-07-18
**Scope:** Android/iOS native config, Google Maps API key handling, location permissions, release build/signing config.
**HEAD at time of audit:** `2298b04` on branch `codex/ijtema-map-data-v2`.
**Method:** Live re-verification via `git log -p`, `git grep`, direct file reads, and reading the actual `@expo/config-plugins` source in `node_modules` (not assumed from docs). No destructive or history-rewriting commands were run.

---

## Critical

### C1. Leaked Android Google Maps API key is still the live, in-use key — not just a historical exposure

- **What:** The key `GOOGLE_MAPS_API_KEY=<REDACTED>` was hardcoded in `android/app/src/main/AndroidManifest.xml` in commit `0cf2c75` ("fix major issues of maps") and replaced with the placeholder `${googleMapsApiKey}` in commit `a7833f7` ("feat: finalize offline v2 navigation release gate"). That part of the original report is confirmed accurate.
  - However: `.env` (gitignored, untracked — confirmed via `git ls-files .env` returning nothing and `git log --all -- .env` returning nothing) currently contains **the exact same key** as `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`. This means the key was never actually rotated after the leak — the app today still builds against the compromised credential. Anyone who mined it out of git history (`git log -p -S AIza`) has a key that is still fully functional against your Google Cloud project, unless it happens to already be scoped/quota-limited in the Console (unverifiable from the repo).
- **Where:** `.env:1` (untracked, local); leak site `android/app/src/main/AndroidManifest.xml` in commit `0cf2c75`.
- **Risk:** Anyone with repo access (current or former collaborators, CI logs, local clones, forks made before `a7833f7`) can extract a **currently-valid** Google Maps API key and use it against your Google Cloud billing account (quota exhaustion, billing abuse) unless it is already restricted by package name + SHA-1 + API allowlist in Google Cloud Console.
- **Remediation (do this regardless of git-history cleanup):**
  1. **Regenerate the key in Google Cloud Console** (APIs & Services → Credentials → the affected key → "Regenerate key", or delete and create a new one under the same project).
  2. **Restrict the new key** before it's ever used:
     - Application restriction: Android apps → add `com.aicrafted.karachiijtema` with the **release** signing certificate's SHA-1 fingerprint. **Do not restrict against the debug keystore SHA-1** — see C3 below, this project currently signs "release" builds with the debug keystore, so a SHA-1 restriction today would silently accept the well-known debug fingerprint, giving no real protection. Fix C3 first, get a real release SHA-1 (`keytool -list -v -keystore <release>.keystore`), then restrict.
     - API restriction: limit to exactly the APIs used (Maps SDK for Android at minimum; do not select "don't restrict key").
  3. Update the local `.env` file (`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=<new key>`) — `.env` is correctly gitignored (`.gitignore:12-15`), so this does not need a commit.
  4. Confirm the gradle placeholder path still resolves: `android/app/build.gradle:38-45` reads the key from `System.getenv(...)`, then a Gradle property, then a hand-rolled `.env`/`.env.local` parser (`readLocalEnvValue`, `android/app/build.gradle:8-30`) — no code change needed, just drop the new key into `.env`.
  5. Re-run `node --import tsx scripts/test-map-config.ts` (or `npm run test:map-config`) after rotating — it scans tracked files for the `AIza[0-9A-Za-z_-]{20,}` pattern (excluding `.env`/`.env.local`) and would catch any accidental re-hardcoding.
  6. **Do NOT rewrite git history or force-push to purge the old key from history as part of this task** — that is out of scope here and is a separate, higher-risk decision (rewrites shared history, breaks other clones/forks, requires force-push) that needs explicit owner approval and coordination with anyone else who has cloned the repo. Treat it as a follow-up decision, not a blocker for rotation — rotation alone neutralizes the leaked key regardless of whether it stays in history.

### C2. The Android manifest placeholder fix (`a7833f7`) is not durable — the next `expo prebuild --clean` will silently re-bake the literal key

- **What:** Commit `a7833f7` hand-edited the *generated* `android/app/src/main/AndroidManifest.xml` to use `${googleMapsApiKey}` instead of a literal key. But this file is a build artifact of `npx expo prebuild` (documented in `CLAUDE.md` as the required step "after `.env` / native config changes"), not a hand-maintained source file. `app.config.js:45-54` sets:
  ```js
  android: {
    ...
    config: { googleMaps: { apiKey: androidGoogleMapsApiKey } }  // real key, straight from .env
  }
  ```
  This value is consumed automatically by Expo's **built-in** config plugin — verified by reading `node_modules/@expo/config-plugins/build/android/GoogleMapsApiKey.js` directly:
  ```js
  function getGoogleMapsApiKey(config) {
    return config.android?.config?.googleMaps?.apiKey ?? null;
  }
  function setGoogleMapsApiKey(config, androidManifest) {
    const apiKey = getGoogleMapsApiKey(config);
    ...
    addMetaDataItemToMainApplication(mainApplication, META_API_KEY, apiKey); // literal value, no placeholder support
  }
  ```
  There is no environment-variable/placeholder mode in this plugin — it always writes the literal string value of `config.android.config.googleMaps.apiKey`. Nothing in the repo (`app.config.js`, `app.json`, no `plugins/` directory, no custom `withAndroidManifest` mod) overrides or patches this behavior after the fact. There is also no `postprebuild`/patch-package step in `package.json` that reapplies the `${googleMapsApiKey}` placeholder after a prebuild.
- **Where:** `app.config.js:45-54` (feeds the real key into the plugin), `android/app/src/main/AndroidManifest.xml:18` (currently safe, but regenerated), `node_modules/@expo/config-plugins/build/android/GoogleMapsApiKey.js` (confirmed literal-bake behavior).
- **Risk:** Anyone who runs `npx expo prebuild --clean && npx expo run:android` (the exact workflow `CLAUDE.md` tells contributors to use after env/native changes) will regenerate `AndroidManifest.xml` with the **literal current `.env` key** baked back in, silently undoing the `a7833f7` fix. If that regenerated file is then committed, the (rotated, per C1) key leaks into git history again — a repeat of the original incident, and there is no automated gate (no CI workflow exists in `.github/workflows/`, confirmed empty; no git hook) that would catch it before the commit — only the manual `test:map-config` script would catch it, and only if someone remembers to run `npm test`/`npm run test:map-config` before committing.
- **Remediation:**
  1. Add a custom Expo config plugin (e.g. `plugins/withAndroidManifestGradlePlaceholder.js`, referenced in `app.config.js`'s `plugins` array) that runs **after** Expo's built-in Maps plugin and rewrites the `com.google.android.geo.API_KEY` meta-data value in the in-memory `AndroidManifest` mod result back to the literal string `${googleMapsApiKey}`, regardless of what `config.android.config.googleMaps.apiKey` was set to. This makes the safe-placeholder behavior survive `expo prebuild --clean` instead of depending on a hand-edit that gets silently clobbered.
  2. Alternatively (simpler, less elegant): stop setting `android.config.googleMaps.apiKey` in `app.config.js` at all (so Expo's plugin has nothing to write / removes the meta-data entry — see the `else` branch in `GoogleMapsApiKey.js` which calls `removeMetaDataItemFromMainApplication`), and rely entirely on the gradle `manifestPlaceholders` mechanism already wired in `android/app/build.gradle:137`. This requires manually re-adding the `${googleMapsApiKey}` meta-data line to the manifest template after every clean prebuild until option 1 is implemented — worse ergonomics than a real plugin fix, but zero new code.
  3. Until either is implemented, treat `npx expo prebuild --clean` as **unsafe to run without a manual manifest diff review** and a mandatory `npm run test:map-config` before any commit that touches `android/app/src/main/AndroidManifest.xml`.

### C3. Release Android builds are signed with the debug keystore, not a real release key

> **Update (2026-07-23 fix pass):** The `build.gradle` mechanism described as the fix below has
> since been implemented (commit `a08601d`) — `android/app/build.gradle` now resolves release
> signing credentials from `android/keystore.properties` (gitignored) or `ANDROID_RELEASE_*` env
> vars, with a `hasReleaseSigningConfig` guard that falls back to the debug keystore (with a
> `WARNING:` println) only when neither source provides complete credentials. **The mechanism is
> code-complete; what remains outstanding is a human generating and safely storing a real
> production keystore** — no such keystore or credentials exist in this repo or environment
> today, so release builds still fall back to the debug keystore in practice. This is an owner
> action item, not a code fix — see `docs/RELEASE_SIGNING.md` for the exact step-by-step
> (`keytool -genkeypair` command, where to place the file, how to wire in via either
> `keystore.properties` or env vars). The original finding/analysis below is kept for audit-trail
> completeness; treat `docs/RELEASE_SIGNING.md` as the current source of truth for what to do
> next.

- **What:** `android/app/build.gradle:141-158`:
  ```gradle
  signingConfigs {
      debug {
          storeFile file('debug.keystore')
          storePassword 'android'
          keyAlias 'androiddebugkey'
          keyPassword 'android'
      }
  }
  buildTypes {
      debug   { signingConfig signingConfigs.debug }
      release {
          // Caution! In production, you need to generate your own keystore file.
          signingConfig signingConfigs.debug   // <-- release uses the debug config
          ...
      }
  }
  ```
  `android/app/debug.keystore` is tracked in git (`git ls-files android/app/debug.keystore` confirms it), and uses the universally-known default Android debug credentials (`storePassword: android`, `keyAlias: androiddebugkey`, `keyPassword: android` — the standard Android SDK debug keystore defaults, not a project-specific secret).
- **Where:** `android/app/build.gradle:141-158` (pre-`a08601d` state, kept for history — see update note above for current state).
- **Risk:** Two distinct problems:
  1. **App integrity**: any release APK/AAB built from this repo (`npm run android:release:apk`, `npm run android:release:aab`) is signed with a key whose credentials are public knowledge and shared across countless other Android projects that never changed the RN template defaults. Anyone with this repo (or just the standard RN debug keystore) can produce a binary that presents the same signing identity — a real risk if this identity is ever relied on for update-integrity checks, deep-link verification, or any signature-based trust decision.
  2. **Undermines the Google Maps key restriction recommended in C1**: restricting the Maps key to "package name + release SHA-1" only provides real protection if the release SHA-1 is unique to you. Today it is the well-known default debug SHA-1 fingerprint (`38:9C:...` template value), which is publicly documented — so a SHA-1 restriction against it is close to no restriction at all.
- **Remediation:** See `docs/RELEASE_SIGNING.md` for the current, actionable checklist (keystore
  generation command, exact env var / `keystore.properties` field names, verification steps, and
  the follow-up Maps-key SHA-1 restriction step). Summary: generate a real release keystore,
  store it and its passwords outside git in a secrets manager, wire the four credential fields in
  via `android/keystore.properties` (copy from `android/keystore.properties.example`) or
  `ANDROID_RELEASE_*` env vars, then re-run a release build and confirm the `WARNING:` no longer
  prints.

---

## Medium

### M1. iOS Google Maps key: confirmed structural landmine, worse than a simple literal-bake — no placeholder support exists anywhere in the plugin chain

- **What:** Currently `ios/KarachiIjtemaOfflineNav/Info.plist:36-37` and `ios/KarachiIjtemaOfflineNav/AppDelegate.swift:39` both contain only the placeholder string `your_ios_maps_key_here` (from `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` being unset in `.env`) — **no live key is currently baked in.** But the mechanism that will bake a real key in, the next time someone sets `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` in `.env` and runs `expo prebuild`, was verified by reading the actual plugin source (`node_modules/@expo/config-plugins/build/ios/Maps.js`), not assumed:
  ```js
  function setGoogleMapsApiKey(config, { GMSApiKey, ...infoPlist }) {
    const apiKey = getGoogleMapsApiKey(config);           // config.ios.config.googleMapsApiKey — real key
    if (apiKey === null) return infoPlist;
    return { ...infoPlist, GMSApiKey: apiKey };            // literal value written into Info.plist
  }
  function addGoogleMapsAppDelegateInit(src, apiKey) {
    const newSrc = ['#if canImport(GoogleMaps)', `GMSServices.provideAPIKey("${apiKey}")`, '#endif'];
    // literal value spliced directly into AppDelegate.swift *source*
    ...
  }
  ```
  This confirms the key is baked **twice**: once into `Info.plist` (a plist, at least conceptually closer to config) and once as a **literal string in committed Swift source** (`AppDelegate.swift`), which is strictly worse than Android's old manifest-literal problem because source files are more likely to be hand-edited/reviewed/copy-pasted elsewhere. `react-native-maps` itself does not ship its own Expo config plugin for this — the whole mechanism is Expo core's generic Google Maps support (`@expo/config-plugins`), triggered automatically once `react-native-maps` is autolinked (`isReactNativeMapsAutolinked` in `Maps.js` always returns `true`), regardless of whether it's listed in `app.json`'s `plugins` array.
  - There is **no built-in env-var/placeholder-injection mode** in this plugin for either target. This was checked directly, not guessed from docs.
- **Where:** `node_modules/@expo/config-plugins/build/ios/Maps.js` (plugin logic, not project-editable without patching or wrapping), `app.config.js:55-61` (feeds the real key in), `ios/KarachiIjtemaOfflineNav/Info.plist:36-37`, `ios/KarachiIjtemaOfflineNav/AppDelegate.swift:39` (both currently placeholder-only).
- **Risk:** The next real-key `expo prebuild` + commit bakes a live iOS Maps key into two files, one of which is Swift source that's easy to lose track of during later manual edits (as already seen: `AppDelegate.swift` shows as pre-existing uncommitted changes from the user in this session, i.e., it's already being hand-touched).
- **Remediation (mirroring what Android now does, requires new code — not applied in this pass, out of scope per task constraints):**
  1. Info.plist **does** support Xcode build-setting substitution via `$(VAR_NAME)` syntax, resolved at build time — this is the direct iOS analog of Android's `manifestPlaceholders`. Recommended target design:
     - Add a custom Expo config plugin that sets `GMSApiKey = $(GOOGLE_MAPS_IOS_API_KEY)` in Info.plist instead of the literal value (overriding Expo's built-in `withGoogleMapsKey` output the same way C2's recommended plugin overrides Android's).
     - Supply `GOOGLE_MAPS_IOS_API_KEY` as an Xcode build setting via a gitignored `.xcconfig` file (generated from `.env` by a `withDangerousMod`/prebuild step, analogous to `readLocalEnvValue` in `android/app/build.gradle`), or injected by CI as an environment-backed build setting.
  2. `AppDelegate.swift`'s `GMSServices.provideAPIKey("<literal>")` call cannot use `$(VAR)` substitution (that's a plist/build-settings feature, not available in Swift source). The durable fix is to stop letting the plugin splice a literal into source at all, and instead read the key from `Bundle.main.object(forInfoDictionaryKey: "GMSApiKey")` at runtime and pass that string to `GMSServices.provideAPIKey(...)` — i.e., have the custom plugin patch the generated init block to do a Info.plist lookup instead of embedding the literal. This requires overriding Expo's `withGoogleMapsAppDelegate` mod output the same way C2 overrides the Android manifest mod.
  3. This is genuinely new plugin code, not a config toggle — budget real implementation + testing time (a bad regex/mod patch here can break the `expo prebuild` merge-markers Expo relies on, per the `@generated begin/end` comments already visible in `AppDelegate.swift`).

---

## Low

### L1. `SYSTEM_ALERT_WINDOW` permission present in the release manifest, unused in source

- **What:** `android/app/src/main/AndroidManifest.xml:7` declares `android.permission.SYSTEM_ALERT_WINDOW`. This is `src/main`, i.e., it ships in the **release** variant, not just debug (it's also separately declared in `android/app/src/debug/AndroidManifest.xml:4` and `android/app/src/debugOptimized/AndroidManifest.xml:4`, which is redundant given `src/main` already includes it in every variant).
- **Confirmed unused:** grepped `src/` for any overlay/alert-window API usage (`SYSTEM_ALERT_WINDOW`, `Overlay` permission requests, `canDrawOverlays`, etc.) — the only hits were unrelated UI naming (`overlayPlaces`, "Debug overlays" settings copy, `searchOverlayCount`), none of which touch the Android overlay permission API.
- **Risk:** Low — this is almost certainly a standard React Native template artifact (used historically by RN's dev-mode error overlay), not an active feature. It does inflate the permission surface reviewed by users/Play Store's sensitive-permission scanner for no functional benefit.
- **Remediation:** Remove the `<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>` line from `android/app/src/main/AndroidManifest.xml`. If RN's dev-mode overlay needs it in debug builds, keep it only in `android/app/src/debug/AndroidManifest.xml` (already present there) — not `src/main`. **Not applied in this pass** — `AndroidManifest.xml` is explicitly out of scope for edits per this task's constraints.

### L2. Background-location permission strings requested with zero background-location code — confirmed, and the same "prebuild will regenerate it" caveat as C2 applies

- **What:** Before this pass's edit, `ios/KarachiIjtemaOfflineNav/Info.plist` declared both `NSLocationAlwaysUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription`. Confirmed **zero** background-location code path in the app:
  - `grep -rn` across `src/` for `startLocationUpdatesAsync`, `TaskManager`, `registerTaskAsync`, `startGeofencingAsync`, `requestBackgroundPermissionsAsync`, `UIBackgroundModes` — no matches anywhere.
  - The only `expo-location` usage found (`src/services/GPSManagerService.ts`, `src/services/LocationAccessService.ts`, `src/viewmodels/PermissionViewModel.ts`) calls exclusively foreground APIs: `Location.getForegroundPermissionsAsync`, `Location.requestForegroundPermissionsAsync`, `Location.watchPositionAsync`, `Location.getCurrentPositionAsync`, `Location.getLastKnownPositionAsync`.
  - No `UIBackgroundModes` key anywhere in `Info.plist`, `app.json`, or `app.config.js`.
- **Root cause:** `app.json:35-41` configures the `expo-location` plugin with `locationAlwaysPermission` set:
  ```json
  "plugins": [["expo-location", { "locationAlwaysPermission": "Allow Karachi Ijtema Nav to use your location even when the app is in the background." }]]
  ```
  This is what causes Expo's `expo-location` config plugin to inject both `NSLocationAlways...` keys into `Info.plist` at every `expo prebuild` — the same class of "generated file edit gets clobbered on next prebuild" problem as C2.
- **Action taken this pass:** Removed `NSLocationAlwaysUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` from `ios/KarachiIjtemaOfflineNav/Info.plist`, keeping `NSLocationWhenInUseUsageDescription`. This was safe to do because the confirmed-zero background-location usage means the app doesn't need App Store "always" location justification, and requesting it unnecessarily is itself a minor privacy/App-Review-friction risk. See the diff at the end of this document.
- **Not durable on its own:** exactly like C2, this edit will be **silently reverted** the next time someone runs `npx expo prebuild` unless `app.json`'s `expo-location` plugin config also drops `locationAlwaysPermission`. That change was **not made** in this pass — `app.json` was out of scope (task constraints limited edits to `docs/SECURITY_AUDIT.md` and, conditionally, the two `Info.plist` keys). **Follow-up required:** remove the `locationAlwaysPermission` option from the `expo-location` plugin block in `app.json:36-40` so the fix survives prebuilds.

### L3. Partial API key preview logged to console in dev builds

- **What:** `src/services/MapConfigService.ts:30-33` logs `[MapConfig] Android key preview: <first6>...<last4>` via `console.log`, sourced from `maskKey()` in `src/services/MapConfigResolver.ts:55-60` (`trimmed.slice(0, 6) + '...' + trimmed.slice(-4)`).
- **Confirmed scope:** gated behind `if (!__DEV__ || ...) return;` (`src/services/MapConfigService.ts:24`), so this does not run in release/production JS bundles.
- **Risk:** Very low — dev-only, and only a 10-character partial preview (not the full key), useful for debugging "is my key loaded" without exposing the full secret. No action strictly required; noting for completeness since the audit scope included checking whether the key is "logged/printed anywhere."
- **Remediation:** none required. Optional hardening: mask further (e.g. `AIza**...**` with no real characters) if even partial exposure in dev logs is undesirable, but this is discretionary.

---

## Verified clean (re-confirmed, no change needed)

- **`git grep -i "AIza"` across HEAD (`2298b04`)**: only two matches, both in `scripts/test-map-config.ts` — the regex pattern itself (`/AIza[0-9A-Za-z_-]{20,}/`) and a synthetic test fixture key (`'AIza' + 'SyA123456789012345678901234567890'`), not a real key. No live key is present in any git-tracked file at HEAD.
- **`.env` / `.env.example`**: `.env` is untracked (confirmed via `git ls-files .env` → empty, `git log --all -- .env` → empty) and correctly excluded via `.gitignore:12-15` (`.env`, `.env.local`, `.env.*` with `!.env.example` carve-out). `.env.example` contains only placeholder values (`your_android_maps_key_here`, `your_ios_maps_key_here`). Note: `.env` itself is not "clean" — see C1, it holds the still-compromised key as its live value, which is expected/correct for a gitignored local env file, but means C1's rotation is still required.
- **SQLite (`src/services/OfflineMapService.ts`)**: not re-audited in depth this pass (out of the stated task scope), no new information contradicts the prior finding that queries are parameterized.
- **`android/app/build.gradle` key resolution**: `googleMapsApiKey` (line 38-45) is resolved from `System.getenv()` → Gradle property → hand-rolled `.env`/`.env.local` reader (`readLocalEnvValue`, lines 8-30) — never hardcoded, and injected into the manifest only via `manifestPlaceholders = [googleMapsApiKey: googleMapsApiKey]` (line 137), which Android's build system resolves at manifest-merge time, not something that gets `println`'d or logged. Confirmed no `println`/`logger` statements anywhere in `android/app/build.gradle` or `android/build.gradle` reference the key value.
- **CI**: `.github/workflows/` is empty — there is no CI pipeline that could leak secrets via build logs, but also none that enforces `test:map-config` before merge (see C2's risk discussion — this is a gap, not a clean bill of health, noted here for cross-reference).

---

## Summary table

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| C1 | Critical | Leaked Android Maps key is still the live `.env` value — never rotated | Documented, rotation steps provided; **not performed** (requires Google Cloud Console access) |
| C2 | Critical | Android manifest placeholder fix does not survive `expo prebuild --clean` | Documented, root cause proven via plugin source; **not fixed** (needs new custom config plugin) |
| C3 | Critical | Release Android builds signed with debug keystore | Documented; **not fixed** (needs new release keystore + gradle config, infra decision) |
| M1 | Medium | iOS Maps key landmine confirmed structurally, baked into 2 files (Info.plist + AppDelegate.swift source) with zero placeholder support | Documented with concrete target design; **not implemented** (new plugin code, out of scope this pass) |
| L1 | Low | Unused `SYSTEM_ALERT_WINDOW` permission in release manifest | Documented; **not fixed** (AndroidManifest.xml out of scope this pass) |
| L2 | Low | Background-location permission strings requested with zero background-location code | **Fixed this pass** (Info.plist edit) — but not durable without a companion `app.json` fix (documented, not made) |
| L3 | Low | Partial key preview logged in dev builds only | No action needed |

---

## Diff applied this pass

Only `ios/KarachiIjtemaOfflineNav/Info.plist` was touched, and only these two keys were removed (isolated from the user's pre-existing uncommitted changes to the same file):

```diff
-    <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
-    <string>Allow $(PRODUCT_NAME) to access your location</string>
-    <key>NSLocationAlwaysUsageDescription</key>
-    <string>Allow Karachi Ijtema Nav to use your location even when the app is in the background.</string>
     <key>NSLocationWhenInUseUsageDescription</key>
     <string>Allow $(PRODUCT_NAME) to access your location</string>
```

No other file was modified by this audit. `AndroidManifest.xml`, `android/app/build.gradle`, `app.json`, `app.config.js`, and `AppDelegate.swift` were read and analyzed but intentionally left unchanged per task constraints — see C2, C3, M1, and L1 for the specific follow-up changes each would need, and L2 for the companion `app.json` change needed to make the Info.plist edit durable.

---

## Follow-up pass — 2026-07-18: C3 structural fix, gitignore hardening, tracked-secret re-scan

This pass implemented the repo-side (non-secret, non-cloud-console) remediations that were previously only documented:

- **C3 (release signing structure) — implemented.** `android/app/build.gradle` now defines a real `release` `signingConfig` that resolves `storeFile` / `storePassword` / `keyAlias` / `keyPassword` from, in order: (1) a gitignored `android/keystore.properties` file, or (2) `ANDROID_RELEASE_STORE_FILE` / `ANDROID_RELEASE_STORE_PASSWORD` / `ANDROID_RELEASE_KEY_ALIAS` / `ANDROID_RELEASE_KEY_PASSWORD` environment variables. `buildTypes.release.signingConfig` now points at this new config **when credentials are present**; if none are configured yet, it prints a `WARNING:` during Gradle configuration and falls back to `signingConfigs.debug` so `./gradlew assembleRelease` / `npm run android:release:apk` keep working out of the box for contributors who haven't set up production signing. `buildTypes.debug` was not touched. Verified via `cd android && ANDROID_HOME=<sdk path> ./gradlew tasks --dry-run`, both without and with a test `keystore.properties` present — `BUILD SUCCESSFUL` in both cases, confirming the Gradle syntax is valid and both branches (fallback and real-config) evaluate cleanly.
  - No keystore file was generated (requires a passphrase only the developer should choose). To create one:
    ```
    keytool -genkeypair -v -keystore release.keystore -alias karachi-ijtema-release \
      -keyalg RSA -keysize 2048 -validity 10000
    ```
    Place the resulting `release.keystore` under `android/app/` (gitignored — see below), then copy `android/keystore.properties.example` to `android/keystore.properties` and fill in the real `storeFile`/passwords/alias, or export the four `ANDROID_RELEASE_*` env vars instead. Once configured, get the release SHA-1 via `keytool -list -v -keystore release.keystore` to restrict the rotated Maps key from C1 as originally planned.
- **`.gitignore` hardened**: added `*.keystore`, `*.jks`, `release.keystore`, and `android/keystore.properties` (root `.gitignore`). `android/app/debug.keystore` remains tracked as before (already-tracked files are unaffected by new ignore patterns) — it holds only the well-known public Android SDK debug credentials, not a project secret.
- **`android/keystore.properties.example`** added (tracked, placeholder values only, `CHANGE_ME` for all passwords) documenting the file a developer creates locally at the gitignored `android/keystore.properties` path.
- **Tracked-secret re-scan (read-only, `git grep`)**: searched all git-tracked files for `AIza`, case-insensitive `apikey`, and `GMSApiKey`. Result: **clean** — every match is either a placeholder (`your_ios_maps_key_here`), an env-var reference (`process.env.EXPO_PUBLIC_GOOGLE_MAPS_*_API_KEY`, `System.getenv(...)`), a Gradle property name/manifest placeholder token (`googleMapsApiKey`, `${googleMapsApiKey}`), or test code in `scripts/test-map-config.ts` (the detection regex itself, plus a synthetic non-functional fixture key). No real key value is present in any git-tracked file. This reconfirms the "Verified clean" finding above at the current HEAD.
- **iOS `PROVIDER_GOOGLE` usage confirmed**: `src/views/screens/HomeScreen.tsx` and `src/views/screens/NavigationScreen.tsx` both gate `PROVIDER_GOOGLE` behind `Platform.OS === 'android' && hasGoogleMapsKey`; iOS never receives `PROVIDER_GOOGLE` and therefore renders with `react-native-maps`' default provider (Apple Maps), not the Google Maps SDK. This confirms M1's Info.plist `GMSApiKey` placeholder and `AppDelegate.swift`'s `GMSServices.provideAPIKey(...)` call are currently dead config from Expo's automatic Google Maps plugin (triggered by `react-native-maps` autolinking regardless of whether Google Maps is actually rendered) — not something the app needs today. No `ios/` files were changed in this pass; this is a finding/recommendation only, per task scope, pending explicit confirmation from the app owner that Google Maps is intentionally never used on iOS before anyone removes the iOS `googleMaps.apiKey` config in `app.config.js`.
- **Not touched in this pass** (unchanged from the state described above): C1 (key rotation — requires Google Cloud Console access), C2 (custom Expo config plugin for a durable Android manifest placeholder), M1 (iOS plugin fix), L1 (`SYSTEM_ALERT_WINDOW` manifest cleanup). `.env` and all `ios/` files were left untouched.
